// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { safeRedirectTarget } from "./redirect";

describe("safeRedirectTarget", () => {
  it("honors same-origin in-app targets", () => {
    expect(safeRedirectTarget("/shared/abc")).toBe("/shared/abc");
    expect(safeRedirectTarget("/?x=1")).toBe("/?x=1");
  });

  it("falls back to the dashboard for off-site or empty values", () => {
    expect(safeRedirectTarget("https://evil.example/phish")).toBe("/");
    expect(safeRedirectTarget("//evil.example/phish")).toBe("/");
    expect(safeRedirectTarget("")).toBe("/");
    expect(safeRedirectTarget(undefined)).toBe("/");
    expect(safeRedirectTarget(null)).toBe("/");
  });
});
