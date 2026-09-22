import { useMetadataStore } from "@/store/context"
import type { TagConfig } from "@/utils/tagUtils"

export const useTagConfig = (): TagConfig => useMetadataStore((state) => state.tagConfig)
