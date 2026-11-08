import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-12: Registrar Cuenta de Usuario", () => {
  test("CP-CU12-01: Flujo Básico (Happy Path) - Registro de usuario y auto-login al dashboard", async ({
    page,
  }) => {
    const user = generateTestUser("reg_basic")
    await registerUserViaUi(page, user)

    await expect(page).toHaveURL("/")
    const newBtn = page.locator('button:has-text("New"), button:has-text("Nuevo")').first()
    await expect(newBtn).toBeVisible({ timeout: 10_000 })

    await captureEvidence(page, "cp-cu12-01")
  })

  test("CP-CU12-02: Flujo Alternativo (FA-01) - Rechazo con 409 Conflict ante correo previamente registrado", async ({
    browser,
  }) => {
    const contextA = await browser.newContext()
    const pageA = await contextA.newPage()
    const user = generateTestUser("dup_user")
    await registerUserViaUi(pageA, user)
    await contextA.close()

    const contextB = await browser.newContext()
    const pageB = await contextB.newPage()
    await pageB.goto("/register")
    await pageB.fill("#register-name", "Duplicate Attempt")
    await pageB.fill("#register-email", user.email)
    await pageB.fill("#register-password", user.password)
    await pageB.click('button[type="submit"]')

    await expect(
      pageB.getByText(/already exists|ya existe|registrado|conflict/i).first()
    ).toBeVisible({ timeout: 10_000 })

    await captureEvidence(pageB, "cp-cu12-02")
    await contextB.close()
  })
})
