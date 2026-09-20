import type { SpringBootGeneratedFile } from "@umlstudio/core/export";

/** Default Spring Boot HTTP port for generated applications. */
export const DEFAULT_SERVER_PORT = 9000;

/** Default PostgreSQL port for generated applications. */
export const DEFAULT_DB_PORT = 5432;

export interface ApplicationYmlOptions {
  dbHost?: string | undefined;
  dbPort?: number | undefined;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  serverPort?: number | undefined;
}

/**
 * Emits `src/main/resources/application.yml` with the PostgreSQL DataSource,
 * JPA/Hibernate settings (`ddl-auto: update`) and the server port.
 */
export function emitApplicationYml(
  options: ApplicationYmlOptions,
): SpringBootGeneratedFile {
  const dbHost = options.dbHost ?? "localhost";
  const dbPort = options.dbPort ?? DEFAULT_DB_PORT;
  const serverPort = options.serverPort ?? DEFAULT_SERVER_PORT;
  const content = [
    "spring:",
    "  datasource:",
    `    url: jdbc:postgresql://${dbHost}:${dbPort}/${options.dbName}`,
    `    username: ${options.dbUser}`,
    `    password: ${options.dbPassword}`,
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
  return { path: "src/main/resources/application.yml", content };
}
