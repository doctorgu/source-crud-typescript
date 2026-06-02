export interface ConfigDeleteProperties {
  "root-dir": string;
  patterns: string[];
  "exclude-patterns": string[];
  properties: string[];
}

export interface ConfigDeleteCallers {
  "root-dir": string;
  patterns: string[];
  "exclude-patterns": string[];
  callers: string[];
}

export const Command = {
  Help: "help",
  DeleteProperties: "delete-properties",
  DeleteCallers: "delete-callers",
} as const;
export type CommandType = (typeof Command)[keyof typeof Command];
