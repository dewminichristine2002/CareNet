import { type NextRequest, NextResponse } from "next/server"
import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/auth"
import type { Prescription } from "@/lib/types"
import { ObjectId } from "mongodb"
import { doctorCanAccessPatient, isNonEmptyString, toObjectId } from "@/lib/security"

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== "doctor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { patientId, medicineId, medicineName, dosage, frequency, duration, instructions, appointmentId } = body

    const patientObjectId = toObjectId(patientId)
    const doctorObjectId = toObjectId(session.userId)
    const medicineObjectId = medicineId ? toObjectId(medicineId) : null
    const appointmentObjectId = appointmentId ? toObjectId(appointmentId) : null

    if (!patientObjectId || !doctorObjectId || (medicineId && !medicineObjectId) || (appointmentId && !appointmentObjectId)) {
      return NextResponse.json({ error: "Invalid identifier" }, { status: 400 })
    }

    if (!isNonEmptyString(medicineName, 150) || !isNonEmptyString(dosage, 100) || !isNonEmptyString(frequency, 100) || !isNonEmptyString(duration, 100)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const db = await getDatabase()
    const canAccess = await doctorCanAccessPatient(db, doctorObjectId, patientObjectId, appointmentObjectId)
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const prescriptionsCollection = db.collection<Prescription>("prescriptions")

    const newPrescription: Prescription = {
      patientId: patientObjectId,
      doctorId: doctorObjectId,
      medicineId: medicineObjectId || new ObjectId(),
      medicineName: medicineName.trim(),
      dosage: dosage.trim(),
      frequency: frequency.trim(),
      duration: duration.trim(),
      instructions: isNonEmptyString(instructions, 500) ? instructions.trim() : undefined,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = await prescriptionsCollection.insertOne(newPrescription)

    return NextResponse.json({
      success: true,
      prescriptionId: result.insertedId.toString(),
    })
  } catch (error) {
    console.error("[v0] Create prescription error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
