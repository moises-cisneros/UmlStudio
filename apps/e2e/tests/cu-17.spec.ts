import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-17: Configuración de Políticas de Sala para la IA", () => {
  test("CP-CU17-01: Flujo Básico (Happy Path) - Propietario despliega diálogo de políticas y verifica controles", async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const user = generateTestUser("cu17_policy")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Room AI Policy Room")

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

    const settingsBtn = dock.getByRole("button", { name: /Room AI settings|configuración/i })
    await expect(settingsBtn).toBeVisible({ timeout: 5_000 })
    await settingsBtn.click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Controles de política
    await expect(dialog.locator('[data-testid="room-ai-allow-changes"]')).toBeVisible({
      timeout: 5_000,
    })
    await expect(dialog.locator('[data-testid="room-ai-proactive"]')).toBeVisible({
      timeout: 5_000,
    })

    await captureEvidence(page, "cp-cu17-01")

    const cancelBtn = dialog.getByRole("button", { name: /Cancel|Cancelar/i })
    await cancelBtn.click()
  })

  test("CP-CU17-02: Flujo Alternativo (FA-01) - Cancelación de diálogo de políticas de sala mediante Escape", async ({
    page,
  }) => {
    const user = generateTestUser("cu17_esc")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Policy Escape Room")

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

    const settingsBtn = dock.getByRole("button", { name: /Room AI settings/i })
    await settingsBtn.click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu17-02")
  })
})
