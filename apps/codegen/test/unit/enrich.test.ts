import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { enrichScaffoldZip, buildFallbackZip, applyFallbackTokens } from "../../src/zip/enrich.js"

describe("enrich & fallback ZIP unit tests (CU-06)", () => {
  it("applies fallback coordinate tokens correctly", () => {
    const template =
      "package @@PACKAGE_NAME@@; // @@GROUP_ID@@:@@ARTIFACT_ID@@ (Java @@JAVA_VERSION@@, Boot @@BOOT_VERSION@@)"
    const substituted = applyFallbackTokens(template, {
      groupId: "org.umlstudio",
      artifactId: "sample-app",
      packageName: "org.umlstudio.sample",
      javaVersion: 17,
      platformVersion: "3.4.0",
    })

    expect(substituted).toBe(
      "package org.umlstudio.sample; // org.umlstudio:sample-app (Java 17, Boot 3.4.0)"
    )
  })

  it("builds a valid fallback ZIP with maven wrappers and generated files", async () => {
    const sampleFiles = [
      {
        path: "src/main/java/com/example/demo/entity/TestEntity.java",
        content: "@Entity public class TestEntity {}",
      },
      {
        path: "src/main/resources/application.yml",
        content: "server:\n  port: 9000\n",
      },
    ]

    const zipBuffer = await buildFallbackZip(sampleFiles, {
      groupId: "com.example",
      artifactId: "demo",
      packageName: "com.example.demo",
    })

    const zip = await JSZip.loadAsync(zipBuffer)
    expect(zip.file("pom.xml")).toBeDefined()
    expect(zip.file("mvnw")).toBeDefined()
    expect(zip.file("mvnw.cmd")).toBeDefined()
    expect(zip.file(".mvn/wrapper/maven-wrapper.properties")).toBeDefined()
    expect(zip.file("FALLBACK.txt")).toBeDefined()
    expect(zip.file("src/main/java/com/example/demo/Application.java")).toBeDefined()
    expect(zip.file("src/main/java/com/example/demo/entity/TestEntity.java")).toBeDefined()
    expect(zip.file("src/main/resources/application.yml")).toBeDefined()

    const pomContent = await zip.file("pom.xml")?.async("string")
    expect(pomContent).toContain("<groupId>com.example</groupId>")
    expect(pomContent).toContain("<artifactId>demo</artifactId>")
  })

  it("enriches scaffold ZIP by replacing application.properties with application.yml", async () => {
    const baseZip = new JSZip()
    baseZip.file("pom.xml", "<project></project>")
    baseZip.file("src/main/resources/application.properties", "foo=bar")
    const baseBuffer = await baseZip.generateAsync({ type: "uint8array" })

    const generatedFiles = [
      {
        path: "src/main/resources/application.yml",
        content: "server:\n  port: 9000\n",
      },
      {
        path: "src/main/java/com/example/demo/entity/Usuario.java",
        content: "@Entity public class Usuario {}",
      },
    ]

    const enrichedBuffer = await enrichScaffoldZip(baseBuffer, generatedFiles)
    const resultZip = await JSZip.loadAsync(enrichedBuffer)

    expect(resultZip.file("src/main/resources/application.properties")).toBeNull()
    expect(resultZip.file("src/main/resources/application.yml")).toBeDefined()
    expect(resultZip.file("src/main/java/com/example/demo/entity/Usuario.java")).toBeDefined()
  })
})
