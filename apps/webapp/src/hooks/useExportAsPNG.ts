import type { SvgToPngResult } from "@umlstudio/core/export";
import { isIOS, isAndroid } from "@/utils/platform";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { useFileDownload } from "./useFileDownload";
import { useEditorContext } from "@/contexts";

type exportAsPNGOptions = {
  setWhiteBackground: boolean;
  shareAfterExport?: boolean;
};

export const useExportAsPNG = () => {
  const { editor } = useEditorContext();
  const downloadFile = useFileDownload();

  const exportAsPNG = async ({
    setWhiteBackground,
  }: exportAsPNGOptions): Promise<SvgToPngResult> => {
    if (!editor) {
      throw new Error("Editor context is not available");
    }

    const umlstudioSVG = await editor.exportAsSVG({ svgMode: "compat" });
    const [{ svgToPng }, { default: resvgWasmUrl }] = await Promise.all([
      import("@umlstudio/core/export"),
      import("@resvg/resvg-wasm/index_bg.wasm?url"),
    ]);
    const result = await svgToPng(umlstudioSVG.svg, umlstudioSVG.clip, {
      scale: 1.5,
      background: setWhiteBackground ? "#ffffff" : null,
      wasmInput: fetch(resvgWasmUrl),
    });
    const fileName = `${editor.model.title}.png`;

    if (isIOS() || isAndroid()) {
      const base64String = await blobToBase64(result.blob);
      await Filesystem.writeFile({
        path: fileName,
        data: base64String,
        directory: Directory.Cache,
      });
      const fileUri = await Filesystem.getUri({
        path: fileName,
        directory: Directory.Cache,
      });
      await Share.share({
        title: "Export PNG",
        url: fileUri.uri,
        dialogTitle: "Save PNG to Files",
      });
    } else {
      const fileToDownload = new File([result.blob], fileName, {
        type: "image/png",
      });
      downloadFile({ file: fileToDownload, fileName });
    }

    return result;
  };

  return exportAsPNG;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(",")[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
