import { describe, expect, it } from "vitest"
import { findAiAttribution, isAiIdentity, stripAiAttribution } from "./ai-attribution.mjs"

describe("findAiAttribution", () => {
  it.each([
    "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
    "Co-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>",
    "co-authored-by: ChatGPT <bot@openai.com>",
    "Assisted-by: any tool at all",
    "Generated-by: Cursor",
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
    "Generated with GitHub Copilot",
    "Written by Codex",
  ])("flags %s", (line) => {
    const text = `feat(server): add ownership check\n\nBody text.\n\n${line}\n`
    expect(findAiAttribution(text)).toEqual([line])
  })

  it.each([
    "feat(ai): add gemini adapter and openai-compatible client",
    "fix(webapp): keep the cursor visible while dragging",
    "Co-authored-by: SCANDAL9 <scandal9@users.noreply.github.com>",
    "Signed-off-by: moises-cisneros <moisescisnerosdl@gmail.com>",
    "docs: explain how the copilot instructions folder is organized",
  ])("allows %s", (line) => {
    expect(findAiAttribution(line)).toEqual([])
  })

  it("returns every offending line", () => {
    const text = [
      "chore: tidy",
      "",
      "Co-authored-by: Claude <noreply@anthropic.com>",
      "Co-authored-by: SCANDAL9 <x@y.z>",
      "Co-authored-by: Gemini <gemini@google.com>",
    ].join("\n")
    expect(findAiAttribution(text)).toHaveLength(2)
  })

  it("tolerates empty input", () => {
    expect(findAiAttribution("")).toEqual([])
    expect(findAiAttribution(undefined)).toEqual([])
  })
})

describe("isAiIdentity", () => {
  it.each([
    ["Claude", "noreply@anthropic.com"],
    ["copilot-swe-agent[bot]", "198982749+Copilot@users.noreply.github.com"],
    ["Cursor Agent", "cursoragent@cursor.com"],
    ["devin-ai-integration[bot]", "158243242+devin-ai-integration[bot]@users.noreply.github.com"],
  ])("flags %s <%s>", (name, email) => {
    expect(isAiIdentity(name, email)).toBe(true)
  })

  it.each([
    ["moises-cisneros", "moisescisnerosdl@gmail.com"],
    ["SCANDAL9", "scandal9@users.noreply.github.com"],
    ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"],
    ["github-actions[bot]", "41898282+github-actions[bot]@users.noreply.github.com"],
  ])("allows %s <%s>", (name, email) => {
    expect(isAiIdentity(name, email)).toBe(false)
  })
})

describe("stripAiAttribution", () => {
  it("removes only the attribution lines and trailing blank lines", () => {
    const body =
      "## Summary\nAdds the panel.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n"
    expect(stripAiAttribution(body)).toBe("## Summary\nAdds the panel.\n")
  })

  it("returns the same text when nothing matches", () => {
    const body = "Plain description\nwith two lines"
    expect(stripAiAttribution(body)).toBe(body)
  })
})
