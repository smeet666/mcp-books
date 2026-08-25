import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/sources/client.ts"],
  format: ["esm"],
  target: "node24",
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  // Left external so a consumer resolves their own copies from node_modules.
  external: [
    "@modelcontextprotocol/sdk",
    "zod",
    "mcp-archiveorg",
    "mcp-libraryofcongress",
    "mcp-databnf",
  ],
  // src/index.ts opens with the shebang and esbuild keeps it on the entry
  // point; a global banner would also stamp it onto the library entry.
});
