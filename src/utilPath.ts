import path from "path";
import * as fs from "node:fs";
import ts from "typescript";

export function isTargetFile(
  patterns: RegExp[],
  excludePatterns: RegExp[],
  fullPath: string,
): boolean {
  if (!patterns.some((pattern) => pattern.test(fullPath))) {
    return false;
  }
  if (excludePatterns.some((pattern) => pattern.test(fullPath))) {
    return false;
  }

  return true;
}

export function* walkSourceFile(
  currentDirPath: string,
  patterns: RegExp[],
  excludePatterns: RegExp[],
): Generator<{ sourceFile: ts.SourceFile; program: ts.Program }> {
  const files = fs.readdirSync(currentDirPath);
  for (const name of files) {
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
        const host = ts.createCompilerHost({});
        host.getSourceFile = (name) => {
          if (ts.sys.resolvePath(name) === ts.sys.resolvePath(filePath)) {
            return sourceFile;
          }
          return undefined;
        };
        const program = ts.createProgram(
          [filePath],
          {
            target: ts.ScriptTarget.Latest,
            module: ts.ModuleKind.CommonJS,
          },
          host,
        );
        yield { sourceFile, program };
      }
    } else if (stat.isDirectory()) {
      yield* walkSourceFile(filePath, patterns, excludePatterns);
    }
  }
}
