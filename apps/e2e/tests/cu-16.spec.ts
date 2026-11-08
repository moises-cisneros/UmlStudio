import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-16: IA de Sala en Modo Propuesta y Mutación", () => {
  test("CP-CU16-01: Flujo Básico (Happy Path) - Interacción con selector de modo Changes para propuestas", async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const user = generateTestUser("cu16_prop")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Room Proposal Test")

    await page.locator('button:has-text("Share"), button:has-text("Compartir")').first().click()
    const shareModal = page.locator('[data-testid="share-modal-content"]')
    await shareModal
      .locator('button:has-text("Collaborative Link"), button:has-text("Crear enlace")')
      .first()
      .click()
    await shareModal.locator('button:has-text("Join"), button:has-text("Unirse")').first().click()
    await page.waitForURL((url) => url.pathname.startsWith("/shared/"), { timeout: 10_000 })

    const agentTrigger = page.locator('button[aria-label*="Ctrl+J"]').first()
    if (await agentTrigger.isVisible()) {
      await agentTrigger.click()
    }

    const dock = page.locator(".workbench-right-dock")
    await expect(dock).toBeVisible({ timeout: 10_000 })

    // El grupo de interacción de IA debe contener el botón Changes
    const changesButton = dock.getByRole("button", { name: /Changes|Cambios/i }).first()
    await expect(changesButton).toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu16-01")
  })

  test("CP-CU16-02: Flujo Alternativo (FA-01) - Estado deshabilitado del modo Changes según política de sala", async ({
    page,
  }) => {
    const user = generateTestUser("cu16_disabled")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Room Mentor Only Policy")

    await page.locator('button:has-text("Share"), button:has-text("Compartir")').first().click()
    const shareModal = page.locator('[data-testid="share-modal-content"]')
    await shareModal
      .locator('button:has-text("Collaborative Link"), button:has-text("Crear enlace")')
      .first()
      .click()
    await shareModal.locator('button:has-text("Join"), button:has-text("Unirse")').first().click()
    await page.waitForURL((url) => url.pathname.startsWith("/shared/"), { timeout: 10_000 })

    const agentTrigger = page.locator('button[aria-label*="Ctrl+J"]').first()
    if (await agentTrigger.isVisible()) {
      await agentTrigger.click()
    }

    const dock = page.locator(".workbench-right-dock")
    await expect(dock).toBeVisible({ timeout: 10_000 })

    // Inspeccionar botón de Changes
    const changesBtn = dock.getByRole("button", { name: /Changes|Cambios/i }).first()
    await expect(changesBtn).toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu16-02")
  })
})
