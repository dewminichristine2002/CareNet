import { type NextRequest, NextResponse } from "next/server"
import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/auth"
import type { MedicalRecord } from "@/lib/types"
import { ObjectId } from "mongodb"
import { doctorCanAccessPatient, isNonEmptyString, toObjectId } from "@/lib/security"

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== "doctor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { patientId, appointmentId, diagnosis, symptoms, treatment, prescriptions, labResults, notes } = body

    if (!patientId || !isNonEmptyString(diagnosis) || !isNonEmptyString(treatment) || (!isNonEmptyString(symptoms) && !Array.isArray(symptoms))) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const patientObjectId = toObjectId(patientId)
    const doctorObjectId = toObjectId(session.userId)
    const appointmentObjectId = appointmentId ? toObjectId(appointmentId) : null

    if (!patientObjectId || !doctorObjectId || (appointmentId && !appointmentObjectId)) {
      return NextResponse.json({ error: "Invalid identifier" }, { status: 400 })
    }

    const db = await getDatabase()
    const canAccess = await doctorCanAccessPatient(db, doctorObjectId, patientObjectId, appointmentObjectId)
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const medicalRecordsCollection = db.collection<MedicalRecord>("medical_records")
    const normalizedSymptoms = Array.isArray(symptoms) ? symptoms.filter((symptom) => isNonEmptyString(symptom)) : [symptoms.trim()]

    const newRecord: MedicalRecord = {
      patientId: patientObjectId,
      doctorId: doctorObjectId,
      appointmentId: appointmentObjectId || undefined,
      diagnosis: diagnosis.trim(),
      symptoms: normalizedSymptoms.map((symptom) => symptom.trim()),
      treatment: treatment.trim(),
      prescriptions: Array.isArray(prescriptions) ? prescriptions.map(toObjectId).filter(Boolean) as ObjectId[] : [],
      labResults: isNonEmptyString(labResults) ? labResults.trim() : undefined,
      notes: isNonEmptyString(notes) ? notes.trim() : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = await medicalRecordsCollection.insertOne(newRecord)

    return NextResponse.json({
      success: true,
      recordId: result.insertedId.toString(),
    })
  } catch (error) {
    console.error("[v0] Create medical record error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
