import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-05: Interoperabilidad XMI con Enterprise Architect", () => {
  test("CP-CU05-01: Flujo Básico (Happy Path) - Exportación y descarga de archivo XML/XMI compatible", async ({
    page,
  }) => {
    const user = generateTestUser("cu05_xmi")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "XMI Export Diagram")

    const classCell = page.locator('.umlstudio-palette__cell[aria-label*="Class"]').first()
    await classCell.click()
    await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 5_000 })

    await page.getByRole("button", { name: "File" }).click()
    const exportXmiItem = page.getByRole("menuitem", {
      name: /Export to Architect|Exportar a Architect|\.xmi/i,
    })
    await expect(exportXmiItem).toBeVisible({ timeout: 5_000 })

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 })
    await exportXmiItem.click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.xmi$/i)
    await captureEvidence(page, "cp-cu05-01")
  })

  test("CP-CU05-02: Flujo Alternativo (FA-01) - Verificación de opción XMI en el menú de interoperabilidad", async ({
    page,
  }) => {
    const user = generateTestUser("cu05_label")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "XMI Menu Test")

    await page.getByRole("button", { name: "File" }).click()
    const xmiItem = page.getByRole("menuitem", {
      name: /Export to Architect|Exportar a Architect|\.xmi/i,
    })
    await expect(xmiItem).toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu05-02")
  })
})
