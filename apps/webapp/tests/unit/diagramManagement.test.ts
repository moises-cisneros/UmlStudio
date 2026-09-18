import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UMLDiagramType } from "@umlstudio/core";
import { usePersistenceModelStore } from "../../src/stores/usePersistenceModelStore";
import { DiagramApiClient } from "../../src/services/DiagramApiClient";

describe("CU-13: Diagram Management (Rename, Delete, Share)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset Zustand store state before each test
    usePersistenceModelStore.setState({
      models: {},
      thumbnails: {},
      thumbnailRevisions: {},
      thumbnailLastModifiedAt: {},
      currentModelId: null,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renames a local model in usePersistenceModelStore via renameModel", () => {
    const store = usePersistenceModelStore.getState();
    const modelId = store.createModelByTitleAndType(
      "Initial Architecture",
      UMLDiagramType.ClassDiagram,
    );

    const initialEntity = usePersistenceModelStore.getState().models[modelId];
    expect(initialEntity).toBeDefined();
    expect(initialEntity?.model.title).toBe("Initial Architecture");

    const newTitle = "Enterprise Billing Core (OMG UML 2.5)";
    usePersistenceModelStore.getState().renameModel(modelId, newTitle);

    const updatedEntity = usePersistenceModelStore.getState().models[modelId];
    expect(updatedEntity?.model.title).toBe(newTitle);
    expect(updatedEntity?.id).toBe(modelId);
  });

  it("sends PATCH request to server via DiagramApiClient.patchDiagramTitle", async () => {
    const mockResponse = {
      id: "shared-diag-99",
      title: "Inventory Service Domain",
      headRev: 4,
      updatedAt: new Date().toISOString(),
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockResponse,
    });
    globalThis.fetch = fetchMock;

    const result = await DiagramApiClient.patchDiagramTitle(
      "shared-diag-99",
      "Inventory Service Domain",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/api/diagrams/shared-diag-99");
    expect(calledOpts.method).toBe("PATCH");
    expect(calledOpts.body).toBe(JSON.stringify({ title: "Inventory Service Domain" }));
    expect(result.title).toBe("Inventory Service Domain");
    expect(result.headRev).toBe(4);
  });

  it("deletes a diagram via deleteModel in usePersistenceModelStore", () => {
    const store = usePersistenceModelStore.getState();
    const modelId = store.createModelByTitleAndType(
      "To Be Deleted",
      UMLDiagramType.ClassDiagram,
    );

    expect(usePersistenceModelStore.getState().models[modelId]).toBeDefined();

    usePersistenceModelStore.getState().deleteModel(modelId);

    expect(usePersistenceModelStore.getState().models[modelId]).toBeUndefined();
  });
});
