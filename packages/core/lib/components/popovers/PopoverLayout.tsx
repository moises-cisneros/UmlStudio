import React from "react"
import { Typography } from "@/components/ui"
import { useLabels } from "@/i18n/useLabels"

const SECTION_GAP = 12
const FIELD_GAP = 8

interface PopoverLayoutProps {
  title?: React.ReactNode
  children: React.ReactNode
}

export const PopoverLayout: React.FC<PopoverLayoutProps> = ({ title, children }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: SECTION_GAP,
      width: "100%",
    }}
  >
    {title && (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 4,
          borderBottom: "1px solid var(--umlstudio-border, var(--border-subtle, #243046))",
        }}
      >
        <Typography
          variant="subtitle2"
          style={{
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontSize: "0.75rem",
            color: "var(--dodger-blue, #3590f3)",
          }}
        >
          {title}
        </Typography>
      </div>
    )}
    {children}
  </div>
)

interface PopoverSectionProps {
  title?: React.ReactNode
  action?: React.ReactNode
  divider?: boolean
  children: React.ReactNode
}

export const PopoverSection: React.FC<PopoverSectionProps> = ({
  title,
  action,
  divider = false,
  children,
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: FIELD_GAP,
      ...(divider
        ? {
            borderTop: "1px solid var(--umlstudio-border, var(--border-subtle, #243046))",
            paddingTop: SECTION_GAP,
          }
        : {}),
    }}
  >
    {(title || action) && (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 24,
          gap: FIELD_GAP,
        }}
      >
        {title ? (
          <Typography variant="subtitle2" style={{ fontWeight: 600 }}>
            {title}
          </Typography>
        ) : (
          <span />
        )}
        {action}
      </div>
    )}
    {children}
  </div>
)

export const hasDistinctEndpointNames = (source?: string, target?: string): boolean => {
  const s = source?.trim()
  const t = target?.trim()
  return Boolean(s && t && s !== t)
}

export const ConnectionInfo: React.FC<{
  source?: string
  target?: string
}> = ({ source, target }) =>
  hasDistinctEndpointNames(source, target) ? (
    <Typography variant="body2" style={{ opacity: 0.7 }}>
      {source} → {target}
    </Typography>
  ) : null

export const AssessmentHeader: React.FC<{
  type: string
  name: string
  action?: React.ReactNode
}> = ({ type, name, action }) => {
  const t = useLabels()
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: FIELD_GAP,
      }}
    >
      <Typography variant="subtitle2" style={{ flex: 1 }}>
        {t.assessmentFor(type)}
        {name && " "}
        {name && <span data-slot="assessment-name-chip">{name}</span>}
      </Typography>
      {action}
    </div>
  )
}
