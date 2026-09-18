import { NextResponse } from "next/server"
import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/auth"
import { ObjectId } from "mongodb"

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== "doctor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const db = await getDatabase()
    const usersCollection = db.collection("users")
    const doctorId = new ObjectId(session.userId)
    const appointments = await db
      .collection("appointments")
      .distinct("patientId", { doctorId, status: { $nin: ["cancelled", "no-show"] } })

    const patients = await usersCollection
      .find(
        { _id: { $in: appointments }, role: "patient" },
        { projection: { password: 0, medicalHistory: 0, allergies: 0, emergencyContact: 0, address: 0 } },
      )
      .limit(100)
      .toArray()

    return NextResponse.json({ patients })
  } catch (error) {
    console.error("[v0] Get patients error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
