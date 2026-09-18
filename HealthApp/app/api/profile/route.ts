import { NextResponse } from "next/server"
import { getDatabase } from "@/lib/mongodb"
import { verifyAuth } from "@/lib/auth"
import { hashPassword, verifyPassword } from "@/lib/password"
import { ObjectId } from "mongodb"
import { isAllowedValue, isValidPassword, normalizeString, toObjectId } from "@/lib/security"

export async function GET(request: Request) {
  try {
    const user = await verifyAuth()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const db = await getDatabase()
    const userData = await db
      .collection("users")
      .findOne({ _id: new ObjectId(user.userId) }, { projection: { password: 0 } })

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ user: userData })
  } catch (error) {
    console.error("[Profile] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await verifyAuth()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      phone,
      dateOfBirth,
      gender,
      address,
      allergies,
      bloodGroup,
      medicalHistory,
      emergencyContact,
      currentPassword,
      newPassword,
    } = body

    const db = await getDatabase()

    const updateData: any = { updatedAt: new Date() }

    if (name !== undefined) updateData.name = normalizeString(name, 100)
    if (phone !== undefined) updateData.phone = normalizeString(phone, 30)
    if (dateOfBirth !== undefined) updateData.dateOfBirth = normalizeString(dateOfBirth, 30)
    if (gender !== undefined && isAllowedValue(gender, ["male", "female", "other"] as const)) updateData.gender = gender
    if (address !== undefined) updateData.address = normalizeString(address, 300)
    if (allergies !== undefined) updateData.allergies = normalizeString(allergies, 500)
    if (bloodGroup !== undefined) updateData.bloodGroup = normalizeString(bloodGroup, 10)
    if (medicalHistory !== undefined) updateData.medicalHistory = normalizeString(medicalHistory, 1000)
    if (emergencyContact !== undefined) updateData.emergencyContact = normalizeString(emergencyContact, 300)

    // read existing document
    const existing = await db.collection("users").findOne({ _id: new ObjectId(user.userId) })
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Handle password change if provided
    if (currentPassword && newPassword) {
      if (!isValidPassword(newPassword)) {
        return NextResponse.json({ error: "New password must be between 8 and 128 characters" }, { status: 400 })
      }

      const isValidCurrentPassword = await verifyPassword(currentPassword, existing.password || "")

      if (!isValidCurrentPassword) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
      }

      updateData.password = await hashPassword(newPassword)
    }

    // compute changed fields
    const changedFields: Record<string, { from: any; to: any }> = {}
    for (const key of Object.keys(updateData)) {
      if (key === "password") continue // don't include raw password in change summary
      const oldVal = (existing as any)[key]
      const newVal = (updateData as any)[key]
      if (JSON.stringify(oldVal ?? null) !== JSON.stringify(newVal ?? null)) {
        changedFields[key] = { from: oldVal ?? null, to: newVal ?? null }
      }
    }

    // insert change log for potential undo
    const changeLog = db.collection("profile_change_log")
    const logDoc: any = {
      userId: new ObjectId(user.userId),
      before: existing,
      changes: changedFields,
      createdAt: new Date(),
    }
    const insertRes = await changeLog.insertOne(logDoc)

    // apply update
    await db.collection("users").updateOne({ _id: new ObjectId(user.userId) }, { $set: updateData })

    const updatedUser = await db
      .collection("users")
      .findOne({ _id: new ObjectId(user.userId) }, { projection: { password: 0 } })

    // email notifications for profile changes were removed per request

    return NextResponse.json({ message: "Profile updated successfully", user: updatedUser, changeLogId: insertRes.insertedId.toString() })
  } catch (error) {
    console.error("[Profile] PUT error:", error)
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  // This POST endpoint handles undo: expects { changeLogId }
  try {
    const user = await verifyAuth()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { changeLogId } = body || {}
    const changeLogObjectId = toObjectId(changeLogId)
    if (!changeLogObjectId) return NextResponse.json({ error: "Missing changeLogId" }, { status: 400 })

    const db = await getDatabase()
    const changeLog = db.collection("profile_change_log")
    const users = db.collection("users")

    const log = await changeLog.findOne({ _id: changeLogObjectId, userId: new ObjectId(user.userId) })
    if (!log) return NextResponse.json({ error: "Change log not found" }, { status: 404 })

    // revert user document to the snapshot in 'before'
    const before = (log as any).before
    if (!before) return NextResponse.json({ error: "Invalid change log" }, { status: 400 })

    const id = before._id
    delete before._id // remove _id before $set
    await users.updateOne({ _id: new ObjectId(id) }, { $set: before })

    // remove change log so it can't be used again
    await changeLog.deleteOne({ _id: changeLogObjectId })

    const updated = await users.findOne({ _id: new ObjectId(id) }, { projection: { password: 0 } })
    return NextResponse.json({ user: updated })
  } catch (error) {
    console.error("[Profile] UNDO error:", error)
    return NextResponse.json({ error: "Failed to undo profile change" }, { status: 500 })
  }
}

