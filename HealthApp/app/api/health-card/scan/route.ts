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
      medicalHistory: [],
      prescriptions: [],
      appointments: [],
    })
  } catch (error) {
    console.error("[v0] Scan health card error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
