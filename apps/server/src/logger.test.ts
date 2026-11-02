import { Writable } from "node:stream"
import { describe, expect, it } from "vitest"
import { createLogger } from "./logger.js"

describe("server logger redaction", () => {
  it("redacts the internal token without regressing existing credential redaction", async () => {
    const records: string[] = []
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        records.push(chunk.toString())
        callback()
      },
    })
    const testLogger = createLogger(destination)

    testLogger.info(
      {
        req: {
          headers: {
            "x-internal-token": "INTERNAL_TOKEN_CANARY",
            authorization: "AUTHORIZATION_CANARY",
            cookie: "COOKIE_CANARY",
          },
        },
        res: { headers: { "set-cookie": "SET_COOKIE_CANARY" } },
      },
      "request completed"
    )
    await new Promise<void>((resolve, reject) => {
      testLogger.flush((error) => (error ? reject(error) : resolve()))
    })

    const output = records.join("")
    expect(output).toContain("[REDACTED]")
    expect(output).not.toContain("INTERNAL_TOKEN_CANARY")
    expect(output).not.toContain("AUTHORIZATION_CANARY")
    expect(output).not.toContain("COOKIE_CANARY")
    expect(output).not.toContain("SET_COOKIE_CANARY")
    testLogger.flush()
    destination.end()
  })
})
