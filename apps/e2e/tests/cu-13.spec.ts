import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-13: Gestionar Diagrama de Clases", () => {
  test("CP-CU13-01: Flujo Básico (Happy Path) - Creación de diagrama y persistencia en dashboard", async ({
    page,
  }) => {
    const user = generateTestUser("cu13_crud")
    await registerUserViaUi(page, user)

    const diagramTitle = `E2E Diagram ${Date.now()}`
    await createLocalDiagramViaUi(page, diagramTitle)

    // Volver al dashboard y verificar que aparece listado
    await page.goto("/")
    await expect(page.getByText(diagramTitle).first()).toBeVisible({ timeout: 10_000 })

    await captureEvidence(page, "cp-cu13-01")
  })

  test("CP-CU13-02: Flujo Alternativo (FA-01) - Modificación del título del diagrama en el encabezado", async ({
    page,
  }) => {
    const user = generateTestUser("cu13_rename")
    await registerUserViaUi(page, user)
    await createLocalDiagramViaUi(page, "Original Title")

    const titleInput = page.getByRole("textbox", { name: /Diagram title|Título/i })
    await expect(titleInput).toBeVisible({ timeout: 5_000 })
    await titleInput.fill("Renamed Title")
    await titleInput.press("Enter")

    await expect(titleInput).toHaveValue("Renamed Title")

    await captureEvidence(page, "cp-cu13-02")
  })
})
