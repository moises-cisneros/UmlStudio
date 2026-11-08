import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-08: Gestión de Versiones y Puntos de Restauración", () => {
  test("CP-CU08-01: Flujo Básico (Happy Path) - Creación de un snapshot manual y visualización en timeline", async ({
    page,
  }) => {
    const user = generateTestUser("cu08_snap")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Versioning Diagram")

    // Agregar un elemento UML para que el diagrama no esté vacío
    const classTool = page.locator('button[aria-label*="Class"]').first()
    await expect(classTool).toBeVisible({ timeout: 10_000 })
    await classTool.click()

    // Abrir VersionDrawer
    const versionTrigger = page.locator('[data-version-history-trigger="true"]').first()
    await expect(versionTrigger).toBeVisible({ timeout: 5_000 })
    await versionTrigger.click()

    const drawer = page
      .locator('aside[aria-label*="Version"], aside[aria-label*="historial"]')
      .first()
    await expect(drawer).toBeVisible({ timeout: 5_000 })

    const snapshotLabel = `Manual CP-08 Snapshot ${Date.now()}`
    const labelInput = drawer.getByRole("textbox").first()
    await expect(labelInput).toBeVisible({ timeout: 5_000 })
    await labelInput.fill(snapshotLabel)

    const createButton = drawer.getByRole("button", {
      name: /Save version|Guardar versión|Create snapshot|Crear/i,
    })
    await expect(createButton).toBeEnabled({ timeout: 5_000 })
    await createButton.click()

    await expect(drawer.getByText(snapshotLabel).first()).toBeVisible({ timeout: 10_000 })

    await captureEvidence(page, "cp-cu08-01")
  })

  test("CP-CU08-02: Flujo Alternativo (FA-01) - Cierre del drawer de versiones con botón de escape o close", async ({
    page,
  }) => {
    const user = generateTestUser("cu08_close")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Close Drawer Diagram")

    const versionTrigger = page.locator('[data-version-history-trigger="true"]').first()
    await versionTrigger.click()

    const drawer = page
      .locator('aside[aria-label*="Version"], aside[aria-label*="historial"]')
      .first()
    await expect(drawer).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press("Escape")
    await expect(drawer).not.toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu08-02")
  })
})
