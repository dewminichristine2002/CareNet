import { type NextRequest, NextResponse } from "next/server"
import { getDatabase } from "@/lib/mongodb"
import { verifyAuth } from "@/lib/auth"
import { hashPassword } from "@/lib/password"
import type { User } from "@/lib/types"
import { isAllowedValue, isValidPassword, normalizeEmail, normalizeString, parsePagination, toObjectId } from "@/lib/security"

// Admin creates doctors, pharmacists, and other staff
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth()
    if (!auth || auth.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 401 })
    }

    const body = await request.json()
    const email = normalizeEmail(body.email)
    const name = normalizeString(body.name, 100)
    const role = body.role
    const { password } = body

    if (!email || !isValidPassword(password) || !name || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!["doctor", "pharmacist"].includes(role)) {
      return NextResponse.json({ error: "Invalid role. Only doctor and pharmacist allowed" }, { status: 400 })
    }

    const hospitalObjectId = body.hospitalId ? toObjectId(body.hospitalId) : null
    if (body.hospitalId && !hospitalObjectId) {
      return NextResponse.json({ error: "Invalid hospital" }, { status: 400 })
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

    // Create staff user
    const newUser: User = {
      email,
      password: hashedPassword,
      name,
      role,
      phone: normalizeString(body.phone, 30),
      dateOfBirth: normalizeString(body.dateOfBirth, 30),
      gender: isAllowedValue(body.gender, ["male", "female", "other"] as const) ? body.gender : undefined,
      specialization: normalizeString(body.specialization, 100),
      licenseNumber: normalizeString(body.licenseNumber, 100),
      department: normalizeString(body.department, 100),
      hospitalId: hospitalObjectId || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = await usersCollection.insertOne(newUser)

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
    console.error("[v0] Create staff error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Get all staff members
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth()
    if (!auth || auth.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const db = await getDatabase()
    const usersCollection = db.collection<User>("users")
    const { searchParams } = new URL(request.url)
    const { limit, skip, page } = parsePagination(searchParams)

    const staff = await usersCollection
      .find({
        role: { $in: ["doctor", "pharmacist"] },
      }, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    return NextResponse.json({ staff, pagination: { page, limit } })
  } catch (error) {
    console.error("[v0] Fetch staff error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
