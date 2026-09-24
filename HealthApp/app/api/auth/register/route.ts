import { type NextRequest, NextResponse } from "next/server"
import { getDatabase } from "@/lib/mongodb"
import { hashPassword } from "@/lib/password"
import { createToken, setAuthCookie } from "@/lib/auth"
import type { User } from "@/lib/types"
import { isAllowedValue, isValidDateOfBirth, isValidPassword, isValidPhone, normalizeEmail, normalizeString } from "@/lib/security"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = normalizeEmail(body.email)
    const name = normalizeString(body.name, 100)
    const phone = normalizeString(body.phone, 30)
    const dateOfBirth = normalizeString(body.dateOfBirth, 30)
    const gender = isAllowedValue(body.gender, ["male", "female", "other"] as const) ? body.gender : undefined
    const role = "patient"
    const { password } = body

    if (!email || !isValidPassword(password) || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (phone !== undefined && !isValidPhone(phone)) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 })
    }

    if (dateOfBirth !== undefined && !isValidDateOfBirth(dateOfBirth)) {
      return NextResponse.json({ error: "Date of birth must be a valid date and cannot be in the future" }, { status: 400 })
    }

    const db = await getDatabase()
    const usersCollection = db.collection<User>("users")

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email })
    if (existingUser) {
      return NextResponse.json({ error: "User already exists" }, { status: 400 })
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user
    const newUser: User = {
      email,
      password: hashedPassword,
      name,
      role,
      phone,
      dateOfBirth,
      gender,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = await usersCollection.insertOne(newUser)

    // Create JWT token
    const token = await createToken({
      userId: result.insertedId.toString(),
      email,
      role,
      name,
    })

    // Set cookie
    await setAuthCookie(token)

    return NextResponse.json({
      success: true,
      user: {
        id: result.insertedId.toString(),
        email,
        name,
        role,
      },
    })
  } catch (error) {
    console.error("[v0] Registration error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
