import { NextResponse, type NextRequest } from "next/server"
import { getDatabase } from "@/lib/mongodb"
import { authCookieOptions, createToken } from "@/lib/auth"
import { hashPassword } from "@/lib/password"
import type { User } from "@/lib/types"
import { exchangeGoogleAuthorizationCode, getOAuthRedirectUri, verifyGoogleIdToken } from "@/lib/openid"

const roleRoutes = {
  patient: "/patient/dashboard",
  doctor: "/doctor/dashboard",
  admin: "/admin/dashboard",
  pharmacist: "/pharmacist/dashboard",
}

function randomPasswordSeed() {
  return globalThis.crypto.randomUUID()
}

export async function GET(request: NextRequest) {
  const loginUrl = new URL("/auth/login", request.url)

  try {
    const code = request.nextUrl.searchParams.get("code")
    const state = request.nextUrl.searchParams.get("state")
    const storedState = request.cookies.get("oauth_state")?.value
    const storedNonce = request.cookies.get("oauth_nonce")?.value
    const codeVerifier = request.cookies.get("oauth_code_verifier")?.value

    if (!code || !state || !storedState || !storedNonce || !codeVerifier || state !== storedState) {
      loginUrl.searchParams.set("error", "oauth_invalid_state")
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete("oauth_state")
      response.cookies.delete("oauth_nonce")
      response.cookies.delete("oauth_code_verifier")
      return response
    }

    const idToken = await exchangeGoogleAuthorizationCode(code, getOAuthRedirectUri(request), codeVerifier)
    const claims = await verifyGoogleIdToken(idToken, storedNonce)

    const db = await getDatabase()
    const usersCollection = db.collection<User>("users")
    const now = new Date()
    const email = claims.email.toLowerCase()
    const linkedUser = await usersCollection.findOne({ "oauthProviders.google.subject": claims.sub })
    const emailUser = await usersCollection.findOne({ email })

    if (linkedUser && emailUser && linkedUser._id?.toString() !== emailUser._id?.toString()) {
      throw new Error("Google identity is linked to another account")
    }

    if (emailUser?.oauthProviders?.google?.subject && emailUser.oauthProviders.google.subject !== claims.sub) {
      loginUrl.searchParams.set("error", "oauth_account_link_required")
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete("oauth_state")
      response.cookies.delete("oauth_nonce")
      response.cookies.delete("oauth_code_verifier")
      return response
    }

    const existingUser = linkedUser || emailUser
    const user =
      existingUser ||
      ({
        _id: (
          await usersCollection.insertOne({
            email,
            password: await hashPassword(randomPasswordSeed()),
            name: claims.name || email.split("@")[0],
            role: "patient",
            profileImage: claims.picture,
            oauthProviders: {
              google: {
                subject: claims.sub,
                linkedAt: now,
              },
            },
            createdAt: now,
            updatedAt: now,
          } as User)
        ).insertedId,
        email,
        name: claims.name || email.split("@")[0],
        role: "patient",
      } as User)

    if (existingUser) {
      await usersCollection.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            profileImage: existingUser.profileImage || claims.picture,
            "oauthProviders.google.subject": claims.sub,
            "oauthProviders.google.linkedAt": now,
            updatedAt: now,
          },
        },
      )
    }

    const token = await createToken({
      userId: user._id!.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    })

    const redirect = NextResponse.redirect(new URL(roleRoutes[user.role], request.url))
    redirect.cookies.set("auth-token", token, authCookieOptions())
    redirect.cookies.delete("oauth_state")
    redirect.cookies.delete("oauth_nonce")
    redirect.cookies.delete("oauth_code_verifier")
    return redirect
  } catch (error) {
    console.error("[OAuth] Google callback error:", error)
    loginUrl.searchParams.set("error", "oauth_failed")
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete("oauth_state")
    response.cookies.delete("oauth_nonce")
    return response
  }
}
