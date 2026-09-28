import { describe, it, expect } from "vitest"
import {
  COLLABORATIVE_USER_THRESHOLD,
  isCollaborativeImportExportBlocked,
  getActiveParticipantCount,
  readCollaborators,
  sameCollaborators,
  type Collaborator,
} from "../../src/hooks/useCollaborators"
import { es } from "../../src/i18n/locales/es"
import { en } from "../../src/i18n/locales/en"
import type { UmlStudioEditor } from "@umlstudio/core"

describe("Collaborative Import & Export Guard (>= 2 collaborators)", () => {
  it("defines COLLABORATIVE_USER_THRESHOLD as 2", () => {
    expect(COLLABORATIVE_USER_THRESHOLD).toBe(2)
  })

  describe("isCollaborativeImportExportBlocked rule", () => {
    it("allows import and export when in a local diagram regardless of collaborator count", () => {
      expect(isCollaborativeImportExportBlocked(false, 0)).toBe(false)
      expect(isCollaborativeImportExportBlocked(false, 1)).toBe(false)
      expect(isCollaborativeImportExportBlocked(false, 2)).toBe(false)
      expect(isCollaborativeImportExportBlocked(false, 3)).toBe(false)
      expect(isCollaborativeImportExportBlocked(false, 10)).toBe(false)
    })

    it("allows import and export in a shared room when only 1 collaborator is active", () => {
      expect(isCollaborativeImportExportBlocked(true, 0)).toBe(false)
      expect(isCollaborativeImportExportBlocked(true, 1)).toBe(false)
    })

    it("blocks import and export in a shared room when two or more collaborators are active (>= 2)", () => {
      expect(isCollaborativeImportExportBlocked(true, 2)).toBe(true)
      expect(isCollaborativeImportExportBlocked(true, 3)).toBe(true)
      expect(isCollaborativeImportExportBlocked(true, 4)).toBe(true)
      expect(isCollaborativeImportExportBlocked(true, 10)).toBe(true)
    })
  })

  describe("getActiveParticipantCount helper", () => {
    it("returns 0 when no editor or collaborators are provided", () => {
      expect(getActiveParticipantCount(undefined, [])).toBe(0)
    })

    it("counts unique collaborators when awareness is unavailable", () => {
      const collabs: Collaborator[] = [
        { id: "user-1", name: "Alice", clientIds: [1] },
        { id: "user-2", name: "Bob", clientIds: [2] },
      ]
      expect(getActiveParticipantCount(undefined, collabs)).toBe(2)
    })

    it("correctly counts multiple tabs opened by the same user account (clientIds > 1)", () => {
      const collabsSameUserMultiTab: Collaborator[] = [
        { id: "user-1", name: "Alice", clientIds: [101, 102] },
      ]
      expect(getActiveParticipantCount(undefined, collabsSameUserMultiTab)).toBe(2)
    })

    it("reads active awareness states size when available on editor", () => {
      const mockEditor = {
        getAwarenessStates: () =>
          new Map([
            [1, {}],
            [2, {}],
          ]),
      } as unknown as UmlStudioEditor

      expect(getActiveParticipantCount(mockEditor, [])).toBe(2)
    })
  })

  describe("readCollaborators helper", () => {
    it("returns empty array if editor is undefined or getCollaborators is absent", () => {
      expect(readCollaborators(undefined)).toEqual([])
      expect(readCollaborators({} as UmlStudioEditor)).toEqual([])
    })

    it("filters out pre-auth noise entries lacking name, id, and avatar", () => {
      const mockEditor = {
        getCollaborators: () => [
          { id: "user-1", name: "Alice", isLocal: true },
          { id: "user-2", name: "Bob", isLocal: false },
          { id: "", name: "", isLocal: false }, // pre-auth noise
        ],
      } as unknown as UmlStudioEditor

      const collabs = readCollaborators(mockEditor)
      expect(collabs).toHaveLength(2)
      expect(collabs.map((c: Collaborator) => c.name)).toEqual(["Alice", "Bob"])
    })
  })

  describe("i18n notifications for blocked operations", () => {
    it("provides localized messages in Spanish", () => {
      expect(es.collaborators.importBlockedToast).toBeTruthy()
      expect(es.collaborators.exportBlockedToast).toBeTruthy()
      expect(es.collaborators.importExportDisabledTooltip).toBeTruthy()
      expect(es.collaborators.importBlockedToast).toContain("dos o más")
      expect(es.collaborators.exportBlockedToast).toContain("dos o más")
    })

    it("provides localized messages in English", () => {
      expect(en.collaborators.importBlockedToast).toBeTruthy()
      expect(en.collaborators.exportBlockedToast).toBeTruthy()
      expect(en.collaborators.importExportDisabledTooltip).toBeTruthy()
      expect(en.collaborators.importBlockedToast).toContain("two or more")
      expect(en.collaborators.exportBlockedToast).toContain("two or more")
    })
  })

  describe("sameCollaborators referential stability", () => {
    it("returns true for identical references and contents", () => {
      const listA: Collaborator[] = [{ id: "1", name: "Alice", isLocal: true }]
      const listB: Collaborator[] = [{ id: "1", name: "Alice", isLocal: true }]
      expect(sameCollaborators(listA, listA)).toBe(true)
      expect(sameCollaborators(listA, listB)).toBe(true)
    })

    it("returns false when lengths or properties differ", () => {
      const listA: Collaborator[] = [{ id: "1", name: "Alice", isLocal: true }]
      const listB: Collaborator[] = [
        { id: "1", name: "Alice", isLocal: true },
        { id: "2", name: "Bob", isLocal: false },
      ]
      const listC: Collaborator[] = [{ id: "1", name: "Alice Modified", isLocal: true }]
      expect(sameCollaborators(listA, listB)).toBe(false)
      expect(sameCollaborators(listA, listC)).toBe(false)
    })
  })
})
