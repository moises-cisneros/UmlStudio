import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { RoomAiPreferencesDialog } from "./RoomAiPreferencesDialog"

describe("RoomAiPreferencesDialog", () => {
  it("keeps focus while editing an existing preference", async () => {
    const user = userEvent.setup()
    render(
      <RoomAiPreferencesDialog
        open
        preferences={["Use uppercase attributes"]}
        onOpenChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />
    )

    const input = screen.getByDisplayValue("Use uppercase attributes")
    await user.type(input, " always")

    expect((input as HTMLInputElement).value).toBe("Use uppercase attributes always")
  })
})
