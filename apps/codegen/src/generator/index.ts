import type { UMLModel } from "@umlstudio/core"
import {
  buildKernelModel,
  emitControllerFile,
  emitEntityFile,
  emitEnumFile,
  emitInterfaceFile,
  emitRepositoryFile,
  emitRequestDtoFile,
  emitResponseDtoFile,
  emitServiceFile,
  emitServiceImplFile,
  emitOpenApiConfigFile,
  type KernelModel,
  type SpringBootFullExportSummary,
  type SpringBootGeneratedFile,
  type SpringBootInheritanceStrategy,
} from "@umlstudio/core/export"
import { emitApplicationYml } from "./config/emitter.js"
import { emitSqlFiles } from "../sql/emitter.js"
import { generateOpenApiSpec, generateOpenApiYaml } from "../openapi/index.js"

export interface GenerateProjectOptions {
  packageName: string
  selection?: string[] | undefined
  inheritance?: SpringBootInheritanceStrategy | undefined
  dbHost?: string | undefined
  dbPort?: number | undefined
  dbName: string
  dbUser: string
  dbPassword: string
  serverPort?: number | undefined
}

export interface GeneratedProject {
  files: SpringBootGeneratedFile[]
  warnings: string[]
  summary: SpringBootFullExportSummary
  kernel: KernelModel
}

/**
 * Kernel orchestration: model -> kernel -> 5 layers + application.yml +
 * schema.sql/data.sql + WARNINGS.md. Pure apart from no I/O at all.
 */
export function generateProjectFiles(
  model: UMLModel,
  options: GenerateProjectOptions
): GeneratedProject {
  const inheritance = options.inheritance ?? "JOINED"
  const kernel = buildKernelModel(model, {
    packageName: options.packageName,
    selection: options.selection,
    inheritance,
  })
  const files: SpringBootGeneratedFile[] = []
  for (const e of kernel.enums) {
    files.push(emitEnumFile(e))
  }
  for (const iface of kernel.interfaces) {
    files.push(emitInterfaceFile(iface))
  }
  for (const entity of kernel.entities) {
    files.push(emitEntityFile(entity, inheritance))
    files.push(emitRepositoryFile(entity))
    files.push(emitServiceFile(entity))
    files.push(emitServiceImplFile(entity))
    files.push(emitRequestDtoFile(entity))
    files.push(emitResponseDtoFile(entity))
    files.push(emitControllerFile(entity))
  }
  files.push(emitOpenApiConfigFile(options.packageName, model.title))
  files.push(
    emitApplicationYml({
      dbHost: options.dbHost,
      dbPort: options.dbPort,
      dbName: options.dbName,
      dbUser: options.dbUser,
      dbPassword: options.dbPassword,
      serverPort: options.serverPort,
    })
  )
  for (const sql of emitSqlFiles(kernel, { inheritance })) {
    files.push(sql)
  }
  const openApiDoc = generateOpenApiSpec(kernel, {
    title: model.title,
    serverPort: options.serverPort,
  })
  files.push({
    path: "src/main/resources/static/openapi.json",
    content: JSON.stringify(openApiDoc, null, 2),
  })
  files.push({
    path: "src/main/resources/static/openapi.yaml",
    content: generateOpenApiYaml(openApiDoc),
  })
  if (kernel.warnings.length > 0) {
    files.push({
      path: "WARNINGS.md",
      content: ["# Generation warnings", "", ...kernel.warnings.map((w) => `- ${w}`), ""].join(
        "\n"
      ),
    })
  }
  const entityCount = kernel.entities.length
  return {
    files,
    warnings: kernel.warnings,
    summary: {
      totalEntities: entityCount,
      totalRepositories: entityCount,
      totalServices: entityCount,
      totalDtos: entityCount * 2,
      totalControllers: entityCount,
    },
    kernel,
  }
}
