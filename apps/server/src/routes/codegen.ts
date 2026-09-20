import { Hono, type Context } from "hono";
import JSZip from "jszip";
import type { UMLModel } from "@umlstudio/core";
import {
  exportSpringBootFull,
  generateMavenScaffold,
  type SpringBootInheritanceStrategy,
} from "@umlstudio/core/export";
import type { AppEnv } from "../http/env.js";

export function mountCodegenRoutes(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.post("/codegen/spring-boot", async (c: Context<AppEnv>) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const model = body?.["model"] as UMLModel | undefined;
    if (!model) {
      return c.json({ error: "Model is required" }, 400);
    }

    const classNodes = (model.nodes ?? []).filter(
      (n) => !n.type || n.type === "class",
    );
    if (classNodes.length === 0) {
      return c.json({ error: "Diagram must contain at least one class" }, 422);
    }

    const opts = (body["options"] ?? {}) as Record<string, unknown>;
    const groupId = (opts["groupId"] as string) || "com.example";
    const artifactId = (
      (opts["artifactId"] as string) ||
      model.title ||
      "demo"
    )
      .toLowerCase()
      .replace(/[^a-z0-9_-]/gi, "-");
    const cleanArt = artifactId.replace(/[^a-z0-9_]/gi, "");
    const packageName =
      (opts["packageName"] as string) || `${groupId}.${cleanArt}`;
    const serverPort = (opts["serverPort"] as number) || 9000;
    const dbHost = (opts["dbHost"] as string) || "localhost";
    const dbPort = (opts["dbPort"] as number) || 5432;
    const dbName = (opts["dbName"] as string) || "umlstudio_demo";
    const dbUser = (opts["dbUser"] as string) || "postgres";
    const dbPassword = (opts["dbPassword"] as string) || "postgres";
    const inheritance =
      (opts["inheritance"] as SpringBootInheritanceStrategy) || "JOINED";

    // 1. Generate 5 CRUD layers from core
    const fullExport = await exportSpringBootFull(model, {
      packageName,
      inheritance,
    });

    // 2. Build application.yml on port 9000
    const appYml = [
      "spring:",
      "  datasource:",
      `    url: jdbc:postgresql://${dbHost}:${dbPort}/${dbName}`,
      `    username: ${dbUser}`,
      `    password: ${dbPassword}`,
      "    driver-class-name: org.postgresql.Driver",
      "  jpa:",
      "    hibernate:",
      "      ddl-auto: update",
      "    show-sql: true",
      "    properties:",
      "      hibernate:",
      "        dialect: org.hibernate.dialect.PostgreSQLDialect",
      "        format_sql: true",
      "server:",
      `  port: ${serverPort}`,
      "",
    ].join("\n");

    // 3. Try official Spring Initializr API
    let zip: JSZip | null = null;
    const initializrUrl = `https://start.spring.io/starter.zip?type=maven-project&language=java&platformVersion=3.4.0&packaging=jar&configurationFileFormat=yaml&jvmVersion=17&groupId=${encodeURIComponent(groupId)}&artifactId=${encodeURIComponent(artifactId)}&packageName=${encodeURIComponent(packageName)}&dependencies=lombok,web,data-jpa,postgresql,devtools`;

    try {
      const resp = await fetch(initializrUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/zip" },
      });
      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer();
        zip = await JSZip.loadAsync(arrayBuf);
      }
    } catch {
      // Offline fallback
    }

    // 4. Complete fallback scaffold if Initializr was unreachable
    if (!zip) {
      zip = new JSZip();
      const scaffoldFiles = generateMavenScaffold({
        groupId,
        artifactId,
        packageName,
        javaVersion: 17,
        platformVersion: "3.4.0",
      });
      for (const f of scaffoldFiles) {
        zip.file(f.path, f.content);
      }
    }

    // 5. Inject application.yml and 5 layers
    let rootPrefix = "";
    const firstKey = Object.keys(zip.files)[0];
    if (firstKey && firstKey.startsWith(`${artifactId}/`)) {
      rootPrefix = `${artifactId}/`;
    }

    zip.remove(`${rootPrefix}src/main/resources/application.properties`);
    zip.remove(`${rootPrefix}src/main/resources/application.yaml`);
    zip.file(`${rootPrefix}src/main/resources/application.yml`, appYml);

    for (const f of fullExport.files) {
      zip.file(`${rootPrefix}${f.path}`, f.content);
    }

    const zipBuffer = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    });

    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", `attachment; filename="${artifactId}.zip"`);
    return new Response(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${artifactId}.zip"`,
      },
    });
  });

  const forwardToCodegen = async (
    c: Context<AppEnv>,
    subPath: "json" | "yaml" | "postman",
    contentType: string,
  ) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const codegenUrl =
      process.env["CODEGEN_SERVICE_URL"] || "http://127.0.0.1:8002";
    try {
      const resp = await fetch(`${codegenUrl}/api/openapi/${subPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        return c.json(errJson, resp.status as 400 | 404 | 422 | 500);
      }

      if (subPath === "yaml") {
        const text = await resp.text();
        return c.text(text, 200, { "Content-Type": contentType });
      }

      const json = await resp.json();
      return c.json(json);
    } catch (err) {
      return c.json(
        {
          error: "Codegen microservice unavailable",
          details: err instanceof Error ? err.message : String(err),
        },
        503,
      );
    }
  };

  router.post("/codegen/openapi/json", (c) =>
    forwardToCodegen(c, "json", "application/json"),
  );
  router.post("/codegen/openapi/yaml", (c) =>
    forwardToCodegen(c, "yaml", "text/yaml; charset=utf-8"),
  );
  router.post("/codegen/openapi/postman", (c) =>
    forwardToCodegen(c, "postman", "application/json"),
  );

  return router;
}
