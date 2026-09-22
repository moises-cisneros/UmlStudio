import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { HOME_VIEW_MODE_STORAGE_KEY } from "../../src/components/home/useHomeChrome"

describe("Home View Mode Configuration", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it("defines the expected storage key for persisting view mode", () => {
    expect(HOME_VIEW_MODE_STORAGE_KEY).toBe("umlstudio-home-view-mode")
  })

  it("allows setting and reading list view mode as default fallback", () => {
    const raw = localStorage.getItem(HOME_VIEW_MODE_STORAGE_KEY)
    const initialMode = raw === "cards" ? "cards" : "list"
    expect(initialMode).toBe("list")
  })

  it("persists cards mode when selected", () => {
    localStorage.setItem(HOME_VIEW_MODE_STORAGE_KEY, "cards")
    const raw = localStorage.getItem(HOME_VIEW_MODE_STORAGE_KEY)
    const mode = raw === "cards" ? "cards" : "list"
    expect(mode).toBe("cards")
  })
})
