import { IconButton, TextField, Typography } from "@/components/ui"
import { EdgeStyleEditor } from "@/components/styleEditor"
import { CustomEdgeProps } from "@/edges/EdgeProps"
import { ArrowLeftRight, ArrowRight, Circle, CircleDot } from "lucide-react"
import { useEdgePopOver, useReactiveEdge, useReactiveNodeName } from "@/hooks"
import { PopoverProps } from "../types"
import { EdgeTypeSelect, EdgeTypeOption } from "./EdgeTypeSelect"
import { useLabels } from "@/i18n/useLabels"
import { PopoverLayout, PopoverSection } from "../PopoverLayout"

export const EdgeEditPopover: React.FC<PopoverProps> = ({ elementId }) => {
  const t = useLabels()

  const CLASS_EDGE_TYPE_OPTIONS: ReadonlyArray<EdgeTypeOption> = [
    { value: "ClassBidirectional", label: t.association ?? t.biAssociation },
    { value: "ClassAggregation", label: t.aggregation },
    { value: "ClassComposition", label: t.composition },
    { value: "ClassInheritance", label: t.inheritance },
    { value: "ClassDependency", label: t.dependency },
    { value: "ClassRealization", label: t.realization },
  ]

  const edge = useReactiveEdge(elementId)
  const sourceName = useReactiveNodeName(edge?.source, t.source)
  const targetName = useReactiveNodeName(edge?.target, t.target)

  const {
    handleSourceRoleChange,
    handleSourceMultiplicityChange,
    handleTargetRoleChange,
    handleTargetMultiplicityChange,
    handleEdgeTypeChange,
    handleSwap,
  } = useEdgePopOver(elementId)

  if (!edge) {
    return null
  }

  const edgeData = edge.data as CustomEdgeProps | undefined

  return (
    <PopoverLayout title={t.edge}>
      {/* Banner visual de conexión Source -> Target */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "7px 10px",
          borderRadius: 8,
          backgroundColor:
            "color-mix(in srgb, var(--dodger-blue, #3590f3) 8%, var(--umlstudio-surface, #1e293b))",
          border: "1px solid color-mix(in srgb, var(--dodger-blue, #3590f3) 22%, transparent)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            minWidth: 0,
            flex: 1,
          }}
        >
          <CircleDot
            width={13}
            height={13}
            style={{ color: "var(--dodger-blue, #3590f3)", flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={sourceName}
          >
            {sourceName}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <ArrowRight width={12} height={12} style={{ opacity: 0.5 }} />
          {handleSwap && (
            <IconButton
              key="swap-source-target"
              ariaLabel={t.swapSourceTarget}
              tooltip={t.swapSourceTarget}
              onClick={handleSwap}
            >
              <ArrowLeftRight width={14} height={14} aria-hidden="true" />
            </IconButton>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            minWidth: 0,
            flex: 1,
            justifyContent: "flex-end",
          }}
        >
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "right",
            }}
            title={targetName}
          >
            {targetName}
          </span>
          <Circle
            width={13}
            height={13}
            style={{ color: "var(--brand-cyan, #00d8ff)", flexShrink: 0 }}
          />
        </div>
      </div>

      <EdgeStyleEditor edgeData={edgeData} label={t.style} />

      <PopoverSection divider>
        <EdgeTypeSelect
          value={edge.type}
          options={CLASS_EDGE_TYPE_OPTIONS}
          onChange={handleEdgeTypeChange}
        />
      </PopoverSection>

      {/* Tarjeta de Origen (Source) */}
      <PopoverSection divider>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--umlstudio-border, var(--border-subtle, #243046))",
            backgroundColor:
              "color-mix(in srgb, var(--umlstudio-surface, #1e293b) 60%, transparent)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CircleDot width={13} height={13} style={{ color: "var(--dodger-blue, #3590f3)" }} />
              <Typography variant="subtitle2" style={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                {t.source}
              </Typography>
            </div>
            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 4,
                backgroundColor: "color-mix(in srgb, var(--dodger-blue, #3590f3) 14%, transparent)",
                color: "var(--dodger-blue, #3590f3)",
                maxWidth: 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {sourceName}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <TextField
              label={t.multiplicityLabel(sourceName)}
              value={edgeData?.sourceMultiplicity ?? ""}
              onChange={(e) => handleSourceMultiplicityChange(e.target.value)}
              fullWidth
              data-testid="edge-source-multiplicity"
            />
            <TextField
              label={t.roleLabel(sourceName)}
              value={edgeData?.sourceRole ?? ""}
              onChange={(e) => handleSourceRoleChange(e.target.value)}
              fullWidth
              data-testid="edge-source-role"
            />
          </div>
        </div>
      </PopoverSection>

      {/* Tarjeta de Destino (Target) */}
      <PopoverSection>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--umlstudio-border, var(--border-subtle, #243046))",
            backgroundColor:
              "color-mix(in srgb, var(--umlstudio-surface, #1e293b) 60%, transparent)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Circle width={13} height={13} style={{ color: "var(--brand-cyan, #00d8ff)" }} />
              <Typography variant="subtitle2" style={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                {t.target}
              </Typography>
            </div>
            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 4,
                backgroundColor: "color-mix(in srgb, var(--brand-cyan, #00d8ff) 14%, transparent)",
                color: "var(--brand-cyan, #00d8ff)",
                maxWidth: 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {targetName}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <TextField
              label={t.multiplicityLabel(targetName)}
              value={edgeData?.targetMultiplicity ?? ""}
              onChange={(e) => handleTargetMultiplicityChange(e.target.value)}
              fullWidth
              data-testid="edge-target-multiplicity"
            />
            <TextField
              label={t.roleLabel(targetName)}
              value={edgeData?.targetRole ?? ""}
              onChange={(e) => handleTargetRoleChange(e.target.value)}
              fullWidth
              data-testid="edge-target-role"
            />
          </div>
        </div>
      </PopoverSection>
    </PopoverLayout>
  )
}
