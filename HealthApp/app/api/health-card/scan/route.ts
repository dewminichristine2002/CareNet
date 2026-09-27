import { type NextRequest, NextResponse } from "next/server"
import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/auth"
import { ObjectId } from "mongodb"
import { doctorCanAccessPatient, isNonEmptyString, objectIdQueryValues, toObjectId } from "@/lib/security"

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

    // QR/card possession alone does not grant access. Only the doctor linked
    // to this patient through a valid appointment can view or add clinical data.
    const doctorObjectId = toObjectId(session.userId)
    if (!doctorObjectId || !(await doctorCanAccessPatient(db, doctorObjectId, healthCard.patientId as ObjectId))) {
      return NextResponse.json(
        { error: "Forbidden: this patient is not linked to your appointments" },
        { status: 403 },
      )
    }

    // Excessive QR medical-data exposure mitigation: only fetch fields needed to
    // identify the patient and display emergency card details.
    const patientIdValues = objectIdQueryValues(healthCard.patientId)
    const patient = await usersCollection.findOne(
      { _id: { $in: patientIdValues as any[] } },
      { projection: { name: 1, allergies: 1, bloodGroup: 1, emergencyContact: 1 } },
    )

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    }

    // Return only minimum necessary card-scan data. Clinical data is available
    // through dedicated appointment-protected medical record/prescription APIs.
    return NextResponse.json({
      patient: {
        _id: patient._id.toString(),
        name: patient.name,
        allergies: patient.allergies,
        bloodGroup: patient.bloodGroup,
        emergencyContact: patient.emergencyContact,
      },
      healthCard: {
        _id: healthCard._id.toString(),
        cardNumber: healthCard.cardNumber,
      },
    })
  } catch (error) {
    console.error("[v0] Scan health card error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
