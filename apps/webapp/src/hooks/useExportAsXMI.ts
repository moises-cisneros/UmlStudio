import { exportToXmi } from "@umlstudio/core/export"
import { useEditorContext } from "@/contexts"
import { useFileDownload } from "./useFileDownload"
import { isIOS, isAndroid } from "@/utils/platform"
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"
import { toast } from "react-toastify"

export const useExportAsXMI = () => {
  const { editor } = useEditorContext()
  const downloadFile = useFileDownload()

  const exportAsXMI = async () => {
    if (!editor) {
      throw new Error("Editor context is not available")
    }

    const result = await exportToXmi(editor.model, {
      xmiVersion: "2.1",
      targetDialect: "EnterpriseArchitect",
      diagramName: editor.model.title || "diagram",
    })

    const fileName = result.filename

    if (isIOS() || isAndroid()) {
      await Filesystem.writeFile({
        path: fileName,
        data: result.xmiContent,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      })
      const fileUri = await Filesystem.getUri({
        path: fileName,
        directory: Directory.Cache,
      })
      await Share.share({
        title: "Export Enterprise Architect XMI",
        url: fileUri.uri,
        dialogTitle: "Save XMI to Files",
      })
    } else {
      const fileToDownload = new File([result.xmiContent], fileName, {
        type: "application/xml",
      })
      downloadFile({ file: fileToDownload, fileName })
    }

    toast.success(`Exported "${fileName}" for Enterprise Architect.`)
  }

  return exportAsXMI
}
