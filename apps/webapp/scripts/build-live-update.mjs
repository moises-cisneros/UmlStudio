import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distDir = path.join(webappDir, "dist");
const outDir = path.join(webappDir, "live-updates-dist");

const version = JSON.parse(
  fs.readFileSync(path.join(webappDir, "package.json"), "utf8"),
).version;
const minNativeVersion =
  process.env.CAPGO_MIN_NATIVE_VERSION || `${version.split(".")[0]}.0.0`;

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error(
    "build-live-update: dist/ is not built; run the webapp build first.",
  );
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const capgo = (args) =>
  execFileSync("pnpm", ["exec", "capgo", ...args], {
    cwd: webappDir,
    encoding: "utf8",
  });

const zipName = `umlstudio-${version}.zip`;
const zipPath = path.join(outDir, zipName);

const { checksum: plainChecksum } = JSON.parse(
  capgo([
    "bundle",
    "zip",
    "--path",
    distDir,
    "--name",
    zipPath,
    "--json",
    "--no-code-check",
    "--key-v2",
  ]),
);

let checksum = plainChecksum;
let sessionKey;

const privateKey = process.env.CAPGO_PRIVATE_KEY;
if (privateKey) {
  if (!process.env.CAPGO_PUBLIC_KEY) {
    console.error(
      "build-live-update: CAPGO_PRIVATE_KEY set but CAPGO_PUBLIC_KEY is not.",
    );
    process.exit(1);
  }
  const encrypted = JSON.parse(
    capgo([
      "bundle",
      "encrypt",
      zipPath,
      plainChecksum,
      "--key-data",
      privateKey,
      "--json",
    ]),
  );
  checksum = encrypted.checksum;
  sessionKey = encrypted.ivSessionKey;
  fs.rmSync(zipPath);
  fs.renameSync(`${zipPath}_encrypted.zip`, zipPath);
} else {
  console.warn(
    "build-live-update: CAPGO_PRIVATE_KEY unset — emitting a PLAIN bundle. " +
      "An app built with CAPGO_PUBLIC_KEY will reject it; do not use in production.",
  );
}

const manifest = {
  version,
  url: `https://umlstudio.dev/live-updates/${zipName}`,
  checksum,
  minNativeVersion,
  ...(sessionKey ? { sessionKey } : {}),
};
fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

console.log(
  `build-live-update: ${zipName} (${sessionKey ? "encrypted+signed" : "PLAIN"}), ` +
    `minNativeVersion ${minNativeVersion}`,
);
