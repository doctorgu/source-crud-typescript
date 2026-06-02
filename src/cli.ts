import { parseArgs } from "node:util";
import {
  Command,
  type CommandType,
  type ConfigDeleteCallers,
  type ConfigDeleteProperties,
} from "./types";
import * as fs from "node:fs";
import YAML from "yaml";
import { deleteProperties, deleteCallers } from ".";

function main() {
  // Configure the expected arguments
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: {
        type: "string",
        short: "c",
      },
      "root-dir": {
        type: "string",
      },
      patterns: {
        type: "string",
        multiple: true,
      },
      "exclude-patterns": {
        type: "string",
        multiple: true,
      },
      properties: {
        type: "string",
        multiple: true,
      },
      callers: {
        type: "string",
        multiple: true,
      },
    },
  });

  const command: CommandType = positionals[0] as CommandType;
  if (!command) {
    console.log("command is required.");
    return;
  }

  switch (command) {
    case Command.Help:
      console.log("Usage: npx source-crud-typescript <command> [options]");
      console.log("Commands:");
      console.log("  help                      Show this help message");
      console.log("  delete-properties         Delete properties");
      console.log("  delete-callers            Delete callers");
      console.log("Options:");
      console.log("  delete-properties specific options");
      console.log("    --config                Config file");
      console.log("    --root-dir              Root directory");
      console.log("    --patterns              Patterns to include");
      console.log("    --exclude-patterns      Patterns to exclude");
      console.log("    --properties            Properties to delete");
      console.log("  delete-callers specific options");
      console.log("    --config                Config file");
      console.log("    --root-dir              Root directory");
      console.log("    --patterns              Patterns to include");
      console.log("    --exclude-patterns      Patterns to exclude");
      console.log("    --callers               Callers to delete");
      break;
    case Command.DeleteProperties:
    case Command.DeleteCallers:
      const configPath = values.config;

      switch (command) {
        case Command.DeleteProperties:
          if (configPath) {
            const configContent = fs.readFileSync(configPath, "utf-8");
            const config: ConfigDeleteProperties = YAML.parse(configContent);

            if (config["root-dir"]) {
              values["root-dir"] = config["root-dir"];
            }
            if (config.patterns) {
              values.patterns = config.patterns;
            }
            if (config["exclude-patterns"]) {
              values["exclude-patterns"] = config["exclude-patterns"];
            }
            if (config.properties) {
              values.properties = config.properties;
            }
          }
          break;
        case Command.DeleteCallers:
          if (configPath) {
            const configContent = fs.readFileSync(configPath, "utf-8");
            const config: ConfigDeleteCallers = YAML.parse(configContent);

            if (config["root-dir"]) {
              values["root-dir"] = config["root-dir"];
            }
            if (config.patterns) {
              values.patterns = config.patterns;
            }
            if (config["exclude-patterns"]) {
              values["exclude-patterns"] = config["exclude-patterns"];
            }
            if (config.callers) {
              values.callers = config.callers;
            }
          }
          break;
      }

      const rootDir = values["root-dir"];
      if (!rootDir) {
        console.log("--root-dir is required");
        return;
      }

      const patterns = (values.patterns ?? []).map(
        (pattern) => new RegExp(pattern),
      );
      const excludePatterns = (values["exclude-patterns"] ?? []).map(
        (pattern) => new RegExp(pattern),
      );

      switch (command) {
        case Command.DeleteProperties:
          if (!values.properties) {
            console.log("--properties is required");
            return;
          }
          deleteProperties(
            rootDir,
            patterns,
            excludePatterns,
            values.properties,
          );
          break;
        case Command.DeleteCallers:
          if (!values.callers) {
            console.log("--callers is required");
            return;
          }
          deleteCallers(rootDir, patterns, excludePatterns, values.callers);
          break;
      }
  }
}

main();

/*
npm run build
npm link source-crud-typescript
npm login
export NPM_TOKEN=""
npm publish
*/
