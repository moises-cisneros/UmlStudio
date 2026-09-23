import "../env.js"
import { loadConfig } from "../config.js"
import { createRedisClient, getJwtSecret } from "../redis.js"
import { logger } from "../logger.js"
import { createAuthService, createRedisUserRepository } from "../services/auth-service.js"
import { revokeLegacySeedUsers, seedDefaultUsers } from "../auth/seed.js"

async function main() {
  const config = loadConfig()
  const redis = createRedisClient(config.REDIS_URL)
  await redis.connect()
  logger.info({ event: "seed.connected" }, "connected to Redis")

  if (process.argv.includes("--revoke-legacy")) {
    const { revoked, missing } = await revokeLegacySeedUsers(redis)
    logger.info(
      { event: "seed.revoke_summary", revoked, missing },
      `legacy seed revocation completed: ${revoked} revoked, ${missing} already absent`
    )
  }

  const repo = createRedisUserRepository(redis)
  const auth = createAuthService({
    repo,
    jwtSecret: getJwtSecret(),
  })

  const { seeded, existing } = await seedDefaultUsers(auth, repo)
  logger.info(
    { event: "seed.summary", seeded, existing },
    `user seeding completed: ${seeded} seeded, ${existing} already existed`
  )

  await redis.quit()
}

main().catch((err) => {
  logger.error({ err }, "failed to seed users")
  process.exit(1)
})
