import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, loginUserViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-11: Iniciar Sesión del Usuario", () => {
  test("CP-CU11-01: Flujo Básico (Happy Path) - Inicio de sesión exitoso con credenciales válidas", async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    const user = generateTestUser("login_valid")
    await registerUserViaUi(page, user)

    const freshContext = await browser.newContext()
    const freshPage = await freshContext.newPage()
    await loginUserViaUi(freshPage, user)

    await expect(freshPage).toHaveURL("/")
    const newBtn = freshPage.locator('button:has-text("New"), button:has-text("Nuevo")').first()
    await expect(newBtn).toBeVisible({ timeout: 10_000 })

    await captureEvidence(freshPage, "cp-cu11-01")

    await context.close()
    await freshContext.close()
  })

  test("CP-CU11-02: Flujo Alternativo (FA-01) - Rechazo con error visible ante credenciales inválidas", async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto("/login")
    await page.fill("#login-email", "inexistente@correo.com")
    await page.fill("#login-password", "PasswordIncorrecta999!")
    await page.click('button[type="submit"]')

    await expect(
      page.getByText(/Invalid credentials|Credenciales inválidas|error/i).first()
    ).toBeVisible({ timeout: 10_000 })

    await captureEvidence(page, "cp-cu11-02")
    await context.close()
  })
})
