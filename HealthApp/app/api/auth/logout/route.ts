import { NextResponse } from "next/server"
import { clearAuthCookie, revokeCurrentSession } from "@/lib/auth"

export async function POST() {
  try {
    await revokeCurrentSession()
    await clearAuthCookie()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Logout error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
