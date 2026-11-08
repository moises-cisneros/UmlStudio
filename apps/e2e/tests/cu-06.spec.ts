import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-06: Generación de Backend Spring Boot 3.x", () => {
  test("CP-CU06-01: Flujo Básico (Happy Path) - Despliegue de modal Spring Boot y configuración de parámetros", async ({
    page,
  }) => {
    const user = generateTestUser("cu06_boot")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Spring Boot Model")

    await page.getByRole("button", { name: "File" }).click()
    const springBootItem = page.getByRole("menuitem", {
      name: /Generate Backend Code|Generar backend|\.zip/i,
    })
    await expect(springBootItem).toBeVisible({ timeout: 5_000 })
    await springBootItem.click()

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // Verificar campos de configuración del generador
    await expect(modal.getByText(/Spring Boot|Backend Code|Maven|Gradle/i).first()).toBeVisible({
      timeout: 5_000,
    })

    await captureEvidence(page, "cp-cu06-01")
  })

  test("CP-CU06-02: Flujo Alternativo (FA-01) - Cancelación y cierre del diálogo de generación Spring Boot", async ({
    page,
  }) => {
    const user = generateTestUser("cu06_cancel")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Cancel Codegen Diagram")

    await page.getByRole("button", { name: "File" }).click()
    const springBootItem = page.getByRole("menuitem", { name: /Backend Code|Generar backend/i })
    await springBootItem.click()

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    const cancelBtn = modal.getByRole("button", { name: /Cancel|Cancelar|Close/i }).first()
    await cancelBtn.click()
    await expect(modal).not.toBeVisible({ timeout: 5_000 })

    await captureEvidence(page, "cp-cu06-02")
  })
})
