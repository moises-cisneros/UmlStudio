import type { SpringBootInheritanceStrategy } from "@umlstudio/core/export"

/** Options for OpenAPI 3.0 document generation. */
export interface OpenApiGenerationOptions {
  title?: string | undefined
  version?: string | undefined
  description?: string | undefined
  packageName?: string | undefined
  serverPort?: number | undefined
  serverUrl?: string | undefined
  selection?: string[] | undefined
  inheritance?: SpringBootInheritanceStrategy | undefined
}

/** OpenAPI 3.0.3 Schema Object subset for generated models. */
export interface OpenApiSchema {
  type?: string | undefined
  format?: string | undefined
  description?: string | undefined
  properties?: Record<string, OpenApiSchema> | undefined
  items?: OpenApiSchema | undefined
  required?: string[] | undefined
  enum?: (string | number)[] | undefined
  $ref?: string | undefined
  nullable?: boolean | undefined
  example?: unknown
}

/** OpenAPI 3.0.3 Parameter Object. */
export interface OpenApiParameter {
  name: string
  in: "path" | "query" | "header" | "cookie"
  description?: string | undefined
  required: boolean
  schema: OpenApiSchema
}

/** OpenAPI 3.0.3 Media Type Object. */
export interface OpenApiMediaType {
  schema: OpenApiSchema
  example?: unknown
}

/** OpenAPI 3.0.3 Request Body Object. */
export interface OpenApiRequestBody {
  description?: string | undefined
  required?: boolean | undefined
  content: {
    "application/json": OpenApiMediaType
    [mediaType: string]: OpenApiMediaType
  }
}

/** OpenAPI 3.0.3 Response Object. */
export interface OpenApiResponse {
  description: string
  content?:
    | {
        "application/json"?: OpenApiMediaType
        [mediaType: string]: OpenApiMediaType | undefined
      }
    | undefined
}

/** OpenAPI 3.0.3 Operation Object. */
export interface OpenApiOperation {
  tags?: string[] | undefined
  summary: string
  description?: string | undefined
  operationId?: string | undefined
  parameters?: OpenApiParameter[] | undefined
  requestBody?: OpenApiRequestBody | undefined
  responses: Record<string, OpenApiResponse>
}

/** OpenAPI 3.0.3 Path Item Object. */
export interface OpenApiPathItem {
  summary?: string | undefined
  description?: string | undefined
  get?: OpenApiOperation | undefined
  put?: OpenApiOperation | undefined
  post?: OpenApiOperation | undefined
  delete?: OpenApiOperation | undefined
  options?: OpenApiOperation | undefined
  head?: OpenApiOperation | undefined
  patch?: OpenApiOperation | undefined
  parameters?: OpenApiParameter[] | undefined
}

/** OpenAPI 3.0.3 Info Object. */
export interface OpenApiInfo {
  title: string
  version: string
  description?: string | undefined
  contact?:
    | {
        name?: string | undefined
        url?: string | undefined
        email?: string | undefined
      }
    | undefined
}

/** OpenAPI 3.0.3 Server Object. */
export interface OpenApiServer {
  url: string
  description?: string | undefined
}

/** OpenAPI 3.0.3 Components Object. */
export interface OpenApiComponents {
  schemas?: Record<string, OpenApiSchema> | undefined
}

/** OpenAPI 3.0.3 Tag Object. */
export interface OpenApiTag {
  name: string
  description?: string | undefined
}

/** Full OpenAPI 3.0.3 Document. */
export interface OpenApiSpec {
  openapi: "3.0.3"
  info: OpenApiInfo
  servers: OpenApiServer[]
  tags: OpenApiTag[]
  paths: Record<string, OpenApiPathItem>
  components: OpenApiComponents
}

/** Postman Collection v2.1.0 Interfaces */
export interface PostmanHeader {
  key: string
  value: string
  type?: string
  description?: string
}

export interface PostmanUrl {
  raw: string
  host: string[]
  path: string[]
  variable?: { key: string; value: string; description?: string }[]
}

export interface PostmanRequestBody {
  mode: "raw"
  raw: string
  options?: {
    raw?: {
      language?: "json" | "text"
    }
  }
}

export interface PostmanRequest {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  header: PostmanHeader[]
  body?: PostmanRequestBody | undefined
  url: PostmanUrl
  description?: string | undefined
}

export interface PostmanItem {
  name: string
  item?: PostmanItem[] | undefined
  request?: PostmanRequest | undefined
  response?: unknown[] | undefined
  description?: string | undefined
}

export interface PostmanVariable {
  key: string
  value: string
  type?: string
}

export interface PostmanCollection {
  info: {
    _postman_id?: string
    name: string
    description?: string
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  }
  item: PostmanItem[]
  variable: PostmanVariable[]
}
