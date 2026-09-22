// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { RegisterForm } from "./RegisterForm"
import { useAuthStore } from "@/stores/useAuthStore"

const USER = {
  id: "user-cu12-001",
  email: "ada@example.com",
  name: "Ada Modeler",
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Ada Modeler" },
  })
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "ada@example.com" },
  })
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "Modeler-2026!" },
  })
}

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null, status: "anonymous" })
})

describe("RegisterForm (CU-12)", () => {
  it("calls onSuccess after a 201 auto-session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(201, { token: "fresh-token", user: USER }))
    )
    const onSuccess = vi.fn()
    render(<RegisterForm redirect="/shared/xyz" onSuccess={onSuccess} />)

    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(useAuthStore.getState().status).toBe("authenticated")
  })

  it("shows a login link (and no reset link) on 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(409, {
          error: "CONFLICT",
          message: "Registration unavailable",
        })
      )
    )
    const onSuccess = vi.fn()
    render(<RegisterForm redirect="/shared/xyz" onSuccess={onSuccess} />)

    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toMatch(/already exists/i)
    const loginLink = screen.getByRole("link", { name: /go to login/i })
    expect(loginLink.getAttribute("href")).toBe("/login?redirect=%2Fshared%2Fxyz")
    expect(screen.queryByRole("link", { name: /reset/i })).toBeNull()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it("shows the server field error inline on 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(400, {
          error: "INVALID_PARAMS",
          message: "Invalid password: Password must contain a symbol",
          fields: { password: "Password must contain a symbol" },
        })
      )
    )
    const onSuccess = vi.fn()
    render(<RegisterForm onSuccess={onSuccess} />)

    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await screen.findByText("Password must contain a symbol")
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
