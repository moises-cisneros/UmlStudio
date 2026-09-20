import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import type { UMLModel } from "@umlstudio/core";
import type { SpringBootInheritanceStrategy } from "@umlstudio/core/export";
import { validateModel, countClassNodes } from "./modelSchema.js";
import {
  fetchStarterZip,
  InitializrError,
  CANONICAL_JAVA_VERSION,
  DEFAULT_PLATFORM_VERSION,
} from "./initializr/client.js";
import { enrichScaffoldZip, buildFallbackZip } from "./zip/enrich.js";
import { generateProjectFiles } from "./generator/index.js";
import { DEFAULT_SERVER_PORT, DEFAULT_DB_PORT } from "./generator/config/emitter.js";
import {
  generateOpenApiSpec,
  generateOpenApiYaml,
  generatePostmanCollection,
} from "./openapi/index.js";

/** Default port for the codegen microservice */
export const CODEGEN_DEFAULT_PORT = 8002;

export interface CodegenRequestOptions {
  groupId?: string | undefined;
  artifactId?: string | undefined;
  packageName?: string | undefined;
  javaVersion?: number | undefined;
  platformVersion?: string | undefined;
  dbHost?: string | undefined;
  dbPort?: number | undefined;
  dbName?: string | undefined;
  dbUser?: string | undefined;
  dbPassword?: string | undefined;
  serverPort?: number | undefined;
  inheritance?: SpringBootInheritanceStrategy | undefined;
  selection?: string[] | undefined;
  useFallbackOnly?: boolean | undefined;
}

export interface CodegenRequestBody {
  model: UMLModel;
  options?: CodegenRequestOptions | undefined;
}

/** Builds the codegen Hono application (routes only, no sockets). */
export function buildCodegenApp(): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Accept"],
      exposeHeaders: ["Content-Disposition", "X-Generator-Mode"],
    }),
  );

  app.get("/health", (c) =>
    c.json({ status: "ok", service: "codegen", version: "0.1.0" }),
  );

  /** Preview endpoint: returns files summary and warnings without building the zip. */
  app.post("/api/preview", async (c) => {
    let body: CodegenRequestBody;
    try {
      body = await c.req.json<CodegenRequestBody>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body?.model) {
      return c.json({ error: "Missing required 'model' in request body" }, 400);
    }

    const validation = validateModel(body.model);
    if (!validation.valid) {
      return c.json(
        { error: "Model validation failed against canonical v4 schema", details: validation.errors },
        422,
      );
    }

    const classCount = countClassNodes(body.model);
    if (classCount === 0) {
      return c.json(
        { error: "Diagram contains no class nodes; at least 1 class is required to generate a backend" },
        422,
      );
    }

    const opts = body.options ?? {};
    const groupId = opts.groupId || "com.example";
    const artifactId = (opts.artifactId || body.model.title || "demo")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/gi, "-");
    const packageName = opts.packageName || `${groupId}.${artifactId.replace(/[^a-z0-9_]/gi, "")}`;

    const project = generateProjectFiles(body.model, {
      packageName,
      selection: opts.selection,
      inheritance: opts.inheritance ?? "JOINED",
      dbHost: opts.dbHost ?? "localhost",
      dbPort: opts.dbPort ?? DEFAULT_DB_PORT,
      dbName: opts.dbName ?? "umlstudio_demo",
      dbUser: opts.dbUser ?? "postgres",
      dbPassword: opts.dbPassword ?? "postgres",
      serverPort: opts.serverPort ?? DEFAULT_SERVER_PORT,
    });

    return c.json({
      summary: project.summary,
      warnings: project.warnings,
      files: project.files.map((f) => f.path),
    });
  });

  /** Generation endpoint: generates layered backend and returns ZIP buffer. */
  const handleGenerate = async (c: import("hono").Context) => {
    let body: CodegenRequestBody;
    try {
      body = await c.req.json<CodegenRequestBody>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body?.model) {
      return c.json({ error: "Missing required 'model' in request body" }, 400);
    }

    const validation = validateModel(body.model);
    if (!validation.valid) {
      return c.json(
        { error: "Model validation failed against canonical v4 schema", details: validation.errors },
        422,
      );
    }

    const classCount = countClassNodes(body.model);
    if (classCount === 0) {
      return c.json(
        { error: "Diagram contains no class nodes; at least 1 class is required to generate a backend" },
        422,
      );
    }

    const opts = body.options ?? {};
    const groupId = opts.groupId || "com.example";
    const artifactId = (opts.artifactId || body.model.title || "demo")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/gi, "-");
    const packageName = opts.packageName || `${groupId}.${artifactId.replace(/[^a-z0-9_]/gi, "")}`;
    const javaVersion = opts.javaVersion ?? CANONICAL_JAVA_VERSION;
    const platformVersion = opts.platformVersion ?? DEFAULT_PLATFORM_VERSION;

    const project = generateProjectFiles(body.model, {
      packageName,
      selection: opts.selection,
      inheritance: opts.inheritance ?? "JOINED",
      dbHost: opts.dbHost ?? "localhost",
      dbPort: opts.dbPort ?? DEFAULT_DB_PORT,
      dbName: opts.dbName ?? "umlstudio_demo",
      dbUser: opts.dbUser ?? "postgres",
      dbPassword: opts.dbPassword ?? "postgres",
      serverPort: opts.serverPort ?? DEFAULT_SERVER_PORT,
    });

    const fallbackCoords = {
      groupId,
      artifactId,
      packageName,
      javaVersion,
      platformVersion,
    };

    let zipBuffer: Uint8Array;
    let generatorMode: "initializr" | "fallback" = "initializr";

    if (opts.useFallbackOnly) {
      zipBuffer = await buildFallbackZip(project.files, fallbackCoords);
      generatorMode = "fallback";
    } else {
      try {
        const scaffold = await fetchStarterZip({
          groupId,
          artifactId,
          packageName,
          javaVersion,
          platformVersion,
        });
        zipBuffer = await enrichScaffoldZip(scaffold, project.files);
      } catch (err) {
        // FA-01: Fallback offline if Initializr is unreachable or times out
        if (err instanceof InitializrError || (err instanceof Error && err.name === "AbortError")) {
          zipBuffer = await buildFallbackZip(project.files, fallbackCoords);
          generatorMode = "fallback";
        } else {
          throw err;
        }
      }
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/zip");
    responseHeaders.set("Content-Disposition", `attachment; filename="${artifactId}.zip"`);
    responseHeaders.set("X-Generator-Mode", generatorMode);

    return new Response(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: responseHeaders,
    });
  };

  app.post("/api/generate", handleGenerate);
  app.post("/generate", handleGenerate);

  /** OpenAPI JSON endpoint */
  const handleOpenApiJson = async (c: import("hono").Context) => {
    let body: CodegenRequestBody;
    try {
      body = await c.req.json<CodegenRequestBody>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body?.model) {
      return c.json({ error: "Missing required 'model' in request body" }, 400);
    }

    const validation = validateModel(body.model);
    if (!validation.valid) {
      return c.json(
        { error: "Model validation failed against canonical v4 schema", details: validation.errors },
        422,
      );
    }

    const classCount = countClassNodes(body.model);
    if (classCount === 0) {
      return c.json(
        { error: "Diagram contains no class nodes; at least 1 class is required" },
        422,
      );
    }

    const opts = body.options ?? {};
    const spec = generateOpenApiSpec(body.model, {
      title: body.model.title,
      serverPort: opts.serverPort ?? DEFAULT_SERVER_PORT,
      packageName: opts.packageName,
      selection: opts.selection,
      inheritance: opts.inheritance,
    });

    return c.json(spec);
  };

  app.post("/api/openapi/json", handleOpenApiJson);
  app.post("/openapi/json", handleOpenApiJson);

  /** OpenAPI YAML endpoint */
  const handleOpenApiYaml = async (c: import("hono").Context) => {
    let body: CodegenRequestBody;
    try {
      body = await c.req.json<CodegenRequestBody>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body?.model) {
      return c.json({ error: "Missing required 'model' in request body" }, 400);
    }

    const validation = validateModel(body.model);
    if (!validation.valid) {
      return c.json(
        { error: "Model validation failed against canonical v4 schema", details: validation.errors },
        422,
      );
    }

    const classCount = countClassNodes(body.model);
    if (classCount === 0) {
      return c.json(
        { error: "Diagram contains no class nodes; at least 1 class is required" },
        422,
      );
    }

    const opts = body.options ?? {};
    const spec = generateOpenApiSpec(body.model, {
      title: body.model.title,
      serverPort: opts.serverPort ?? DEFAULT_SERVER_PORT,
      packageName: opts.packageName,
      selection: opts.selection,
      inheritance: opts.inheritance,
    });

    const yaml = generateOpenApiYaml(spec);
    return c.text(yaml, 200, { "Content-Type": "text/yaml; charset=utf-8" });
  };

  app.post("/api/openapi/yaml", handleOpenApiYaml);
  app.post("/openapi/yaml", handleOpenApiYaml);

  /** Postman Collection v2.1.0 endpoint. */
  const handleOpenApiPostman = async (c: import("hono").Context) => {
    let body: CodegenRequestBody;
    try {
      body = await c.req.json<CodegenRequestBody>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body?.model) {
      return c.json({ error: "Missing required 'model' in request body" }, 400);
    }

    const validation = validateModel(body.model);
    if (!validation.valid) {
      return c.json(
        { error: "Model validation failed against canonical v4 schema", details: validation.errors },
        422,
      );
    }

    const classCount = countClassNodes(body.model);
    if (classCount === 0) {
      return c.json(
        { error: "Diagram contains no class nodes; at least 1 class is required" },
        422,
      );
    }

    const opts = body.options ?? {};
    const spec = generateOpenApiSpec(body.model, {
      title: body.model.title,
      serverPort: opts.serverPort ?? DEFAULT_SERVER_PORT,
      packageName: opts.packageName,
      selection: opts.selection,
      inheritance: opts.inheritance,
    });

    const collection = generatePostmanCollection(spec);
    return c.json(collection);
  };

  app.post("/api/openapi/postman", handleOpenApiPostman);
  app.post("/openapi/postman", handleOpenApiPostman);

  app.notFound((c) =>
    c.json({ error: "Not found", path: c.req.path }, 404),
  );

  return app;
}

/** Starts the codegen HTTP server on the given port. */
export function startCodegenServer(port: number = CODEGEN_DEFAULT_PORT): void {
  const app = buildCodegenApp();
  serve({ fetch: app.fetch, port }, (info) => {
    process.stdout.write(
      `codegen listening on http://${info.address}:${info.port}\n`,
    );
  });
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("server.js") ||
    process.argv[1].endsWith("server.ts"));

if (invokedDirectly) {
  const port = Number(process.env.PORT ?? CODEGEN_DEFAULT_PORT);
  startCodegenServer(Number.isFinite(port) ? port : CODEGEN_DEFAULT_PORT);
}
