/**
 * Spring Initializr client.
 *
 * Fetches the official `starter.zip` scaffold with pinned parameters
 * (Boot 3.x, Java 17). The generator MUST NOT hand-assemble pom.xml/mvnw;
 * this client is the only source of Maven scaffolds on the happy path.
 */

export const INITIALIZR_BASE_URL = "https://start.spring.io";

/** Default Spring Boot line for generated projects. */
export const DEFAULT_PLATFORM_VERSION = "3.4.0";

/** Canonical Java version for generated projects. */
export const CANONICAL_JAVA_VERSION = 17;

/** Starter dependencies (validation is required for Bean Validation DTOs). */
export const DEFAULT_DEPENDENCIES = [
  "lombok",
  "web",
  "data-jpa",
  "postgresql",
  "validation",
  "devtools",
];

export const STARTER_TIMEOUT_MS = 10_000;
export const STARTER_MAX_RETRIES = 2;
export const STARTER_RETRY_BASE_MS = 500;

export interface StarterZipOptions {
  groupId: string;
  artifactId: string;
  packageName: string;
  /** Spring Boot version override; must stay on the 3.x line. */
  platformVersion?: string | undefined;
  /** Java version; only 17 is supported. */
  javaVersion?: number | undefined;
  dependencies?: string[] | undefined;
  timeoutMs?: number | undefined;
  maxRetries?: number | undefined;
  /** Injectable fetch for mocked tests. */
  fetchImpl?: typeof fetch | undefined;
}

export class InitializrError extends Error {
  readonly code: "HTTP" | "TIMEOUT" | "NETWORK" | "INVALID";
  readonly status?: number | undefined;
  constructor(code: "HTTP" | "TIMEOUT" | "NETWORK" | "INVALID", message: string, status?: number) {
    super(message);
    this.name = "InitializrError";
    this.code = code;
    this.status = status;
  }
}

/** Builds the pinned `starter.zip` URL for the given coordinates. */
export function buildStarterZipUrl(options: StarterZipOptions): string {
  const platformVersion = options.platformVersion ?? DEFAULT_PLATFORM_VERSION;
  if (!/^3\.\d+\.\d+$/.test(platformVersion)) {
    throw new InitializrError(
      "INVALID",
      `platformVersion must stay on the Spring Boot 3.x line (received: ${platformVersion})`,
    );
  }
  const javaVersion = options.javaVersion ?? CANONICAL_JAVA_VERSION;
  if (javaVersion !== CANONICAL_JAVA_VERSION) {
    throw new InitializrError(
      "INVALID",
      `javaVersion must be ${CANONICAL_JAVA_VERSION} (received: ${javaVersion})`,
    );
  }
  const params = new URLSearchParams({
    type: "maven-project",
    language: "java",
    platformVersion,
    packaging: "jar",
    configurationFileFormat: "yaml",
    jvmVersion: String(javaVersion),
    groupId: options.groupId,
    artifactId: options.artifactId,
    packageName: options.packageName,
    dependencies: (options.dependencies ?? DEFAULT_DEPENDENCIES).join(","),
  });
  return `${INITIALIZR_BASE_URL}/starter.zip?${params.toString()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Downloads the official scaffold ZIP buffer.
 * Retries transient failures with exponential backoff, then throws.
 */
export async function fetchStarterZip(
  options: StarterZipOptions,
): Promise<Uint8Array> {
  const url = buildStarterZipUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? STARTER_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? STARTER_MAX_RETRIES;
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= maxRetries) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "application/zip" },
      });
      if (!response.ok) {
        throw new InitializrError(
          "HTTP",
          `Initializr responded with status ${response.status}`,
          response.status,
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (error instanceof InitializrError && error.code === "INVALID") {
        throw error;
      }
      const isAbort =
        error instanceof Error && error.name === "AbortError";
      if (attempt >= maxRetries) {
        if (isAbort) {
          throw new InitializrError(
            "TIMEOUT",
            `Initializr request timed out after ${timeoutMs}ms (${maxRetries + 1} attempts)`,
          );
        }
        if (error instanceof InitializrError) {
          throw error;
        }
        throw new InitializrError(
          "NETWORK",
          `Initializr request failed after ${maxRetries + 1} attempts: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await sleep(STARTER_RETRY_BASE_MS * 2 ** attempt);
      attempt += 1;
    }
  }
  throw new InitializrError(
    "NETWORK",
    `Initializr request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
