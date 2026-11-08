import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-14: Administrar Perfil de Usuario", () => {
  test("CP-CU14-01: Flujo Básico (Happy Path) - Modificación del nombre público desde el modal de perfil", async ({
    page,
  }) => {
    const user = generateTestUser("cu14_prof")
    await registerUserViaUi(page, user)

    // Abrir menú de usuario
    const userButton = page
      .locator('button[aria-label*="User menu"], button[aria-label*=":"]')
      .first()
    await expect(userButton).toBeVisible({ timeout: 10_000 })
    await userButton.click()

    const profileItem = page.getByRole("menuitem", { name: /Profile|Perfil/i }).first()
    await expect(profileItem).toBeVisible({ timeout: 5_000 })
    await profileItem.click()

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    const nameInput = modal.locator('input[type="text"]').first()
    await expect(nameInput).toBeVisible({ timeout: 5_000 })
    await nameInput.fill("Nombre Actualizado")

    const saveButton = modal
      .getByRole("button", { name: /Save Profile|Guardar Perfil|Save|Guardar/i })
      .first()
    await saveButton.click()

    await expect(modal.getByText(/Profile updated successfully|Perfil actualizado/i)).toBeVisible({
      timeout: 10_000,
    })

    await captureEvidence(page, "cp-cu14-01")
  })

  test("CP-CU14-02: Flujo Alternativo (FA-01) - Cierre del modal de perfil con botón Cancelar", async ({
    page,
  }) => {
    const user = generateTestUser("cu14_canc")
    await registerUserViaUi(page, user)

    const userButton = page
      .locator('button[aria-label*="User menu"], button[aria-label*=":"]')
      .first()
    await expect(userButton).toBeVisible({ timeout: 10_000 })
    await userButton.click()

    const profileItem = page.getByRole("menuitem", { name: /Profile|Perfil/i }).first()
    await expect(profileItem).toBeVisible({ timeout: 5_000 })
    await profileItem.click()

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    const cancelBtn = modal.getByRole("button", { name: /Cancel|Cancelar/i }).first()
    await cancelBtn.click()
    await expect(modal).not.toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu14-02")
  })
})
