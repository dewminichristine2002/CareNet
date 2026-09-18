import { NextResponse, type NextRequest } from "next/server"
import {
  createOAuthNonce,
  createOAuthState,
  createPkceChallenge,
  createPkceVerifier,
  getGoogleOAuthConfig,
  getGoogleOpenIdConfiguration,
  getOAuthRedirectUri,
  oauthCookieOptions,
} from "@/lib/openid"

export async function GET(request: NextRequest) {
  try {
    const { clientId } = getGoogleOAuthConfig()
    const configuration = await getGoogleOpenIdConfiguration()
    const state = createOAuthState()
    const nonce = createOAuthNonce()
    const codeVerifier = createPkceVerifier()
    const codeChallenge = await createPkceChallenge(codeVerifier)

    const authorizationUrl = new URL(configuration.authorization_endpoint)
    authorizationUrl.searchParams.set("client_id", clientId)
    authorizationUrl.searchParams.set("redirect_uri", getOAuthRedirectUri(request))
    authorizationUrl.searchParams.set("response_type", "code")
    authorizationUrl.searchParams.set("scope", "openid email profile")
    authorizationUrl.searchParams.set("state", state)
    authorizationUrl.searchParams.set("nonce", nonce)
    authorizationUrl.searchParams.set("code_challenge", codeChallenge)
    authorizationUrl.searchParams.set("code_challenge_method", "S256")
    authorizationUrl.searchParams.set("prompt", "select_account")

    const response = NextResponse.redirect(authorizationUrl)
    response.cookies.set("oauth_state", state, oauthCookieOptions())
    response.cookies.set("oauth_nonce", nonce, oauthCookieOptions())
    response.cookies.set("oauth_code_verifier", codeVerifier, oauthCookieOptions())
    return response
  } catch (error) {
    console.error("[OAuth] Google login start error:", error)
    return NextResponse.redirect(new URL("/auth/login?error=oauth_not_configured", request.url))
  }
}

