#!/usr/bin/env node
/**
 * Blocks AI attribution in commits, pull requests, issues and comments.
 *
 * AI agents may help write code, but the repository must not list them as authors or
 * co-authors. One rule set is shared by the commit-msg hook, CI and the repo-guard workflow.
 *
 * Usage:
 *   node scripts/ai-attribution.mjs --message-file <path>   check a commit message (hook)
 *   node scripts/ai-attribution.mjs --range <base>..<head>  check commits: messages and identities
 *   node scripts/ai-attribution.mjs --env VAR [VAR...]      check text held in environment variables
 *   node scripts/ai-attribution.mjs --strip-env VAR         print VAR without attribution lines;
 *                                                           exit code 2 when something was removed
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const AI_NAMES = [
  "claude",
  "anthropic",
  "copilot",
  "chatgpt",
  "openai",
  "gpt-?\\d",
  "gemini",
  "bard",
  "cursor",
  "codeium",
  "windsurf",
  "devin",
  "aider",
  "codex",
  "tabnine",
  "codewhisperer",
  "amazon q",
  "coderabbit",
  "sweep",
  "jules",
  "opencode",
]
const AI_NAME = new RegExp(`(^|[^a-z])(${AI_NAMES.join("|")})([^a-z]|$)`, "i")

// Trailers whose key alone is AI attribution, whatever the value.
const AI_TRAILER_KEY = /^\s*(assisted-by|generated-by|ai-assisted-by|ai-generated-by)\s*:/i
// Trailers that attribute authorship: flagged when the value names an AI.
const AUTHOR_TRAILER = /^\s*(co-authored-by|signed-off-by|helped-by|reviewed-by)\s*:\s*(.+)$/i
// Promotional banners added by agents to bodies and messages.
const AI_BANNER = [
  /generated\s+(with|by|using)\b.{0,40}?(claude|copilot|chatgpt|gpt|gemini|cursor|codex|devin|ai\b)/i,
  /(written|created|made|authored)\s+(with|by)\s+(claude|copilot|chatgpt|gemini|cursor|codex|devin)/i,
  /claude\.(com|ai)\/(claude-)?code/i,
]

const ALLOWED_BOTS = /^(dependabot|github-actions|renovate)\[bot\]$/i

/** Lines of `text` that attribute authorship to an AI. */
export function findAiAttribution(text) {
  if (!text) return []
  return text.split(/\r?\n/).filter((line) => {
    if (AI_TRAILER_KEY.test(line)) return true
    const trailer = line.match(AUTHOR_TRAILER)
    if (trailer) return AI_NAME.test(trailer[2])
    return AI_BANNER.some((re) => re.test(line))
  })
}

/** True when a commit author or committer identity belongs to an AI agent. */
export function isAiIdentity(name = "", email = "") {
  if (ALLOWED_BOTS.test(name.trim())) return false
  return AI_NAME.test(name) || AI_NAME.test(email)
}

/** `text` without attribution lines and without the blank lines they leave at the end. */
export function stripAiAttribution(text) {
  const flagged = new Set(findAiAttribution(text))
  if (flagged.size === 0) return text
  const kept = text.split(/\r?\n/).filter((line) => !flagged.has(line))
  while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop()
  return `${kept.join("\n")}\n`
}

function checkRange(range) {
  const SEP = "\x1f"
  const END = "\x1e"
  const log = execFileSync(
    "git",
    ["log", "--no-merges", `--format=%h${SEP}%an${SEP}%ae${SEP}%cn${SEP}%ce${SEP}%B${END}`, range],
    { encoding: "utf8" }
  )
  const problems = []
  for (const entry of log.split(END)) {
    if (!entry.trim()) continue
    const [sha, an, ae, cn, ce, body] = entry.replace(/^\s+/, "").split(SEP)
    if (isAiIdentity(an, ae)) problems.push(`${sha}: author is an AI agent (${an} <${ae}>)`)
    if (isAiIdentity(cn, ce)) problems.push(`${sha}: committer is an AI agent (${cn} <${ce}>)`)
    for (const line of findAiAttribution(body)) problems.push(`${sha}: ${line.trim()}`)
  }
  return problems
}

function report(problems, where) {
  if (problems.length === 0) return 0
  console.error(`AI attribution is not allowed in ${where}:`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error(
    "\nRemove the lines above (or amend/rebase the commits). See CONTRIBUTING.md, section Commits."
  )
  return 1
}

function main(argv) {
  const [mode, ...args] = argv
  switch (mode) {
    case "--message-file":
      return report(findAiAttribution(readFileSync(args[0], "utf8")), "the commit message")
    case "--range":
      return report(checkRange(args[0]), `commits ${args[0]}`)
    case "--env":
      return report(
        args.flatMap((name) => findAiAttribution(process.env[name]).map((l) => `${name}: ${l}`)),
        "this text"
      )
    case "--strip-env": {
      const original = process.env[args[0]] ?? ""
      const cleaned = stripAiAttribution(original)
      process.stdout.write(cleaned)
      return cleaned === original ? 0 : 2
    }
    default:
      console.error(
        "Usage: --message-file <path> | --range <a..b> | --env VAR... | --strip-env VAR"
      )
      return 64
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2))
}
