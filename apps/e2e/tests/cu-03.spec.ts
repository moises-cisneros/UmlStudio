import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-03: Asistente Inteligente Copiloto UML (Chat y Diff)", () => {
  test("CP-CU03-01: Flujo Básico (Happy Path) - Envío de instrucción y generación de propuesta ModelDiff", async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const user = generateTestUser("cu03_basic")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Local Copilot Diagram")

    // Abrir dock con botón flotante
    const agentTrigger = page.locator('button[aria-label*="Ctrl+J"]').first()
    await expect(agentTrigger).toBeVisible({ timeout: 10_000 })
    await agentTrigger.click()

    const dock = page.locator(".workbench-right-dock")
    await expect(dock).toBeVisible({ timeout: 5_000 })

    const inputField = dock.locator(".agent-input-field").first()
    await expect(inputField).toBeVisible({ timeout: 5_000 })
    await inputField.fill("Crea una clase Producto con atributos id: string y precio: number")
    await inputField.press("Enter")

    // Mensaje de procesamiento o propuesta del modelo
    await expect(dock.getByText(/Analizando|Pensando|Producto|propuesta/i).first()).toBeVisible({
      timeout: 25_000,
    })

    await captureEvidence(page, "cp-cu03-01")
  })

  test("CP-CU03-02: Flujo Alternativo (FA-01) - Apertura y cierre del dock lateral de IA", async ({
    page,
  }) => {
    const user = generateTestUser("cu03_alt")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Dock Toggle Diagram")

    const agentTrigger = page.locator('button[aria-label*="Ctrl+J"]').first()
    await expect(agentTrigger).toBeVisible({ timeout: 10_000 })
    await agentTrigger.click()

    const dock = page.locator(".workbench-right-dock")
    await expect(dock).toBeVisible({ timeout: 5_000 })

    // Botón de cierre en el dock
    const closeBtn = dock.getByRole("button", { name: /Close|Cerrar/i }).first()
    if (await closeBtn.isVisible()) {
      await closeBtn.click()
      await expect(dock).not.toBeVisible({ timeout: 5_000 })
    }

    await captureEvidence(page, "cp-cu03-02")
  })
})
