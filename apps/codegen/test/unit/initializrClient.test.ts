import { describe, it, expect, vi } from "vitest";
import {
  buildStarterZipUrl,
  fetchStarterZip,
  InitializrError,
  CANONICAL_JAVA_VERSION,
  DEFAULT_PLATFORM_VERSION,
} from "../../src/initializr/client.js";

describe("initializrClient unit tests (CU-06)", () => {
  it("builds canonical starter.zip URL with valid parameters", () => {
    const url = buildStarterZipUrl({
      groupId: "com.example",
      artifactId: "tienda-online",
      packageName: "com.example.tienda",
    });

    expect(url).toContain("https://start.spring.io/starter.zip");
    expect(url).toContain("type=maven-project");
    expect(url).toContain("language=java");
    expect(url).toContain(`platformVersion=${DEFAULT_PLATFORM_VERSION}`);
    expect(url).toContain(`jvmVersion=${CANONICAL_JAVA_VERSION}`);
    expect(url).toContain("groupId=com.example");
    expect(url).toContain("artifactId=tienda-online");
    expect(url).toContain("packageName=com.example.tienda");
    expect(url).toContain("dependencies=lombok%2Cweb%2Cdata-jpa%2Cpostgresql%2Cvalidation%2Cdevtools");
  });

  it("throws InitializrError when platformVersion is not Spring Boot 3.x", () => {
    expect(() =>
      buildStarterZipUrl({
        groupId: "com.example",
        artifactId: "demo",
        packageName: "com.example.demo",
        platformVersion: "2.7.5",
      }),
    ).toThrow(InitializrError);

    expect(() =>
      buildStarterZipUrl({
        groupId: "com.example",
        artifactId: "demo",
        packageName: "com.example.demo",
        platformVersion: "2.7.5",
      }),
    ).toThrow(/must stay on the Spring Boot 3.x line/);
  });

  it("throws InitializrError when javaVersion is not 17", () => {
    expect(() =>
      buildStarterZipUrl({
        groupId: "com.example",
        artifactId: "demo",
        packageName: "com.example.demo",
        javaVersion: 21,
      }),
    ).toThrow(InitializrError);

    expect(() =>
      buildStarterZipUrl({
        groupId: "com.example",
        artifactId: "demo",
        packageName: "com.example.demo",
        javaVersion: 11,
      }),
    ).toThrow(/javaVersion must be 17/);
  });

  it("fetches starter.zip successfully with mocked fetch", async () => {
    const dummyBytes = new Uint8Array([1, 2, 3, 4]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(dummyBytes.buffer),
    });

    const result = await fetchStarterZip({
      groupId: "com.example",
      artifactId: "demo",
      packageName: "com.example.demo",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(dummyBytes);
  });

  it("retries on transient network errors and throws InitializrError after maxRetries", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network disconnect"));

    await expect(
      fetchStarterZip({
        groupId: "com.example",
        artifactId: "demo",
        packageName: "com.example.demo",
        maxRetries: 1,
        fetchImpl: mockFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow(InitializrError);

    // Initial attempt + 1 retry = 2 calls
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
