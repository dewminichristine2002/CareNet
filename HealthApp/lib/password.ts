import { randomBytes, pbkdf2 } from "crypto"
import { promisify } from "util"

const pbkdf2Async = promisify(pbkdf2)
const CURRENT_ITERATIONS = 310000
const LEGACY_ITERATIONS = 1000
const KEY_LENGTH = 64
const DIGEST = "sha512"

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex")
  const hash = await pbkdf2Async(password, salt, CURRENT_ITERATIONS, KEY_LENGTH, DIGEST)
  return `${salt}:${hash.toString("hex")}`
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const [salt, originalHash] = hashedPassword.split(":")
  if (!salt || !originalHash) return false

  for (const iterations of [CURRENT_ITERATIONS, LEGACY_ITERATIONS]) {
    const hash = await pbkdf2Async(password, salt, iterations, KEY_LENGTH, DIGEST)
    if (hash.toString("hex") === originalHash) return true
  }

  return false
}
