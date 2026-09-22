/**
 * Only same-origin in-app targets are honored. Anything else (absolute URLs,
 * protocol-relative targets, empty values) falls back to the dashboard so a
 * crafted `?redirect=` can never bounce visitors off-site.
 */
export function safeRedirectTarget(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/"
  }
  return value
}
