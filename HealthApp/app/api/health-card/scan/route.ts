import { type NextRequest, NextResponse } from "next/server"
import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/auth"
import { ObjectId } from "mongodb"
import { doctorCanAccessPatient, isNonEmptyString, toObjectId } from "@/lib/security"

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== "doctor") {
      return NextResponse.json({ error: "Unauthorized - Doctor access only" }, { status: 401 })
    }

    const body = await request.json()
    const { cardNumber, token } = body

    if (!isNonEmptyString(cardNumber, 80) && !isNonEmptyString(token, 100)) {
      return NextResponse.json({ error: "Health card token is required" }, { status: 400 })
    }

    const db = await getDatabase()
    const healthCardsCollection = db.collection("health_cards")
    const usersCollection = db.collection("users")

    // Find health card
    const healthCard = token
      ? await healthCardsCollection.findOne({ qrToken: token, qrExpiresAt: { $gt: new Date() } })
      : await healthCardsCollection.findOne({ cardNumber: cardNumber.trim() })

    if (!healthCard) {
      return NextResponse.json({ error: "Invalid health card" }, { status: 404 })
    }

    const doctorObjectId = toObjectId(session.userId)
    if (!doctorObjectId || !(await doctorCanAccessPatient(db, doctorObjectId, healthCard.patientId as ObjectId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get patient details
    const patient = await usersCollection.findOne(
      { _id: healthCard.patientId },
      { projection: { password: 0, medicalHistory: 0, address: 0 } },
    )

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    }

    const [medicalHistory, prescriptions, appointments] = await Promise.all([
      db.collection("medical_records").find({ patientId: healthCard.patientId }).sort({ createdAt: -1 }).limit(100).toArray(),
      db.collection("prescriptions").find({ patientId: healthCard.patientId }).sort({ createdAt: -1 }).limit(100).toArray(),
      db.collection("appointments").find({ patientId: healthCard.patientId }).sort({ date: -1 }).limit(100).toArray(),
    ])

    const serializeDocument = (document: Record<string, any>) => ({
      ...document,
      _id: document._id?.toString(),
      patientId: document.patientId?.toString(),
      doctorId: document.doctorId?.toString(),
      appointmentId: document.appointmentId?.toString(),
      medicineId: document.medicineId?.toString(),
      prescriptions: Array.isArray(document.prescriptions)
        ? document.prescriptions.map((prescriptionId: ObjectId) => prescriptionId.toString())
        : document.prescriptions,
    })

    return NextResponse.json({
      patient: {
        _id: patient._id.toString(),
        name: patient.name,
        phone: patient.phone,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        allergies: patient.allergies,
        bloodGroup: patient.bloodGroup,
        emergencyContact: patient.emergencyContact, 
      },
      healthCard: {
        _id: healthCard._id.toString(),
        cardNumber: healthCard.cardNumber,
      },
      medicalHistory: medicalHistory.map(serializeDocument),
      prescriptions: prescriptions.map(serializeDocument),
      appointments: appointments.map(serializeDocument),
    })
  } catch (error) {
    console.error("[v0] Scan health card error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
