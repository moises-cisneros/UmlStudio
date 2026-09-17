import type { UMLModel } from "../typings";

export interface SpringBootExportOptions {
  /**
   * Root package name for the generated Spring Boot application.
   * @default "com.example.umlstudio"
   */
  packageName?: string;
  /**
   * Target Java version.
   * @default 21
   */
  javaVersion?: 17 | 21;
  /**
   * Whether to include Jakarta / JPA annotations in entity classes.
   * @default true
   */
  includeJpaAnnotations?: boolean;
}

export interface SpringBootGeneratedFile {
  /** Relative path inside the project tree, e.g. "src/main/java/com/example/domain/User.java" */
  path: string;
  /** Java source code content */
  content: string;
}

export interface SpringBootExportResult {
  /** All generated Java files grouped by relative path */
  files: SpringBootGeneratedFile[];
  /** Summary of generated entities and components */
  summary: {
    totalEntities: number;
    totalRepositories: number;
    totalControllers: number;
  };
}

/**
 * Skeleton exporter to translate a UmlStudio UMLModel into a Spring Boot project structure.
 * Concrete translation logic will be implemented as use cases are defined.
 */
export async function exportToSpringBoot(
  model: UMLModel,
  options: SpringBootExportOptions = {},
): Promise<SpringBootExportResult> {
  const basePackage = options.packageName ?? "com.example.umlstudio";
  const classNodes = (model.nodes ?? []).filter(
    (node) => !node.type || node.type === "class",
  );

  const files: SpringBootGeneratedFile[] = classNodes.map((node) => {
    const rawName =
      typeof node.data?.name === "string" ? node.data.name : undefined;
    const className = rawName || "UnnamedEntity";
    const packagePath = basePackage.replace(/\./g, "/");
    return {
      path: `src/main/java/${packagePath}/model/${className}.java`,
      content: [
        `package ${basePackage}.model;`,
        "",
        options.includeJpaAnnotations !== false
          ? "import jakarta.persistence.Entity;\nimport jakarta.persistence.Id;\nimport jakarta.persistence.Table;\n"
          : "",
        options.includeJpaAnnotations !== false ? "@Entity\n@Table" : "",
        `public class ${className} {`,
        "  // TODO: Fields and methods will be generated from UML diagram attributes and operations",
        "}",
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  });

  return {
    files,
    summary: {
      totalEntities: classNodes.length,
      totalRepositories: 0,
      totalControllers: 0,
    },
  };
}
