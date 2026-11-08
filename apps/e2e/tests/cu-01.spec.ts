import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-01: Modelar Diagrama de Clases UML", () => {
  test("CP-CU01-01: Flujo Básico (Happy Path) - Inserción de nodos Clase e Interfaz en el lienzo", async ({
    page,
  }) => {
    const user = generateTestUser("cu01_basic")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Diagrama CU-01 Basico")

    const classCell = page.locator('.umlstudio-palette__cell[aria-label*="Class"]').first()
    await expect(classCell).toBeVisible({ timeout: 10_000 })
    await classCell.click()

    const interfaceCell = page.locator('.umlstudio-palette__cell[aria-label*="Interface"]').first()
    await expect(interfaceCell).toBeVisible({ timeout: 10_000 })
    await interfaceCell.click()

    const nodes = page.locator(".react-flow__node")
    await expect(nodes).toHaveCount(2, { timeout: 10_000 })

    await captureEvidence(page, "cp-cu01-01")
  })

  test("CP-CU01-02: Flujo Alternativo (FA-01) - Selección de nodo e inspección de propiedades en panel lateral", async ({
    page,
  }) => {
    const user = generateTestUser("cu01_alt")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Diagrama CU-01 Alternativo")

    const classCell = page.locator('.umlstudio-palette__cell[aria-label*="Class"]').first()
    await expect(classCell).toBeVisible({ timeout: 10_000 })
    await classCell.click()

    const firstNode = page.locator(".react-flow__node").first()
    await expect(firstNode).toBeVisible({ timeout: 10_000 })
    await firstNode.click()

    // El nodo seleccionado debe tener clase selected o foco
    await expect(firstNode).toHaveClass(/selected/, { timeout: 5_000 })

    await captureEvidence(page, "cp-cu01-02")
  })
})
