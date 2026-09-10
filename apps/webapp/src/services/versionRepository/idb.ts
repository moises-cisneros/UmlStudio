import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
} from "idb";
import { toast } from "react-toastify";
import { log } from "@/logger";
import type { VersionKind } from "@/types";

export const DB_NAME = "umlstudio-versions";
export const DB_VERSION = 1;

export interface VersionMetaRow {
  id: string;
  diagramId: string;
  name: string;
  description: string;
  createdAt: string;
  kind: VersionKind;
  librarySchemaVersion: string;
  seq: number;
}

export interface VersionBodyRow {
  diagramId: string;
  id: string;
  body: string;
}

export interface DiagramMetaRow {
  diagramId: string;
  headSeq: number;
}

interface UmlStudioVersionsDB extends DBSchema {
  versions: {
    key: string;
    value: VersionMetaRow;
    indexes: {
      by_diagram_seq: [string, number];
    };
  };
  versionBodies: {
    key: [string, string];
    value: VersionBodyRow;
  };
  diagramMeta: {
    key: string;
    value: DiagramMetaRow;
  };
}

export type UmlStudioVersionsDBHandle = IDBPDatabase<UmlStudioVersionsDB>;

export type UmlStudioVersionsTx = IDBPTransaction<
  UmlStudioVersionsDB,
  ["versions", "versionBodies", "diagramMeta"],
  "readwrite"
>;

let dbPromise: Promise<UmlStudioVersionsDBHandle> | null = null;

export function getDb(): Promise<UmlStudioVersionsDBHandle> {
  if (!dbPromise) {
    dbPromise = openDB<UmlStudioVersionsDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldV) {
        if (oldV < 1) {
          const v = db.createObjectStore("versions", { keyPath: "id" });
          v.createIndex("by_diagram_seq", ["diagramId", "seq"]);
          db.createObjectStore("versionBodies", {
            keyPath: ["diagramId", "id"],
          });
          db.createObjectStore("diagramMeta", { keyPath: "diagramId" });
        }
      },
      blocked() {
        toast.warning(
          "UmlStudio was updated. Close other UmlStudio tabs and refresh to continue using version history.",
          { autoClose: false, toastId: "idb-upgrade-blocked" },
        );
      },
      blocking() {
        toast.warning(
          "UmlStudio was updated in another tab. Refresh this tab to continue using version history.",
          { autoClose: false, toastId: "idb-upgrade-blocking" },
        );
      },
    }).catch((err) => {
      dbPromise = null;
      log.error("Failed to open umlstudio-versions IDB", err as Error);
      throw err;
    });
  }
  return dbPromise;
}

export function __resetDbForTests(): void {
  dbPromise = null;
}
