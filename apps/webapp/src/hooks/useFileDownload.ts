import { useCallback } from "react";

interface FileDownloadPayload {
  file: File | Blob;
  fileName?: string;
}

export const useFileDownload = () => {
  const downloadFile = useCallback(
    ({ file, fileName }: FileDownloadPayload) => {
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(file);

      if (fileName) {
        link.download = fileName;
      } else if (file instanceof File) {
        link.download = file.name;
      } else {
        link.download = "file";
      }

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(link.href);
    },
    [],
  );

  return downloadFile;
};
