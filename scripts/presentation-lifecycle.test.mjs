import { describe, expect, it } from "vitest"
import {
  PRESENTATION_CONFIG,
  calculateEstimatedDefenseCost,
  validateShutdownChecklist,
  getDefensePreparationCommands,
} from "./presentation-lifecycle.mjs"

describe("presentation-lifecycle (Issue #34 / Backlog E5-07)", () => {
  it("has the required window and cost configuration", () => {
    expect(PRESENTATION_CONFIG.windowStart).toBe("2026-11-06")
    expect(PRESENTATION_CONFIG.defenseDate).toBe("2026-11-11")
    expect(PRESENTATION_CONFIG.gcpServiceName).toBe("umlstudio-llm")
    expect(PRESENTATION_CONFIG.hourlyRateActiveGpuUsd).toBeGreaterThan(1.0)
    expect(PRESENTATION_CONFIG.budgetAlertLimitUsd).toBe(10.0)
  })

  it("calculates estimated defense cost accurately for 2 hours active GPU", () => {
    const cost2h = calculateEstimatedDefenseCost(2.0)
    expect(cost2h).toBe(2.32)
    const cost1h = calculateEstimatedDefenseCost(1.0)
    expect(cost1h).toBe(1.16)
  })

  it("validates that shutdown checklist enforces all 5 teardown gates", () => {
    const incomplete = validateShutdownChecklist({
      cloudRunDeleted: true,
      renderPlansReverted: true,
    })
    expect(incomplete.complete).toBe(false)
    expect(incomplete.missing).toContain("tunnelsTerminated")
    expect(incomplete.missing).toContain("serviceAccountKeysRevoked")
    expect(incomplete.missing).toContain("billingVerifiedZero")

    const complete = validateShutdownChecklist({
      cloudRunDeleted: true,
      renderPlansReverted: true,
      tunnelsTerminated: true,
      serviceAccountKeysRevoked: true,
      billingVerifiedZero: true,
    })
    expect(complete.complete).toBe(true)
    expect(complete.missing.length).toBe(0)
  })

  it("produces correct gcloud commands for pre-warm and shutdown", () => {
    const cmds = getDefensePreparationCommands("us-central1", "umlstudio-llm")
    expect(cmds.preWarm).toContain("gcloud run services update umlstudio-llm")
    expect(cmds.preWarm).toContain("--min-instances=1")
    expect(cmds.deleteService).toContain("gcloud run services delete umlstudio-llm")
    expect(cmds.deleteService).toContain("--quiet")
  })
})
