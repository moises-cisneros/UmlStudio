import { readFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import type { SpringBootGeneratedFile } from "@umlstudio/core/export";
import { CANONICAL_JAVA_VERSION, DEFAULT_PLATFORM_VERSION } from "../initializr/client.js";

export interface FallbackCoordinates {
  groupId: string;
  artifactId: string;
  packageName: string;
  javaVersion?: number | undefined;
  platformVersion?: string | undefined;
}

const FALLBACK_TOKENS: Record<string, keyof Required<FallbackCoordinates>> = {
  "@@GROUP_ID@@": "groupId",
  "@@ARTIFACT_ID@@": "artifactId",
  "@@PACKAGE_NAME@@": "packageName",
};

function templateDir(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "templates",
    "fallback",
  );
}

async function readTemplate(relative: string): Promise<string> {
  return readFile(join(templateDir(), relative), "utf8");
}

/** Applies coordinate tokens to a fallback template text. */
export function applyFallbackTokens(
  text: string,
  coords: FallbackCoordinates,
): string {
  const javaVersion = coords.javaVersion ?? CANONICAL_JAVA_VERSION;
  const platformVersion = coords.platformVersion ?? DEFAULT_PLATFORM_VERSION;
  let result = text;
  for (const [token, key] of Object.entries(FALLBACK_TOKENS)) {
    result = result.split(token).join(coords[key]);
  }
  return result
    .split("@@JAVA_VERSION@@")
    .join(String(javaVersion))
    .split("@@BOOT_VERSION@@")
    .join(platformVersion);
}

/**
 * Merges generated layers, config and SQL into an official scaffold buffer.
 * Existing scaffold entries (notably `application.properties`) are replaced
 * by the generated `application.yml`.
 */
export async function enrichScaffoldZip(
  scaffold: Uint8Array,
  files: SpringBootGeneratedFile[],
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(scaffold);
  zip.remove("src/main/resources/application.properties");
  zip.remove("src/main/resources/application.yaml");
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/**
 * Builds a compilable ZIP from the vendored FA-01 fallback when Initializr
 * is unreachable: wrapper + tokenized pom + entry point + generated files.
 */
export async function buildFallbackZip(
  files: SpringBootGeneratedFile[],
  coords: FallbackCoordinates,
): Promise<Uint8Array> {
  const zip = new JSZip();
  const packagePath = coords.packageName.replace(/\./g, "/");
  const [pom, entryPoint, mvnw, mvnwCmd, wrapperProps, fallbackNote] =
    await Promise.all([
      readTemplate("pom.xml"),
      readTemplate("Application.java"),
      readTemplate("mvnw"),
      readTemplate("mvnw.cmd"),
      readTemplate(posix.join(".mvn", "wrapper", "maven-wrapper.properties")),
      readTemplate("FALLBACK.txt"),
    ]);
  zip.file("pom.xml", applyFallbackTokens(pom, coords));
  zip.file(
    `src/main/java/${packagePath}/Application.java`,
    applyFallbackTokens(entryPoint, coords),
  );
  zip.file("mvnw", applyFallbackTokens(mvnw, coords), {
    unixPermissions: 0o755,
  });
  zip.file("mvnw.cmd", applyFallbackTokens(mvnwCmd, coords));
  zip.file(
    ".mvn/wrapper/maven-wrapper.properties",
    applyFallbackTokens(wrapperProps, coords),
  );
  zip.file("FALLBACK.txt", fallbackNote);
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
