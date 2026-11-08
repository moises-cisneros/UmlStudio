import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-10: Analizar Productividad y Gestión del Tiempo", () => {
  test("CP-CU10-01: Flujo Básico (Happy Path) - Despliegue del panel de productividad en sala colaborativa", async ({
    page,
  }) => {
    const user = generateTestUser("cu10_prod")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Productivity Metric Room")

    // Compartir sala
    await page.locator('button:has-text("Share"), button:has-text("Compartir")').first().click()
    const shareModal = page.locator('[data-testid="share-modal-content"]')
    await expect(shareModal).toBeVisible({ timeout: 5_000 })
    await shareModal
      .locator('button:has-text("Collaborative Link"), button:has-text("Crear enlace")')
      .first()
      .click()
    await shareModal.locator('button:has-text("Join"), button:has-text("Unirse")').first().click()
    await page.waitForURL((url) => url.pathname.startsWith("/shared/"), { timeout: 10_000 })

    // Abrir modal de productividad
    await page.getByRole("button", { name: "File" }).click()
    const prodItem = page.getByRole("menuitem", { name: /Productivity|Productividad/i })
    await expect(prodItem).toBeVisible({ timeout: 5_000 })
    await prodItem.click()

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(
      modal.getByText(/Productivity|Productividad|Active Time|Tiempo/i).first()
    ).toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu10-01")
  })

  test("CP-CU10-02: Flujo Alternativo (FA-01) - Cierre del modal de productividad mediante botón Close", async ({
    page,
  }) => {
    const user = generateTestUser("cu10_close")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Productivity Close Room")

    await page.locator('button:has-text("Share"), button:has-text("Compartir")').first().click()
    const shareModal = page.locator('[data-testid="share-modal-content"]')
    await shareModal
      .locator('button:has-text("Collaborative Link"), button:has-text("Crear enlace")')
      .first()
      .click()
    await shareModal.locator('button:has-text("Join"), button:has-text("Unirse")').first().click()
    await page.waitForURL((url) => url.pathname.startsWith("/shared/"), { timeout: 10_000 })

    await page.getByRole("button", { name: "File" }).click()
    const prodItem = page.getByRole("menuitem", { name: /Productivity|Productividad/i })
    await prodItem.click()

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    const closeBtn = modal.getByRole("button", { name: /Close|Cerrar/i }).first()
    await closeBtn.click()
    await expect(modal).not.toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu10-02")
  })
})
