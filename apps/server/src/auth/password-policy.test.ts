import { describe, it, expect } from "vitest"
import { passwordSchema, registerSchema } from "./password-policy.js"

describe("passwordSchema (shared policy seam)", () => {
  it("accepts a compliant password with letter, digit, and symbol", () => {
    expect(passwordSchema.safeParse("Modeler-2026!").success).toBe(true)
  })

  it("rejects passwords shorter than 8 characters", () => {
    expect(passwordSchema.safeParse("Ab1!").success).toBe(false)
  })

  it("rejects passwords without a letter", () => {
    expect(passwordSchema.safeParse("12345678!").success).toBe(false)
  })

  it("rejects passwords without a digit", () => {
    expect(passwordSchema.safeParse("Modeler-!!").success).toBe(false)
  })

  it("rejects passwords without a symbol", () => {
    expect(passwordSchema.safeParse("Modeler2026").success).toBe(false)
  })

  it("rejects non-string input", () => {
    expect(passwordSchema.safeParse(undefined).success).toBe(false)
  })
})

describe("registerSchema", () => {
  const valid = {
    name: "Ada Modeler",
    email: "ada@example.com",
    password: "Modeler-2026!",
  }

  it("accepts a fully compliant payload", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects a blank display name", () => {
    expect(registerSchema.safeParse({ ...valid, name: "  " }).success).toBe(false)
  })

  it("rejects a malformed email and names the email field", () => {
    const result = registerSchema.safeParse({
      ...valid,
      email: "not-an-email",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("email"))).toBe(true)
    }
  })

  it("rejects a weak password and names the password field", () => {
    const result = registerSchema.safeParse({ ...valid, password: "weak" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("password"))).toBe(true)
    }
  })
})
