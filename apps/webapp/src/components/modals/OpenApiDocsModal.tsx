import React, { useState, useMemo } from "react"
import { toast } from "react-toastify"
import { Button } from "@umlstudio/ui/components/button"
import { DialogFooter } from "@umlstudio/ui/components/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@umlstudio/ui/components/tabs"
import { useEditorContext, useModalContext } from "@/contexts"
import { useFileDownload } from "@/hooks/useFileDownload"
import { useTranslation } from "@/i18n"
import { HomeDialogContent } from "./HomeDialog"

interface UmlNodeData {
  name?: string
  attributes?: { id: string; name: string }[]
  methods?: { id: string; name: string }[]
}

interface OpenApiDocsModalProps {
  onClose?: () => void
  defaultTab?: "swagger" | "spec" | "postman"
}

interface EndpointDef {
  id: string
  tag: string
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string
  summary: string
  description: string
  parameters?: { name: string; in: string; type: string; required: boolean; description: string }[]
  requestBody?: { description: string; sample: string; schema: Record<string, unknown> }
  responses: { code: string; description: string; sample?: string }[]
}

export const OpenApiDocsModal: React.FC<OpenApiDocsModalProps> = ({
  onClose,
  defaultTab = "swagger",
}) => {
  const { t } = useTranslation()
  const { editor } = useEditorContext()
  const { closeModal } = useModalContext()
  const downloadFile = useFileDownload()

  const [activeTab, setActiveTab] = useState<string>(defaultTab)
  const [specFormat, setSpecFormat] = useState<"json" | "yaml">("json")
  const [expandedEndpoints, setExpandedEndpoints] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState(false)
  const [simulatedResponses, setSimulatedResponses] = useState<Record<string, string>>({})

  const model = editor?.model
  const modelTitle = model?.title || "UmlStudio API"
  const artifactId = modelTitle.toLowerCase().replace(/[^a-z0-9_-]/gi, "-") || "demo-api"

  const classNodes = useMemo(() => {
    return (model?.nodes ?? []).filter((n) => !n.type || n.type === "class")
  }, [model?.nodes])

  // Generate endpoints definition derived from the current UML model
  const endpoints = useMemo<EndpointDef[]>(() => {
    const list: EndpointDef[] = []

    for (const node of classNodes) {
      const data = node.data as UmlNodeData | undefined
      const className = String(data?.name || "Entity")
      const route = className
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(s|x|z|ch|sh)$/i, "$1es")
        .concat(/s$/i.test(className) ? "" : "s")

      const attributes: { name: string; type: string }[] = (data?.attributes ?? []).map(
        (a: { id?: string; name?: string }) => {
          const rawName = String(a.name || "")
          const parts = rawName.replace(/^([+\-#~]\s*)?/, "").split(":")
          return {
            name: parts[0]?.trim() || "field",
            type: parts[1]?.trim() || "String",
          }
        }
      )

      const sampleReqObj: Record<string, unknown> = {}
      const sampleResObj: Record<string, unknown> = { id: 1 }

      for (const attr of attributes) {
        if (attr.name.toLowerCase() === "id") continue
        const lowType = attr.type.toLowerCase()
        if (lowType.includes("int") || lowType.includes("long")) {
          sampleReqObj[attr.name] = 10
          sampleResObj[attr.name] = 10
        } else if (lowType.includes("double") || lowType.includes("float")) {
          sampleReqObj[attr.name] = 99.5
          sampleResObj[attr.name] = 99.5
        } else if (lowType.includes("bool")) {
          sampleReqObj[attr.name] = true
          sampleResObj[attr.name] = true
        } else {
          sampleReqObj[attr.name] = `sample_${attr.name}`
          sampleResObj[attr.name] = `sample_${attr.name}`
        }
      }

      const sampleReqJson = JSON.stringify(sampleReqObj, null, 2)
      const sampleResJson = JSON.stringify(sampleResObj, null, 2)
      const sampleListJson = JSON.stringify([sampleResObj], null, 2)

      // GET /api/{route}
      list.push({
        id: `${className}-getAll`,
        tag: className,
        method: "GET",
        path: `/api/${route}`,
        summary: `List all ${className} items`,
        description: `Retrieves a paginated or complete list of ${className} instances from the database.`,
        responses: [
          { code: "200", description: "Successful list retrieval", sample: sampleListJson },
        ],
      })

      // POST /api/{route}
      list.push({
        id: `${className}-create`,
        tag: className,
        method: "POST",
        path: `/api/${route}`,
        summary: `Create a new ${className}`,
        description: `Persists a new ${className} entity with validated request body properties.`,
        requestBody: {
          description: `Payload for ${className}`,
          sample: sampleReqJson,
          schema: sampleReqObj,
        },
        responses: [
          { code: "201", description: "Created successfully", sample: sampleResJson },
          { code: "400", description: "Validation error or invalid request payload" },
        ],
      })

      // GET /api/{route}/{id}
      list.push({
        id: `${className}-getById`,
        tag: className,
        method: "GET",
        path: `/api/${route}/{id}`,
        summary: `Get ${className} by ID`,
        description: `Retrieves a single ${className} instance identified by its primary key.`,
        parameters: [
          {
            name: "id",
            in: "path",
            type: "integer (int64)",
            required: true,
            description: `Unique numerical ID of the ${className}`,
          },
        ],
        responses: [
          { code: "200", description: "Entity found", sample: sampleResJson },
          { code: "404", description: "Entity with specified ID not found" },
        ],
      })

      // PUT /api/{route}/{id}
      list.push({
        id: `${className}-update`,
        tag: className,
        method: "PUT",
        path: `/api/${route}/{id}`,
        summary: `Update ${className} by ID`,
        description: `Updates attributes of an existing ${className} entity.`,
        parameters: [
          {
            name: "id",
            in: "path",
            type: "integer (int64)",
            required: true,
            description: `Unique numerical ID of the ${className}`,
          },
        ],
        requestBody: {
          description: `Updated payload for ${className}`,
          sample: sampleReqJson,
          schema: sampleReqObj,
        },
        responses: [
          { code: "200", description: "Entity updated successfully", sample: sampleResJson },
          { code: "400", description: "Validation failed" },
          { code: "404", description: "Entity not found" },
        ],
      })

      // DELETE /api/{route}/{id}
      list.push({
        id: `${className}-delete`,
        tag: className,
        method: "DELETE",
        path: `/api/${route}/{id}`,
        summary: `Delete ${className} by ID`,
        description: `Removes the ${className} entity from the database.`,
        parameters: [
          {
            name: "id",
            in: "path",
            type: "integer (int64)",
            required: true,
            description: `Unique numerical ID of the ${className}`,
          },
        ],
        responses: [
          { code: "204", description: "Entity successfully deleted (No Content)" },
          { code: "404", description: "Entity not found" },
        ],
      })
    }

    return list
  }, [classNodes])

  // Group endpoints by Tag
  const groupedEndpoints = useMemo(() => {
    const groups: Record<string, EndpointDef[]> = {}
    for (const ep of endpoints) {
      if (!groups[ep.tag]) groups[ep.tag] = []
      groups[ep.tag]!.push(ep)
    }
    return groups
  }, [endpoints])

  // Generate full OpenAPI 3.0.3 JSON
  const openApiJsonString = useMemo(() => {
    const schemas: Record<string, unknown> = {}
    const paths: Record<string, unknown> = {}

    for (const node of classNodes) {
      const data = node.data as UmlNodeData | undefined
      const className = String(data?.name || "Entity")
      const route = className
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(s|x|z|ch|sh)$/i, "$1es")
        .concat(/s$/i.test(className) ? "" : "s")

      const reqProps: Record<string, unknown> = {}
      const resProps: Record<string, unknown> = {
        id: { type: "integer", format: "int64", example: 1 },
      }

      for (const a of data?.attributes ?? []) {
        const rawName = String(a.name || "")
        const parts = rawName.replace(/^([+\-#~]\s*)?/, "").split(":")
        const name = parts[0]?.trim() || "field"
        if (name.toLowerCase() === "id") continue
        reqProps[name] = { type: "string", example: `sample_${name}` }
        resProps[name] = { type: "string", example: `sample_${name}` }
      }

      schemas[`${className}Request`] = {
        type: "object",
        properties: reqProps,
      }
      schemas[`${className}Response`] = {
        type: "object",
        properties: resProps,
        required: ["id"],
      }

      paths[`/api/${route}`] = {
        get: {
          tags: [className],
          summary: `List all ${className} items`,
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: `#/components/schemas/${className}Response` },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: [className],
          summary: `Create a new ${className}`,
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: `#/components/schemas/${className}Request` } },
            },
          },
          responses: {
            "201": {
              description: "Created",
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${className}Response` },
                },
              },
            },
          },
        },
      }

      paths[`/api/${route}/{id}`] = {
        get: {
          tags: [className],
          summary: `Get ${className} by ID`,
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer", format: "int64" },
            },
          ],
          responses: {
            "200": {
              description: "Found",
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${className}Response` },
                },
              },
            },
            "404": { description: "Not Found" },
          },
        },
        put: {
          tags: [className],
          summary: `Update ${className} by ID`,
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer", format: "int64" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: `#/components/schemas/${className}Request` } },
            },
          },
          responses: {
            "200": {
              description: "Updated",
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${className}Response` },
                },
              },
            },
            "404": { description: "Not Found" },
          },
        },
        delete: {
          tags: [className],
          summary: `Delete ${className} by ID`,
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer", format: "int64" },
            },
          ],
          responses: {
            "204": { description: "No Content" },
            "404": { description: "Not Found" },
          },
        },
      }
    }

    const doc = {
      openapi: "3.0.3",
      info: {
        title: modelTitle,
        version: "1.0.0",
        description: `REST API specification generated by UmlStudio from Class Diagram.`,
      },
      servers: [
        {
          url: "http://localhost:9000",
          description: "Local Spring Boot 3.x Server",
        },
      ],
      paths,
      components: {
        schemas,
      },
    }

    return JSON.stringify(doc, null, 2)
  }, [classNodes, modelTitle])

  // Generate YAML representation
  const openApiYamlString = useMemo(() => {
    try {
      const obj = JSON.parse(openApiJsonString)
      const lines: string[] = [
        'openapi: "3.0.3"',
        "info:",
        `  title: "${obj.info.title}"`,
        '  version: "1.0.0"',
        `  description: "${obj.info.description}"`,
        "servers:",
        "  - url: http://localhost:9000",
        "    description: Local Spring Boot 3.x Server",
        "paths:",
      ]
      for (const [pathStr, pathItem] of Object.entries(
        obj.paths as Record<string, Record<string, unknown>>
      )) {
        lines.push(`  "${pathStr}":`)
        for (const [m, op] of Object.entries(pathItem)) {
          const o = op as { summary: string; tags: string[] }
          lines.push(`    ${m}:`)
          lines.push(`      summary: "${o.summary}"`)
          lines.push(`      tags:`)
          lines.push(`        - "${o.tags?.[0] || "General"}"`)
        }
      }
      return lines.join("\n") + "\n"
    } catch {
      return "openapi: 3.0.3\n"
    }
  }, [openApiJsonString])

  // Generate Postman Collection v2.1
  const postmanCollectionString = useMemo(() => {
    const items = Object.entries(groupedEndpoints).map(([tag, eps]) => ({
      name: tag,
      description: `CRUD operations for ${tag}`,
      item: eps.map((ep) => ({
        name: ep.summary,
        request: {
          method: ep.method,
          header: [{ key: "Accept", value: "application/json" }],
          url: {
            raw: `{{baseUrl}}${ep.path.replace(/\{id\}/g, ":id")}`,
            host: ["{{baseUrl}}"],
            path: ep.path.split("/").filter(Boolean),
          },
          ...(ep.requestBody
            ? {
              body: {
                mode: "raw",
                raw: ep.requestBody.sample,
                options: { raw: { language: "json" } },
              },
            }
            : {}),
        },
        response: [],
      })),
    }))

    const collection = {
      info: {
        name: `${modelTitle} - Postman Collection`,
        description: "Generated by UmlStudio OpenAPI Exporter",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: items,
      variable: [
        {
          key: "baseUrl",
          value: "http://localhost:9000",
          type: "string",
        },
      ],
    }

    return JSON.stringify(collection, null, 2)
  }, [groupedEndpoints, modelTitle])

  const toggleEndpoint = (id: string) => {
    setExpandedEndpoints((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      toast.success(t.openapi?.copiedToast || "Copied to clipboard!")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy to clipboard")
    }
  }

  const handleDownload = (format: "json" | "yaml" | "postman") => {
    if (format === "json") {
      downloadFile({
        file: new Blob([openApiJsonString], { type: "application/json" }),
        fileName: `${artifactId}-openapi.json`,
      })
      toast.success(t.openapi.downloadSuccessJson)
    } else if (format === "yaml") {
      downloadFile({
        file: new Blob([openApiYamlString], { type: "text/yaml" }),
        fileName: `${artifactId}-openapi.yaml`,
      })
      toast.success(t.openapi.downloadSuccessYaml)
    } else {
      downloadFile({
        file: new Blob([postmanCollectionString], { type: "application/json" }),
        fileName: `${artifactId}-postman.json`,
      })
      toast.success(t.openapi.downloadSuccessPostman)
    }
  }

  const handleSimulate = (epId: string, sampleResponse?: string) => {
    setSimulatedResponses((prev) => ({
      ...prev,
      [epId]: sampleResponse || '{\n  "status": 200,\n  "message": "Simulated call OK"\n}',
    }))
  }

  const handleClose = () => {
    onClose?.()
    closeModal()
  }

  const getMethodBadgeClass = (method: string) => {
    switch (method) {
      case "GET":
        return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
      case "POST":
        return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
      case "PUT":
        return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
      case "DELETE":
        return "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
      default:
        return "bg-muted text-foreground border-border"
    }
  }

  return (
    <HomeDialogContent testId="openapi-docs-modal" className="w-full max-w-4xl text-foreground">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary border border-primary/20">
              OpenAPI 3.0.3
            </span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              v1.0.0
            </span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              :9000
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t.openapi?.modalSubtitle ||
              "Explore interactive Swagger endpoints, inspect schemas and export contracts."}
          </p>
        </div>

        {/* Quick download actions */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDownload("json")}
            className="h-8 text-xs font-medium"
            title="Download OpenAPI 3.0 in JSON format"
          >
            JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDownload("yaml")}
            className="h-8 text-xs font-medium"
            title="Download OpenAPI 3.0 in YAML format"
          >
            YAML
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDownload("postman")}
            className="h-8 text-xs font-medium text-primary border-primary/40 hover:bg-primary/10"
            title="Download Postman Collection v2.1"
          >
            Postman
          </Button>
        </div>
      </div>

      {classNodes.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {t.openapi?.noClassesMessage || "The diagram has no class nodes to document."}
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="swagger">{t.openapi?.tabSwagger || "Swagger UI"}</TabsTrigger>
            <TabsTrigger value="spec">{t.openapi?.tabSpec || "OpenAPI Contract"}</TabsTrigger>
            <TabsTrigger value="postman">{t.openapi?.tabPostman || "Postman v2.1"}</TabsTrigger>
          </TabsList>

          {/* TAB 1: Interactive Swagger UI */}
          <TabsContent
            value="swagger"
            className="mt-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1"
          >
            {Object.entries(groupedEndpoints).map(([tag, tagEndpoints]) => (
              <div key={tag} className="rounded-lg border border-border bg-card/50 p-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-border/60 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{tag}</span>
                    <span className="text-xs text-muted-foreground">
                      ({tagEndpoints.length} endpoints)
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {tagEndpoints.map((ep) => {
                    const isExpanded = Boolean(expandedEndpoints[ep.id])
                    const simResponse = simulatedResponses[ep.id]

                    return (
                      <div
                        key={ep.id}
                        className="rounded-md border border-border/80 bg-background overflow-hidden transition-colors"
                      >
                        {/* Endpoint summary bar */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleEndpoint(ep.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              toggleEndpoint(ep.id)
                            }
                          }}
                          className="flex items-center justify-between gap-3 p-2.5 cursor-pointer hover:bg-muted/40"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`rounded border px-2 py-0.5 font-mono text-[11px] font-bold ${getMethodBadgeClass(
                                ep.method
                              )}`}
                            >
                              {ep.method}
                            </span>
                            <span className="font-mono text-xs font-medium text-foreground truncate">
                              {ep.path}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                            {ep.summary}
                          </span>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="border-t border-border bg-muted/20 p-3 flex flex-col gap-3 text-xs">
                            <p className="text-muted-foreground">{ep.description}</p>

                            {/* Parameters */}
                            {ep.parameters && ep.parameters.length > 0 && (
                              <div>
                                <span className="font-semibold text-foreground">Parameters:</span>
                                <div className="mt-1 flex flex-col gap-1">
                                  {ep.parameters.map((p) => (
                                    <div
                                      key={p.name}
                                      className="flex items-center gap-2 rounded bg-background p-1.5 border border-border font-mono text-[11px]"
                                    >
                                      <span className="font-bold text-primary">{p.name}</span>
                                      <span className="text-muted-foreground">({p.in})</span>
                                      <span className="text-xs text-muted-foreground">
                                        - {p.type} {p.required && "(required)"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Request payload */}
                            {ep.requestBody && (
                              <div>
                                <span className="font-semibold text-foreground">
                                  Request Body (JSON):
                                </span>
                                <pre className="mt-1 rounded bg-background p-2 border border-border font-mono text-[11px] text-foreground overflow-x-auto">
                                  {ep.requestBody.sample}
                                </pre>
                              </div>
                            )}

                            {/* Expected Responses */}
                            <div>
                              <span className="font-semibold text-foreground">Responses:</span>
                              <div className="mt-1 flex flex-col gap-1.5">
                                {ep.responses.map((r) => (
                                  <div
                                    key={r.code}
                                    className="flex flex-col gap-1 rounded bg-background p-2 border border-border"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`font-mono font-bold text-[11px] ${r.code.startsWith("2")
                                            ? "text-emerald-500"
                                            : r.code.startsWith("4")
                                              ? "text-amber-500"
                                              : "text-rose-500"
                                          }`}
                                      >
                                        {r.code}
                                      </span>
                                      <span className="text-muted-foreground">{r.description}</span>
                                    </div>
                                    {r.sample && (
                                      <pre className="rounded bg-muted/40 p-1.5 font-mono text-[10px] text-foreground overflow-x-auto">
                                        {r.sample}
                                      </pre>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Try it out simulation */}
                            <div className="pt-2 flex flex-col gap-2 border-t border-border">
                              <div className="flex items-center justify-between">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleSimulate(ep.id, ep.responses[0]?.sample)}
                                  className="h-7 text-xs"
                                >
                                  {t.openapi?.simulateBtn || "Simulate Call"}
                                </Button>
                                {simResponse && (
                                  <span className="text-[11px] text-emerald-500 font-medium">
                                    Simulated Response 200 OK
                                  </span>
                                )}
                              </div>
                              {simResponse && (
                                <pre className="rounded bg-background p-2 border border-emerald-500/30 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 overflow-x-auto">
                                  {simResponse}
                                </pre>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* TAB 2: OpenAPI Contract Spec (JSON / YAML) */}
          <TabsContent value="spec" className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={specFormat === "json" ? "default" : "outline"}
                  onClick={() => setSpecFormat("json")}
                  className="h-7 text-xs"
                >
                  JSON
                </Button>
                <Button
                  size="sm"
                  variant={specFormat === "yaml" ? "default" : "outline"}
                  onClick={() => setSpecFormat("yaml")}
                  className="h-7 text-xs"
                >
                  YAML
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleCopy(specFormat === "json" ? openApiJsonString : openApiYamlString)
                  }
                  className="h-7 text-xs"
                >
                  {copied ? t.openapi?.copiedBtn || "Copied!" : t.openapi?.copyBtn || "Copy"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(specFormat)}
                  className="h-7 text-xs"
                >
                  {t.openapi?.downloadBtn || "Download"}
                </Button>
              </div>
            </div>

            <pre className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs text-foreground select-all">
              {specFormat === "json" ? openApiJsonString : openApiYamlString}
            </pre>
          </TabsContent>

          {/* TAB 3: Postman Collection v2.1 */}
          <TabsContent value="postman" className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t.openapi?.postmanHelp ||
                  "Postman Collection v2.1 with pre-configured headers, baseURL variable and request payloads."}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(postmanCollectionString)}
                  className="h-7 text-xs"
                >
                  {copied ? t.openapi?.copiedBtn || "Copied!" : t.openapi?.copyBtn || "Copy"}
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleDownload("postman")}
                  className="h-7 text-xs"
                >
                  {t.openapi?.downloadPostmanBtn || "Download Collection"}
                </Button>
              </div>
            </div>

            <pre className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs text-foreground select-all">
              {postmanCollectionString}
            </pre>
          </TabsContent>
        </Tabs>
      )}

      <DialogFooter className="mt-2 flex items-center justify-between sm:justify-between border-t border-border pt-3">
        <span className="text-[11px] text-muted-foreground">OpenAPI 3.0</span>
        <Button variant="outline" size="sm" onClick={handleClose}>
          {t.common?.close || "Close"}
        </Button>
      </DialogFooter>
    </HomeDialogContent>
  )
}
