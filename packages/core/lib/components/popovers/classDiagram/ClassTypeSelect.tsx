import { useMemo } from "react"
import { Select, type SelectOption } from "@/components/ui"
import { ClassStereotype } from "@/types"
import { useLabels } from "@/i18n/useLabels"
import { stereotypeLabel } from "@/utils"

export type ClassKind =
  | "class"
  | "abstract"
  | "interface"
  | "enumeration"
  | "association"

type KindDescriptor = {
  value: ClassKind
  label: (t: ReturnType<typeof useLabels>) => string
  keyword?: ClassStereotype
  italic?: boolean
}

const KINDS: readonly KindDescriptor[] = [
  { value: "class", label: (t) => t.class },
  { value: "abstract", label: (t) => t.abstractClass, italic: true },
  {
    value: "interface",
    label: (t) => t.interface,
    keyword: ClassStereotype.Interface,
  },
  {
    value: "enumeration",
    label: (t) => t.enumeration,
    keyword: ClassStereotype.Enumeration,
  },
  {
    value: "association",
    label: (t) => t.associationClass ?? "Association Class",
    keyword: ClassStereotype.Association,
  },
]

const KindRow = ({
  label,
  keyword,
  italic,
}: Omit<KindDescriptor, "label"> & { label: string }) => (
  <span style={{ alignItems: "baseline", display: "flex", gap: 8 }}>
    {keyword && (
      <span style={{ fontSize: "0.85em", opacity: 0.6 }}>
        {stereotypeLabel(keyword)}
      </span>
    )}
    <span style={{ fontStyle: italic ? "italic" : "normal" }}>{label}</span>
  </span>
)

interface ClassTypeSelectProps {
  value: ClassKind
  onChange: (value: ClassKind) => void
}

export const ClassTypeSelect = ({ value, onChange }: ClassTypeSelectProps) => {
  const t = useLabels()
  const options: SelectOption[] = useMemo(
    () =>
      KINDS.map((kind) => {
        const label = kind.label(t)
        return {
          value: kind.value,
          label,
          renderOption: () => <KindRow {...kind} label={label} />,
          renderValue: () => <KindRow {...kind} label={label} />,
        }
      }),
    [t]
  )

  return (
    <Select
      label={t.classType}
      aria-label={t.classType}
      value={value}
      options={options}
      onChange={(next) => onChange(next as ClassKind)}
    />
  )
}
