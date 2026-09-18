import { NextResponse } from "next/server"
import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/auth"
import { ObjectId } from "mongodb"
import { parsePagination } from "@/lib/security"

export async function GET(request?: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const db = await getDatabase()
    const prescriptionsCollection = db.collection("prescriptions")
    const { searchParams } = new URL(request?.url || "http://localhost/api/prescriptions")
    const { limit, skip, page } = parsePagination(searchParams)

    const query: any = {}
    if (session.role === "patient") {
      query.patientId = new ObjectId(session.userId)
    } else if (session.role === "doctor") {
      query.doctorId = new ObjectId(session.userId)
    }

    const prescriptions = await prescriptionsCollection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray()

    // Populate user and medicine details
    const usersCollection = db.collection("users")
    const medicinesCollection = db.collection("medicines")

    const populatedPrescriptions = await Promise.all(
      prescriptions.map(async (prescription) => {
        const patient = await usersCollection.findOne({ _id: prescription.patientId }, { projection: { password: 0 } })
        const doctor = await usersCollection.findOne({ _id: prescription.doctorId }, { projection: { password: 0 } })
        const medicine = await medicinesCollection.findOne({
          _id: prescription.medicineId,
        })

        return {
          ...prescription,
          _id: prescription._id?.toString(),
          patientId: prescription.patientId.toString(),
          doctorId: prescription.doctorId.toString(),
          medicineId: prescription.medicineId.toString(),
          patient,
          doctor,
          medicine,
        }
      }),
    )

    return NextResponse.json({ prescriptions: populatedPrescriptions, pagination: { page, limit } })
  } catch (error) {
    console.error("[v0] Get prescriptions error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
