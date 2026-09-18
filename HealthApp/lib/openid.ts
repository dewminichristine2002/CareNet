import { createRemoteJWKSet, jwtVerify } from "jose"
import type { NextRequest } from "next/server"

const GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
const OAUTH_COOKIE_MAX_AGE = 10 * 60

interface OpenIdConfiguration {
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  issuer: string
}

export interface GoogleIdTokenClaims {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  picture?: string
}

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured")
  }

  return { clientId, clientSecret }
}

export function getOAuthRedirectUri(request: NextRequest) {
  const baseUrl = process.env.OAUTH_REDIRECT_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  return `${baseUrl.replace(/\/$/, "")}/api/auth/google/callback`
}

export function createOAuthState() {
  return globalThis.crypto.randomUUID()
}

export function createOAuthNonce() {
  return globalThis.crypto.randomUUID()
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function createPkceVerifier() {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return encodeBase64Url(bytes)
}

export async function createPkceChallenge(verifier: string) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return encodeBase64Url(new Uint8Array(digest))
}

export function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: "/",
  }
}

export async function getGoogleOpenIdConfiguration(): Promise<OpenIdConfiguration> {
  const response = await fetch(GOOGLE_DISCOVERY_URL, { cache: "force-cache" })
  if (!response.ok) {
    throw new Error("Unable to load Google OpenID configuration")
  }

  return response.json()
}

export async function exchangeGoogleAuthorizationCode(code: string, redirectUri: string, codeVerifier: string) {
  const { clientId, clientSecret } = getGoogleOAuthConfig()
  const configuration = await getGoogleOpenIdConfiguration()
  const response = await fetch(configuration.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  })

  if (!response.ok) {
    throw new Error("Google authorization code exchange failed")
  }

  const tokenSet = await response.json()
  if (typeof tokenSet.id_token !== "string") {
    throw new Error("Google did not return an ID token")
  }

  return tokenSet.id_token
}

export async function verifyGoogleIdToken(idToken: string, nonce: string): Promise<GoogleIdTokenClaims> {
  const { clientId } = getGoogleOAuthConfig()
  const configuration = await getGoogleOpenIdConfiguration()
  const jwks = createRemoteJWKSet(new URL(configuration.jwks_uri))
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: configuration.issuer,
    audience: clientId,
  })

  if (payload.nonce !== nonce) {
    throw new Error("Invalid OpenID nonce")
  }

  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Google ID token is missing required claims")
  }

  if (payload.email_verified !== true) {
    throw new Error("Google email is not verified")
  }

  return payload as unknown as GoogleIdTokenClaims
}

