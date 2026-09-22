import { useMetadataStore } from "@/store/context"
import type { ResolvedUmlStudioLabels } from "./labels"

export const useLabels = (): ResolvedUmlStudioLabels => useMetadataStore((s) => s.labels)
