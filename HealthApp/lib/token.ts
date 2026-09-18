import { jwtVerify, type JWTPayload } from "jose"

export interface UserPayload {
  userId: string
  email: string
  role: "patient" | "doctor" | "admin" | "pharmacist"
  name: string
  jti?: string
  exp?: number
  iat?: number
}

export function getJwtSecret() {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters")
  }

  return new TextEncoder().encode(jwtSecret)
}

export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const verified = await jwtVerify(token, getJwtSecret())
    return verified.payload as unknown as UserPayload & JWTPayload
  } catch {
    return null
  }
}
