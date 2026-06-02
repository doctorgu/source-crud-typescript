import { defineConfig } from "tsup";

export default defineConfig({
  // 1. Specify your CLI and Library entry points
  entry: ["src/index.ts", "src/cli.ts"],

  // 2. Output ES Modules
  format: ["esm"],

  platform: "node",

  external: ["typescript"],

  // 3. Generate TypeScript declaration types
  dts: true,

  // 4. Clean the /dist folder before every build
  clean: true,

  // 5. Safely inject the Node.js execution header
  banner: {
    js: "#!/usr/bin/env node",
  },
});
