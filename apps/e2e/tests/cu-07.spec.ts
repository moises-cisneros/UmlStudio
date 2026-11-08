import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-07: Generación de Especificación y Documentación OpenAPI", () => {
  test("CP-CU07-01: Flujo Básico (Happy Path) - Apertura y renderizado de la documentación Swagger/OpenAPI 3.0", async ({
    page,
  }) => {
    const user = generateTestUser("cu07_api")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "OpenAPI Documentation Diagram")

    await page.getByRole("button", { name: "File" }).click()
    const openApiItem = page.getByRole("menuitem", {
      name: /API Documentation|Documentación API|OpenAPI/i,
    })
    await expect(openApiItem).toBeVisible({ timeout: 5_000 })
    await openApiItem.click()

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByText(/OpenAPI|Swagger|Endpoints|API/i).first()).toBeVisible({
      timeout: 5_000,
    })

    await captureEvidence(page, "cp-cu07-01")
  })

  test("CP-CU07-02: Flujo Alternativo (FA-01) - Cierre del modal de documentación OpenAPI", async ({
    page,
  }) => {
    const user = generateTestUser("cu07_close")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Close OpenAPI Diagram")

    await page.getByRole("button", { name: "File" }).click()
    const openApiItem = page.getByRole("menuitem", { name: /API Documentation|Documentación API/i })
    await openApiItem.click()

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    const closeBtn = modal.getByRole("button", { name: /Close|Cerrar|Cancel/i }).first()
    await closeBtn.click()
    await expect(modal).not.toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu07-02")
  })
})
