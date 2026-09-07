import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react"
import { UmlStudioEditor } from "@/umlstudio-editor"
import type {
  UmlStudioCollaborationOptions,
  UmlStudioLabels,
  UmlStudioMode,
  UmlStudioOptions,
  UmlStudioView,
  TagOptions,
  UMLDiagramType,
  UMLModel,
} from "@/typings"
import { UmlStudioInstanceContext } from "./context"
import { UmlStudioPalette, UmlStudioZoom, UmlStudioMiniMap } from "./builtins"
import { UmlStudioSelectionToolbar } from "./UmlStudioSelectionToolbar"

export interface UmlStudioProps {
  className?: string
  style?: CSSProperties
  theme?: Partial<Record<`--umlstudio-${string}`, string>>
  dataTheme?: "light" | "dark"
  children?: ReactNode

  defaultModel?: UMLModel
  defaultType?: UMLDiagramType
  defaultMode?: UmlStudioMode
  defaultView?: UmlStudioView
  availableViews?: UmlStudioView[]
  enablePopups?: boolean
  collaborationEnabled?: boolean
  collaboration?: UmlStudioCollaborationOptions
  debug?: boolean

  readonly?: boolean
  view?: UmlStudioView
  mode?: UmlStudioMode
  scrollLock?: boolean
  keyboardShortcuts?: boolean
  labels?: Partial<UmlStudioLabels>
  tags?: boolean | TagOptions
  previewMode?: boolean
  model?: UMLModel

  onMount?: (editor: UmlStudioEditor) => void | (() => void)

  ref?: Ref<UmlStudioEditor | null>
}

export function UmlStudio(props: UmlStudioProps) {
  const {
    className,
    style,
    theme,
    dataTheme,
    children,

    defaultModel,
    defaultType,
    defaultMode,
    defaultView,
    availableViews,
    enablePopups,
    collaborationEnabled,
    collaboration,
    debug,

    readonly,
    view,
    mode,
    scrollLock,
    keyboardShortcuts,
    labels,
    tags,
    previewMode,
    model,

    onMount,
    ref,
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const [editor, setEditor] = useState<UmlStudioEditor | null>(null)

  const initialOptionsRef = useRef<UmlStudioOptions>({
    model: defaultModel,
    type: defaultType,
    mode: defaultMode,
    view: defaultView,
    availableViews,
    enablePopups,
    collaborationEnabled,
    collaboration,
    debug,
    labels,
    tags,
    controls: [],
  })

  const onMountRef = useRef(onMount)
  useEffect(() => {
    onMountRef.current = onMount
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const instance = new UmlStudioEditor(container, initialOptionsRef.current)

    let refCleanup: (() => void) | void
    if (typeof ref === "function") {
      const ret = ref(instance)
      if (typeof ret === "function") refCleanup = ret
    } else if (ref) {
      ;(ref as RefObject<UmlStudioEditor | null>).current = instance
    }

    setEditor(instance)
    const userCleanup = onMountRef.current?.(instance)

    return () => {
      if (typeof userCleanup === "function") userCleanup()
      instance.destroy()

      setEditor(null)
      if (refCleanup) {
        refCleanup()
      } else if (typeof ref === "function") {
        ref(null)
      } else if (ref) {
        ;(ref as RefObject<UmlStudioEditor | null>).current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (editor && readonly !== undefined) editor.setReadonly(readonly)
  }, [editor, readonly])

  useEffect(() => {
    if (editor && scrollLock !== undefined) editor.setScrollLock(scrollLock)
  }, [editor, scrollLock])

  useEffect(() => {
    if (editor && keyboardShortcuts !== undefined) {
      editor.setKeyboardShortcuts(keyboardShortcuts)
    }
  }, [editor, keyboardShortcuts])

  useEffect(() => {
    if (editor && labels !== undefined) editor.setLabels(labels)
  }, [editor, labels])
  useEffect(() => {
    if (editor && tags !== undefined) editor.setTags(tags)
  }, [editor, tags])

  useEffect(() => {
    if (editor && previewMode !== undefined) editor.setPreviewMode(previewMode)
  }, [editor, previewMode])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    if (editor && view !== undefined) editor.view = view
  }, [editor, view])

  useEffect(() => {
    if (editor && mode !== undefined) editor.setMode(mode)
  }, [editor, mode])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    if (editor && model !== undefined) editor.model = model
  }, [editor, model])

  const mergedStyle: CSSProperties = { ...style, ...theme }

  return (
    <UmlStudioInstanceContext.Provider value={editor}>
      <div
        ref={containerRef}
        className={className}
        style={mergedStyle}
        data-theme={dataTheme}
      />
      {children === undefined ? <UmlStudioDefaultControls /> : children}
    </UmlStudioInstanceContext.Provider>
  )
}

export function UmlStudioDefaultControls() {
  return (
    <>
      <UmlStudioPalette />
      <UmlStudioZoom />
      <UmlStudioMiniMap />
    </>
  )
}

UmlStudio.Palette = UmlStudioPalette
UmlStudio.Zoom = UmlStudioZoom
UmlStudio.MiniMap = UmlStudioMiniMap
UmlStudio.SelectionToolbar = UmlStudioSelectionToolbar
UmlStudio.DefaultControls = UmlStudioDefaultControls
