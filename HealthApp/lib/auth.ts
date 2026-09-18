import { SignJWT, type JWTPayload } from "jose"
import { cookies } from "next/headers"
import { getJwtSecret, verifyToken, type UserPayload } from "./token"

export type { UserPayload } from "./token"

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  }
}

export async function createToken(payload: UserPayload): Promise<string> {
  const tokenId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return await new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(tokenId)
    .setExpirationTime("7d")
    .sign(getJwtSecret())
}

async function isRevoked(payload: UserPayload): Promise<boolean> {
  if (!payload.jti) return false

  const { getDatabase } = await import("./mongodb")
  const db = await getDatabase()
  const revoked = await db.collection("revoked_sessions").findOne({ jti: payload.jti }, { projection: { _id: 1 } })
  return Boolean(revoked)
}

export async function getSession(): Promise<UserPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")

  if (!token) return null

  const payload = await verifyToken(token.value)
  if (!payload || (await isRevoked(payload))) return null

  return payload
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set("auth-token", token, authCookieOptions())
}

export async function clearAuthCookie() {
  const cookieStore = await cookies()
  cookieStore.delete("auth-token")
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")
  if (!token) return

  const payload = await verifyToken(token.value)
  if (!payload?.jti) return

  const { getDatabase } = await import("./mongodb")
  const db = await getDatabase()
  await db.collection("revoked_sessions").updateOne(
    { jti: payload.jti },
    {
      $setOnInsert: {
        jti: payload.jti,
        userId: payload.userId,
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: new Date(),
      },
    },
    { upsert: true },
  )
}

export async function verifyAuth(): Promise<UserPayload | null> {
  return await getSession()
}
