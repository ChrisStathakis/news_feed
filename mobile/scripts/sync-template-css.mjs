// Regenerate src/engine/render/styles.ts from the desktop template.
// Usage: npm run sync:css
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "..", "newspaper", "templates", "styles.css");
const target = resolve(root, "src", "engine", "render", "styles.ts");

const css = readFileSync(source, "utf8")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

writeFileSync(
  target,
  `/* Auto-copied from newspaper/templates/styles.css. Run: npm run sync:css */\r\nexport const NEWSPAPER_CSS = String.raw\`${css}\`;\r\n`,
  "utf8",
);
console.log(`Synced ${css.length} bytes -> ${target}`);
