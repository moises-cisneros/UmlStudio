import { describe, it, expect } from "vitest";
import { DiagramView } from "../../src/types/ModalTypes";
import {
  SHARED_DIAGRAM_VIEW_OPTIONS,
  DEFAULT_SHARED_DIAGRAM_VIEW,
  isDiagramView,
  normalizeSharedDiagramView,
  getSharedDiagramViewOption,
  getSharedDiagramViewBadge,
  buildSharedDiagramUrl,
  sharedDiagramRoute,
} from "../../src/utils/sharedDiagramLinks";
import { MODE_OPTIONS } from "../../src/components/modals/ShareLinkRow";

describe("CU-02: Shared Diagram Collaboration Permissions (EDITOR & LECTOR)", () => {
  it("exposes exactly two permission options in SHARED_DIAGRAM_VIEW_OPTIONS", () => {
    expect(SHARED_DIAGRAM_VIEW_OPTIONS).toHaveLength(2);
    const values = SHARED_DIAGRAM_VIEW_OPTIONS.map((opt) => opt.value);
    expect(values).toContain(DiagramView.EDITOR);
    expect(values).toContain(DiagramView.LECTOR);
  });

  it("exposes exactly two options in ShareLinkRow MODE_OPTIONS", () => {
    expect(MODE_OPTIONS).toHaveLength(2);
    const values = MODE_OPTIONS.map((opt) => opt.value);
    expect(values).toContain(DiagramView.EDITOR);
    expect(values).toContain(DiagramView.LECTOR);
  });

  it("validates DiagramView with isDiagramView", () => {
    expect(isDiagramView(DiagramView.EDITOR)).toBe(true);
    expect(isDiagramView(DiagramView.LECTOR)).toBe(true);
    expect(isDiagramView("EDITOR")).toBe(true);
    expect(isDiagramView("LECTOR")).toBe(true);
    expect(isDiagramView("OTHER")).toBe(false);
  });

  it("sets DEFAULT_SHARED_DIAGRAM_VIEW to EDITOR", () => {
    expect(DEFAULT_SHARED_DIAGRAM_VIEW).toBe(DiagramView.EDITOR);
  });

  describe("normalizeSharedDiagramView", () => {
    it("normalizes canonical views correctly", () => {
      expect(normalizeSharedDiagramView("EDITOR")).toBe(DiagramView.EDITOR);
      expect(normalizeSharedDiagramView(DiagramView.EDITOR)).toBe(
        DiagramView.EDITOR,
      );
      expect(normalizeSharedDiagramView("LECTOR")).toBe(DiagramView.LECTOR);
      expect(normalizeSharedDiagramView(DiagramView.LECTOR)).toBe(
        DiagramView.LECTOR,
      );
    });

    it("maps legacy collaborative and edit tokens to EDITOR", () => {
      expect(normalizeSharedDiagramView("COLLABORATE")).toBe(
        DiagramView.EDITOR,
      );
      expect(normalizeSharedDiagramView("EDIT")).toBe(DiagramView.EDITOR);
    });

    it("maps legacy feedback and viewer tokens to LECTOR", () => {
      expect(normalizeSharedDiagramView("GIVE_FEEDBACK")).toBe(
        DiagramView.LECTOR,
      );
      expect(normalizeSharedDiagramView("SEE_FEEDBACK")).toBe(
        DiagramView.LECTOR,
      );
      expect(normalizeSharedDiagramView("VIEWER")).toBe(DiagramView.LECTOR);
      expect(normalizeSharedDiagramView("READONLY")).toBe(DiagramView.LECTOR);
    });

    it("falls back to DEFAULT_SHARED_DIAGRAM_VIEW on unknown or missing values", () => {
      expect(normalizeSharedDiagramView(null)).toBe(DiagramView.EDITOR);
      expect(normalizeSharedDiagramView(undefined)).toBe(DiagramView.EDITOR);
      expect(normalizeSharedDiagramView("unknown_random_mode")).toBe(
        DiagramView.EDITOR,
      );
    });
  });

  describe("URL and routing builders", () => {
    it("builds shared diagram route with the chosen view", () => {
      const route = sharedDiagramRoute("diag-123", DiagramView.LECTOR);
      expect(route.to).toBe("/shared/$diagramId");
      expect(route.params.diagramId).toBe("diag-123");
      expect(route.search.view).toBe(DiagramView.LECTOR);
    });

    it("builds shared URL with view query param", () => {
      const url = buildSharedDiagramUrl(
        "diag-123",
        DiagramView.EDITOR,
        "https://app.umlstudio.com",
      );
      expect(url).toBe("https://app.umlstudio.com/shared/diag-123?view=EDITOR");
    });
  });

  describe("getSharedDiagramViewBadge & getSharedDiagramViewOption", () => {
    it("returns correct badges and options for EDITOR and LECTOR", () => {
      const editorOption = getSharedDiagramViewOption(DiagramView.EDITOR);
      expect(editorOption.badge).toBe("Editor");

      const lectorOption = getSharedDiagramViewOption(DiagramView.LECTOR);
      expect(lectorOption.badge).toBe("Lector");

      expect(getSharedDiagramViewBadge("COLLABORATE")).toBe("Editor");
      expect(getSharedDiagramViewBadge("SEE_FEEDBACK")).toBe("Lector");
    });
  });
});
