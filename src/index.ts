import ts from "typescript";
import * as fs from "node:fs";
import * as path from "node:path";
import { type FnName, type LineIdxRange, type FilePath } from "./utilAst.ts";
import { isTargetFile } from "./utilPath.ts";

function isOnlyStmtInBlock(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current && !ts.isStatement(current)) {
    current = current.parent;
  }

  if (!current) {
    return false;
  }

  const stmt = current as ts.Statement;
  const parent = stmt.parent;
  if (!parent) {
    return false;
  }

  if (
    ts.isBlock(parent) ||
    ts.isSourceFile(parent) ||
    ts.isCaseClause(parent) ||
    ts.isDefaultClause(parent)
  ) {
    const statements = (parent as any).statements as ts.NodeArray<ts.Statement>;
    if (statements && statements.length === 1) {
      return true;
    }
  } else if (ts.isIfStatement(parent)) {
    if (parent.thenStatement === stmt) return true;
    if (parent.elseStatement === stmt) return true;
  } else if (ts.isIterationStatement(parent, false)) {
    if ((parent as any).statement === stmt) return true;
  }

  return false;
}

class ForbiddenCallVisitor {
  callers: string[];
  fnLineRange: Array<[FnName, LineIdxRange]> = [];
  sourceFile: ts.SourceFile;

  constructor(callers: string[], sourceFile: ts.SourceFile) {
    this.callers = callers;
    this.sourceFile = sourceFile;
  }

  visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const func = node.expression;
      if (ts.isPropertyAccessExpression(func) || ts.isIdentifier(func)) {
        const text = func.getText(this.sourceFile);
        if (this.callers.includes(text)) {
          if (!isOnlyStmtInBlock(node)) {
            const start = this.sourceFile.getLineAndCharacterOfPosition(
              node.getStart(this.sourceFile),
            ).line;
            const end = this.sourceFile.getLineAndCharacterOfPosition(
              node.getEnd(),
            ).line;
            this.fnLineRange.push([text, [start, end]]);
            return; // Found and recorded, don't walk its children if not needed. But we might want to anyway, let's just return to skip overlap.
          }
        }
      }
    }
    ts.forEachChild(node, (child) => this.visit(child));
  }
}

interface LineColRange {
  lineStart: number;
  colStart: number;
  lineEnd: number;
  colEnd: number;
}

interface StartEnd {
  start: number;
  end: number;
}

class ForbiddenPropertyVisitor {
  properties: string[];
  fnLineRange: Array<[FnName, LineColRange]> = [];
  sourceFile: ts.SourceFile;

  constructor(properties: string[], sourceFile: ts.SourceFile) {
    this.properties = properties;
    this.sourceFile = sourceFile;
  }

  visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node)) {
      const text = node.name.getText(this.sourceFile);
      if (this.properties.includes(text)) {
        const { line: lineStart, character: colStart } =
          this.sourceFile.getLineAndCharacterOfPosition(
            node.getStart(this.sourceFile),
          );
        const { line: lineEnd, character: colEnd } =
          this.sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        this.fnLineRange.push([text, { lineStart, colStart, lineEnd, colEnd }]);
        return; // Found and recorded, don't walk its children if not needed. But we might want to anyway, let's just return to skip overlap.
      }
    }
    ts.forEachChild(node, (child) => this.visit(child));
  }
}

/**
 * delete lines
 */
function deleteLines(
  pathToLines: Map<FilePath, Array<[FnName, LineIdxRange]>>,
) {
  for (const [filePath, fnLineRange] of pathToLines.entries()) {
    const text = fs.readFileSync(filePath, "utf-8");
    const lines = text.split(/\r?\n/);

    const linesNew: string[] = [];
    const fnNames: FnName[] = [];
    let start = 0;

    for (const [fnName, [deleteFrom, deleteTo]] of fnLineRange) {
      fnNames.push(fnName);
      const end = deleteFrom - 1;
      for (let item = start; item <= end; item++) {
        linesNew.push(lines[item]);
      }
      start = deleteTo + 1;
    }

    if (start < lines.length) {
      const end = lines.length - 1;
      for (let item = start; item <= end; item++) {
        linesNew.push(lines[item]);
      }
    }

    fs.writeFileSync(filePath, linesNew.join("\n") + "\n", "utf-8");
    console.log(`deleted from ${filePath}:`);
    console.log(`${fnNames.join("\n")}\n`);
  }
  console.log(`Process completed. Total files modified: ${pathToLines.size}`);
}

/**
 * convert single col per line to multiple col per line
 */
function convertToLineColsRange(
  fnLineRange: Array<[FnName, LineColRange]>,
): Map<number, StartEnd[]> {
  function upsert(
    lineToCols: Map<number, StartEnd[]>,
    cols: StartEnd,
    lineIdx: number,
  ) {
    const found = lineToCols.get(lineIdx);
    if (found) {
      found.push(cols);
    } else {
      lineToCols.set(lineIdx, [cols]);
    }
  }

  const lineToCols: Map<number, StartEnd[]> = new Map();
  for (const [_, { lineStart, colStart, lineEnd, colEnd }] of fnLineRange) {
    const isMultiLine = lineEnd > lineStart;
    if (isMultiLine) {
      for (let i = lineStart; i <= lineEnd; i++) {
        const start =
          i !== lineStart && i !== lineEnd ? 0 : i === lineStart ? colStart : 0;
        const end =
          i !== lineStart && i !== lineEnd
            ? Infinity
            : i === lineEnd
              ? colEnd
              : Infinity;

        upsert(lineToCols, { start, end }, i);
      }
    } else {
      const start = colStart;
      const end = colEnd;

      upsert(lineToCols, { start, end }, lineStart);
    }
  }

  return lineToCols;
}

/**
 * delete cols
 */
function deleteCols(value: string, colsToDel: StartEnd[]): string {
  let start = 0;

  const valueNew: string[] = [];
  for (const { start: deleteFrom, end: deleteTo } of colsToDel) {
    const end = deleteFrom - 1;
    const inner = value.substring(start, end + 1);
    valueNew.push(inner);
    start = (deleteTo === Infinity ? value.length - 1 : deleteTo) + 1;
  }

  if (start < value.length) {
    const end = value.length - 1;
    const inner = value.substring(start, end);
    valueNew.push(inner);
  }

  return valueNew.join("");
}

/**
 * delete ranges
 */
function deleteRanges(
  pathToRanges: Map<FilePath, Array<[FnName, LineColRange]>>,
) {
  for (const [filePath, fnLineRange] of pathToRanges.entries()) {
    const text = fs.readFileSync(filePath, "utf-8");
    const lines = text.split(/\r?\n/);

    const lineToCols: Map<number, StartEnd[]> =
      convertToLineColsRange(fnLineRange);

    const linesNew: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cols = lineToCols.get(i);
      if (cols) {
        const lineNew = deleteCols(line, cols);
        if (lineNew.trim().length > 0) {
          linesNew.push(lineNew);
        }
      } else {
        linesNew.push(line);
      }
    }

    fs.writeFileSync(filePath, linesNew.join("\n") + "\n", "utf-8");
    console.log(`deleted from ${filePath}:`);
    // console.log(`${fnNames.join('\n')}\n`);
  }
  console.log(`Process completed. Total files modified: ${pathToRanges.size}`);
}

/**
 * delete callers
 * but not delete caller if caller is only stmt in block
 */
export function deleteCallers(
  rootDir: string,
  patterns: RegExp[],
  excludePatterns: RegExp[],
  callers: string[],
) {
  const pathToLines = new Map<FilePath, Array<[FnName, LineIdxRange]>>();

  function walkSync(currentDirPath: string) {
    fs.readdirSync(currentDirPath).forEach((name: string) => {
      const filePath = path.join(currentDirPath, name);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        if (isTargetFile(patterns, excludePatterns, filePath)) {
          const sourceFile = ts.createSourceFile(
            filePath,
            fs.readFileSync(filePath).toString(),
            ts.ScriptTarget.Latest,
            true,
          );
          const visitor = new ForbiddenCallVisitor(callers, sourceFile);
          visitor.visit(sourceFile);

          if (visitor.fnLineRange.length > 0) {
            pathToLines.set(filePath, visitor.fnLineRange);
          }
        }
      } else if (stat.isDirectory()) {
        walkSync(filePath);
      }
    });
  }

  walkSync(rootDir);
  deleteLines(pathToLines);
}

/**
 * delete properties
 */
export function deleteProperties(
  rootDir: string,
  patterns: RegExp[],
  excludePatterns: RegExp[],
  properties: string[],
) {
  const pathToRanges = new Map<FilePath, Array<[FnName, LineColRange]>>();

  function walkSync(currentDirPath: string) {
    fs.readdirSync(currentDirPath).forEach((name: string) => {
      const filePath = path.join(currentDirPath, name);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        if (isTargetFile(patterns, excludePatterns, filePath)) {
          const sourceFile = ts.createSourceFile(
            filePath,
            fs.readFileSync(filePath).toString(),
            ts.ScriptTarget.Latest,
            true,
          );
          const visitor = new ForbiddenPropertyVisitor(properties, sourceFile);
          visitor.visit(sourceFile);

          if (visitor.fnLineRange.length > 0) {
            pathToRanges.set(filePath, visitor.fnLineRange);
          }
        }
      } else if (stat.isDirectory()) {
        walkSync(filePath);
      }
    });
  }

  walkSync(rootDir);
  deleteRanges(pathToRanges);
}
