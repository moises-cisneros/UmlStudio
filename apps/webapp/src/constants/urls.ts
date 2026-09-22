export const serverURL = import.meta.env.VITE_SERVER_URL || ""

export const serverWSSUrl =
  import.meta.env.VITE_SERVER_URL_WSS ||
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`

export const bugReportURL =
  "https://github.com/umlstudio/UmlStudio/issues/new?labels=bug&template=bug-report.md"
