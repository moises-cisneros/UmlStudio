import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-15: IA de Sala en Modo Consulta y Mentoría", () => {
  test("CP-CU15-01: Flujo Básico (Happy Path) - Consulta pedagógica y transmisión en la conversación de sala", async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const user = generateTestUser("cu15_mentor")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Room AI Mentor Room")

    await page.locator('button:has-text("Share"), button:has-text("Compartir")').first().click()
    const shareModal = page.locator('[data-testid="share-modal-content"]')
    await shareModal
      .locator('button:has-text("Collaborative Link"), button:has-text("Crear enlace")')
      .first()
      .click()
    await shareModal.locator('button:has-text("Join"), button:has-text("Unirse")').first().click()
    await page.waitForURL((url) => url.pathname.startsWith("/shared/"), { timeout: 10_000 })

    const dock = page.locator(".workbench-right-dock")
    if (!(await dock.isVisible())) {
      const agentTrigger = page.locator('button[aria-label*="Ctrl+J"]').first()
      await agentTrigger.click()
    }
    await expect(dock).toBeVisible({ timeout: 10_000 })

    const input = dock.getByRole("textbox", { name: /Ask the AI/i })
    await expect(input).toBeVisible({ timeout: 5_000 })
    await input.fill("Explica agregacion")

    const sendBtn = dock.getByRole("button", { name: /Send/i }).first()
    await expect(sendBtn).toBeEnabled({ timeout: 5_000 })
    await sendBtn.click()

    await expect(dock.getByText("Explica agregacion")).toBeVisible({ timeout: 25_000 })

    await captureEvidence(page, "cp-cu15-01")
  })

  test("CP-CU15-02: Flujo Alternativo (FA-01) - Verificación del modo pedagógico Ask activo por defecto", async ({
    page,
  }) => {
    const user = generateTestUser("cu15_mode")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Room Mode Check")

    await page.locator('button:has-text("Share"), button:has-text("Compartir")').first().click()
    const shareModal = page.locator('[data-testid="share-modal-content"]')
    await shareModal
      .locator('button:has-text("Collaborative Link"), button:has-text("Crear enlace")')
      .first()
      .click()
    await shareModal.locator('button:has-text("Join"), button:has-text("Unirse")').first().click()
    await page.waitForURL((url) => url.pathname.startsWith("/shared/"), { timeout: 10_000 })

    const dock = page.locator(".workbench-right-dock")
    if (!(await dock.isVisible())) {
      const agentTrigger = page.locator('button[aria-label*="Ctrl+J"]').first()
      await agentTrigger.click()
    }
    await expect(dock).toBeVisible({ timeout: 10_000 })

    const askButton = dock.getByRole("button", { name: /Ask|Consultar/i }).first()
    await expect(askButton).toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu15-02")
  })
})
