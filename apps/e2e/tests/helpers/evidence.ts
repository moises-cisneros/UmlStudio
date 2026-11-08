import { resolve } from "node:path"
import type { Page } from "@playwright/test"

/**
 * Captures screenshot evidence for PUDS Test Case Specification deliverables.
 * Saves directly into `docs/evidence/e2e/<test-case-id>.png`.
 */
export async function captureEvidence(page: Page, testCaseId: string): Promise<string> {
  const filePath = resolve(process.cwd(), `../../docs/evidence/e2e/${testCaseId.toLowerCase()}.png`)
  await page.screenshot({ path: filePath })
  return filePath
}
