import { expect, type Page } from "@playwright/test"

export interface TestUser {
  name: string
  email: string
  password: string
}

export function generateTestUser(prefix = "user"): TestUser {
  const id = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  return {
    name: `User ${id}`,
    email: `${prefix}_${id}@test.com`,
    password: "Password123!",
  }
}

export async function registerUserViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto("/register")
  await page.fill("#register-name", user.name)
  await page.fill("#register-email", user.email)
  await page.fill("#register-password", user.password)
  const submitBtn = page.locator('button[type="submit"]')
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 })
  await submitBtn.click()
  // Wait for redirect away from /register
  await page.waitForURL((url) => !url.pathname.includes("/register"), { timeout: 15_000 })
}

export async function loginUserViaUi(
  page: Page,
  user: Pick<TestUser, "email" | "password">
): Promise<void> {
  await page.goto("/login")
  await page.fill("#login-email", user.email)
  await page.fill("#login-password", user.password)
  const submitBtn = page.locator('button[type="submit"]')
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 })
  await submitBtn.click()
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 })
}

export async function createLocalDiagramViaUi(page: Page, title = "Test Diagram"): Promise<string> {
  const newButton = page.getByRole("button", { name: /New$|Nuevo$/i }).first()
  await expect(newButton).toBeVisible({ timeout: 10_000 })
  await newButton.click()

  await expect(page.locator("#scratch-diagram-title")).toBeVisible({ timeout: 5_000 })
  await page.fill("#scratch-diagram-title", title)
  await page.getByRole("button", { name: /Create|Crear/i }).click()

  await page.waitForURL((url) => url.pathname.startsWith("/local/"), { timeout: 10_000 })
  await expect(page.locator('[data-testid="editor-area"]')).toBeVisible({ timeout: 10_000 })
  return page.url()
}
