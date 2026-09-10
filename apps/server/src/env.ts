import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

let contents = "";
try {
  contents = readFileSync(".env", "utf8");
} catch {}

if (contents) {
  const parsed = parseEnv(contents);
  for (const key of Object.keys(parsed)) {
    if (process.env[key] === undefined) process.env[key] = parsed[key];
  }
}
