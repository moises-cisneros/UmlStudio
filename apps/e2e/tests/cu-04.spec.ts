import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-04: Exportar Diagrama a Formatos Gráficos (PNG/SVG)", () => {
  test("CP-CU04-01: Flujo Básico (Happy Path) - Exportación y descarga del diagrama como imagen PNG", async ({
    page,
  }) => {
    const user = generateTestUser("cu04_png")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "PNG Export Diagram")

    const classCell = page.locator('.umlstudio-palette__cell[aria-label*="Class"]').first()
    await classCell.click()
    await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 5_000 })

    await page.getByRole("button", { name: "File" }).click()
    const exportPngItem = page.getByRole("menuitem", {
      name: /Export to Image|Exportar a imagen|\.png/i,
    })
    await expect(exportPngItem).toBeVisible({ timeout: 5_000 })

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 })
    await exportPngItem.click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.png$/i)
    await captureEvidence(page, "cp-cu04-01")
  })

  test("CP-CU04-02: Flujo Alternativo (FA-01) - Inspección de opciones de exportación gráfica en menú Archivo", async ({
    page,
  }) => {
    const user = generateTestUser("cu04_menu")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Menu Inspection Diagram")

    await page.getByRole("button", { name: "File" }).click()
    const exportPngItem = page.getByRole("menuitem", {
      name: /Export to Image|Exportar a imagen|\.png/i,
    })
    await expect(exportPngItem).toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu04-02")
  })
})
