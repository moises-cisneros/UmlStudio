const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
}

/**
 * Names the uploaded recording after its real container so server logs and decoders are not
 * misled (Safari records audio/mp4, Chrome and Firefox record audio/webm or audio/ogg).
 */
export function voiceFileNameForBlob(blob: Blob): string {
  const mime = (blob.type || "").split(";")[0].trim().toLowerCase()
  return `voz.${EXTENSION_BY_MIME[mime] ?? "webm"}`
}
