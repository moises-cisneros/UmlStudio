import type {
  KernelEntity,
  KernelModel,
  SpringBootGeneratedFile,
  SpringBootInheritanceStrategy,
} from "@umlstudio/core/export";

export interface SqlEmitterOptions {
  inheritance?: SpringBootInheritanceStrategy | undefined;
}

/**
 * Emits `schema.sql` (idempotent 3NF DDL, audit/reference artifact) and
 * `data.sql` (minimal seeds). The runtime schema is managed by Hibernate
 * (`ddl-auto: update`); the checked-in SQL is the reviewable contract.
 */
export function emitSqlFiles(
  kernel: KernelModel,
  options: SqlEmitterOptions = {},
): SpringBootGeneratedFile[] {
  const inheritance = options.inheritance ?? "JOINED";
  return [
    { path: "src/main/resources/schema.sql", content: emitSchemaSql(kernel, inheritance) },
    { path: "src/main/resources/data.sql", content: emitDataSql(kernel, inheritance) },
  ];
}

function emitSchemaSql(
  kernel: KernelModel,
  inheritance: SpringBootInheritanceStrategy,
): string {
  const lines: string[] = [];
  lines.push("-- UmlStudio generated PostgreSQL DDL.");
  lines.push("-- Idempotent reference artifact; runtime schema is managed by Hibernate (ddl-auto: update).");
  lines.push("");

  const byName = new Map(kernel.entities.map((e) => [e.className, e]));
  const childrenByParent = new Map<string, KernelEntity[]>();
  for (const entity of kernel.entities) {
    if (entity.parent) {
      const siblings = childrenByParent.get(entity.parent) ?? [];
      siblings.push(entity);
      childrenByParent.set(entity.parent, siblings);
    }
  }

  const singleTableRoots = new Set<string>();
  if (inheritance === "SINGLE_TABLE") {
    for (const entity of kernel.entities) {
      if (entity.hasChildren) {
        singleTableRoots.add(entity.className);
      }
    }
  }
  const nestedChildren = new Set<string>();
  if (inheritance === "SINGLE_TABLE") {
    for (const root of singleTableRoots) {
      const visit = (name: string): void => {
        for (const child of childrenByParent.get(name) ?? []) {
          nestedChildren.add(child.className);
          visit(child.className);
        }
      };
      visit(root);
    }
  }

  const tableColumns = (entity: KernelEntity): string[] => {
    const cols = entity.scalars.map((scalar) => {
      if (scalar.id) {
        return `  ${scalar.columnName} BIGSERIAL PRIMARY KEY`;
      }
      const nullable = scalar.nullable ? "" : " NOT NULL";
      return `  ${scalar.columnName} ${scalar.sqlType}${nullable}`;
    });
    for (const relation of entity.relations) {
      if (relation.kind === "many-to-one" && relation.joinColumn) {
        cols.push(`  ${relation.joinColumn} BIGINT`);
      }
    }
    return cols;
  };

  for (const entity of kernel.entities) {
    if (nestedChildren.has(entity.className)) {
      continue;
    }
    const cols = tableColumns(entity);
    if (singleTableRoots.has(entity.className)) {
      const seen = new Set(cols);
      const visit = (name: string): void => {
        for (const child of childrenByParent.get(name) ?? []) {
          for (const scalar of child.scalars) {
            if (scalar.id) {
              continue;
            }
            const def = `  ${scalar.columnName} ${scalar.sqlType}`;
            if (!seen.has(def)) {
              seen.add(def);
              cols.push(def);
            }
          }
          for (const relation of child.relations) {
            if (relation.kind === "many-to-one" && relation.joinColumn) {
              const def = `  ${relation.joinColumn} BIGINT`;
              if (!seen.has(def)) {
                seen.add(def);
                cols.push(def);
              }
            }
          }
          visit(child.className);
        }
      };
      visit(entity.className);
      cols.push("  dtype VARCHAR(31)");
    }
    lines.push(`CREATE TABLE IF NOT EXISTS ${entity.tableName} (`);
    lines.push(cols.join(",\n"));
    lines.push(");");
    lines.push("");
  }

  for (const join of kernel.joinTables) {
    lines.push(`CREATE TABLE IF NOT EXISTS ${join.tableName} (`);
    lines.push(`  ${join.sourceColumn} BIGINT NOT NULL,`);
    lines.push(`  ${join.targetColumn} BIGINT NOT NULL,`);
    lines.push(`  PRIMARY KEY (${join.sourceColumn}, ${join.targetColumn})`);
    lines.push(");");
    lines.push("");
  }

  // Idempotent foreign keys: drop-then-add converges on re-runs.
  const addFk = (
    table: string,
    name: string,
    columns: string,
    refTable: string,
    refColumns: string,
    onDelete: string,
  ): void => {
    lines.push(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name};`);
    lines.push(
      `ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${columns}) REFERENCES ${refTable} (${refColumns}) ON DELETE ${onDelete};`,
    );
    lines.push("");
  };

  for (const entity of kernel.entities) {
    if (nestedChildren.has(entity.className)) {
      continue;
    }
    for (const relation of entity.relations) {
      if (relation.kind === "many-to-one" && relation.joinColumn) {
        addFk(
          entity.tableName,
          `fk_${entity.tableName}_${relation.joinColumn}`,
          relation.joinColumn,
          relation.targetTable,
          "id",
          relation.onDelete,
        );
      }
    }
    if (entity.parent && inheritance === "JOINED") {
      const parent = byName.get(entity.parent);
      if (parent) {
        addFk(
          entity.tableName,
          `fk_${entity.tableName}_parent`,
          "id",
          parent.tableName,
          "id",
          "CASCADE",
        );
      }
    }
  }

  for (const join of kernel.joinTables) {
    addFk(
      join.tableName,
      `fk_${join.tableName}_source`,
      join.sourceColumn,
      join.sourceTable,
      "id",
      "CASCADE",
    );
    addFk(
      join.tableName,
      `fk_${join.tableName}_target`,
      join.targetColumn,
      join.targetTable,
      "id",
      "CASCADE",
    );
  }

  return lines.join("\n");
}

function seedableTables(
  kernel: KernelModel,
  inheritance: SpringBootInheritanceStrategy,
): string[] {
  if (inheritance !== "SINGLE_TABLE") {
    return kernel.entities.map((e) => e.tableName);
  }
  const nested = new Set<string>();
  const childrenByParent = new Map<string, KernelEntity[]>();
  for (const entity of kernel.entities) {
    if (entity.parent) {
      const siblings = childrenByParent.get(entity.parent) ?? [];
      siblings.push(entity);
      childrenByParent.set(entity.parent, siblings);
    }
  }
  for (const entity of kernel.entities) {
    if (entity.hasChildren) {
      const visit = (name: string): void => {
        for (const child of childrenByParent.get(name) ?? []) {
          nested.add(child.className);
          visit(child.className);
        }
      };
      visit(entity.className);
    }
  }
  return kernel.entities
    .filter((e) => !nested.has(e.className))
    .map((e) => e.tableName);
}

function emitDataSql(
  kernel: KernelModel,
  inheritance: SpringBootInheritanceStrategy,
): string {
  const lines: string[] = [];
  lines.push("-- UmlStudio generated seed data.");
  lines.push("-- Minimal placeholders: every column is nullable or defaulted,");
  lines.push("-- so DEFAULT VALUES rows are always valid PostgreSQL.");
  lines.push("");
  for (const table of seedableTables(kernel, inheritance)) {
    lines.push(`INSERT INTO ${table} DEFAULT VALUES;`);
  }
  lines.push("");
  return lines.join("\n");
}
