import { Island, IslandInput } from "./islandPrimitives"

export function HeaderTitleField({
  value,
  onValueChange,
  placeholder = "Untitled diagram",
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <Island className="umlstudio-chrome-title-island w-fit" style={{ maxWidth: "560px" }}>
      <IslandInput
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Diagram title"
        size={Math.max(12, (value || placeholder).length + 2)}
        className="min-w-0 max-w-full"
      />
    </Island>
  )
}
