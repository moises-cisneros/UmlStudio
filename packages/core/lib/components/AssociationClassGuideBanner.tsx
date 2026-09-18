import React, { useEffect } from "react";
import { useShallow } from "zustand/shallow";
import { useDiagramStore } from "@/store/context";
import { useLabels } from "@/i18n/useLabels";
import { X, ArrowRight, AlertCircle, Link } from "lucide-react";

export const AssociationClassGuideBanner: React.FC = () => {
  const t = useLabels();
  const { associationClassPrompt, setAssociationClassPrompt, nodes } =
    useDiagramStore(
      useShallow((state) => ({
        associationClassPrompt: state.associationClassPrompt,
        setAssociationClassPrompt: state.setAssociationClassPrompt,
        nodes: state.nodes,
      })),
    );

  useEffect(() => {
    if (!associationClassPrompt) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAssociationClassPrompt(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [associationClassPrompt, setAssociationClassPrompt]);

  if (!associationClassPrompt) return null;

  const isError = Boolean(
    (associationClassPrompt as { error?: boolean }).error,
  );
  const fromNodeId = associationClassPrompt.fromNodeId;
  const fromNode = fromNodeId ? nodes.find((n) => n.id === fromNodeId) : null;
  const fromName =
    ((fromNode?.data as Record<string, unknown>)?.name as string) || "Origen";

  return (
    <div
      className="umlstudio-guide-banner"
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        top: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        background: "var(--umlstudio-surface, #111827)",
        color: "var(--umlstudio-foreground, #f8fafc)",
        border: "1px solid var(--umlstudio-border, #243046)",
        borderRadius: "var(--umlstudio-radius-lg, 8px)",
        boxShadow:
          "0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
        fontSize: "13px",
        fontWeight: 500,
        pointerEvents: "auto",
        userSelect: "none",
      }}
    >
      {isError ? (
        <>
          <AlertCircle size={16} color="#ef4444" />
          <span>
            {t.requiresTwoClassesForAssociationClass ??
              "You must have at least two classes on the canvas to create an association class"}
          </span>
          <button
            type="button"
            onClick={() => setAssociationClassPrompt(null)}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: 0,
              borderRadius: "4px",
              color: "inherit",
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            {t.cancelSelection ?? "Close"}
          </button>
        </>
      ) : fromNodeId === null ? (
        <>
          <Link size={16} color="#3590f3" />
          <span>
            {t.selectFromClass ?? "Step 1: Select source class (From)"}
          </span>
          <button
            type="button"
            onClick={() => setAssociationClassPrompt(null)}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: 0,
              borderRadius: "4px",
              color: "inherit",
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <X size={12} />
            {t.cancelSelection ?? "Cancel"}
          </button>
        </>
      ) : (
        <>
          <ArrowRight size={16} color="#62bfed" />
          <span>
            {t.selectToClass ?? "Step 2: Select target class (To)"}{" "}
            <strong style={{ color: "#3590f3" }}>({fromName})</strong>
          </span>
          <button
            type="button"
            onClick={() => setAssociationClassPrompt(null)}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: 0,
              borderRadius: "4px",
              color: "inherit",
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <X size={12} />
            {t.cancelSelection ?? "Cancel"}
          </button>
        </>
      )}
    </div>
  );
};
