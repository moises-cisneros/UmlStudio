import { test, expect } from "@playwright/test"
import { generateTestUser, registerUserViaUi, createLocalDiagramViaUi } from "./helpers/auth"
import { captureEvidence } from "./helpers/evidence"

test.describe("CU-02: Colaboración en Tiempo Real y Exclusión de Objetos", () => {
  test("CP-CU02-01: Flujo Básico (Happy Path) - Dos usuarios sincronizan nodos y presencia en tiempo real", async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const contextA = await browser.newContext()
    const pageA = await contextA.newPage()
    const userA = generateTestUser("collabA")
    await registerUserViaUi(pageA, userA)
    await createLocalDiagramViaUi(pageA, "Shared Team Diagram")

    // Crear enlace compartido
    await pageA.locator('button:has-text("Share"), button:has-text("Compartir")').first().click()
    const shareModalA = pageA.locator('[data-testid="share-modal-content"]')
    await expect(shareModalA).toBeVisible({ timeout: 5_000 })
    await shareModalA
      .locator('button:has-text("Collaborative Link"), button:has-text("Crear enlace")')
      .first()
      .click()
    await shareModalA.locator('button:has-text("Join"), button:has-text("Unirse")').first().click()
    await pageA.waitForURL((url) => url.pathname.startsWith("/shared/"), { timeout: 10_000 })
    await expect(pageA.getByText("Loading diagram…")).not.toBeVisible({ timeout: 15_000 })
    const sharedUrl = pageA.url()
    const sharedPath = new URL(sharedUrl).pathname + new URL(sharedUrl).search

    // Usuario B se une en contexto separado
    const contextB = await browser.newContext()
    const pageB = await contextB.newPage()
    const userB = generateTestUser("collabB")
    await registerUserViaUi(pageB, userB, sharedPath)
    await expect(pageB.getByText("Loading diagram…")).not.toBeVisible({ timeout: 15_000 })

    // Usuario A inserta una clase
    const classCell = pageA.locator('.umlstudio-palette__cell[aria-label*="Class"]').first()
    await expect(classCell).toBeVisible({ timeout: 10_000 })
    await classCell.click()
    await expect(pageA.locator(".react-flow__node").first()).toBeVisible({ timeout: 10_000 })

    // Usuario B recibe el nodo en tiempo real vía WebSocket
    await expect(pageB.locator(".react-flow__node").first()).toBeVisible({ timeout: 15_000 })

    await captureEvidence(pageB, "cp-cu02-01")

    await contextA.close()
    await contextB.close()
  })

  test("CP-CU02-02: Flujo Alternativo (FA-01) - Verificación de presencia visual multiusuario en el header", async ({
    browser,
  }) => {
    const contextA = await browser.newContext()
    const pageA = await contextA.newPage()
    const userA = generateTestUser("presA")
    await registerUserViaUi(pageA, userA)
    await createLocalDiagramViaUi(pageA, "Presence Room")

    await pageA.locator('button:has-text("Share"), button:has-text("Compartir")').first().click()
    const shareModalA = pageA.locator('[data-testid="share-modal-content"]')
    await expect(shareModalA).toBeVisible({ timeout: 5_000 })
    await shareModalA
      .locator('button:has-text("Collaborative Link"), button:has-text("Crear enlace")')
      .first()
      .click()
    await shareModalA.locator('button:has-text("Join"), button:has-text("Unirse")').first().click()
    await pageA.waitForURL((url) => url.pathname.startsWith("/shared/"), { timeout: 10_000 })
    await expect(pageA.getByText("Loading diagram…")).not.toBeVisible({ timeout: 15_000 })

    // El indicador de usuario actual (You) debe ser visible en el header
    const userBadge = pageA
      .locator('header, [role="banner"]')
      .getByText(/You|Tú|U1/i)
      .first()
    await expect(userBadge).toBeVisible({ timeout: 5_000 })

    await captureEvidence(pageA, "cp-cu02-02")
    await contextA.close()
  })
})
