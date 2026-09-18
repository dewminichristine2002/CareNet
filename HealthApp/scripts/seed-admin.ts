import { loadEnvConfig } from "@next/env"
import { MongoClient } from "mongodb"
import { hashPassword } from "../lib/password"

loadEnvConfig(process.cwd())

const MONGODB_URI = process.env.MONGODB_URI || ""
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@healthcare.com"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const ADMIN_NAME = process.env.ADMIN_NAME || "System Administrator"

async function seedAdmin() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not defined")
    process.exit(1)
  }

  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log("Connected to MongoDB")

    const db = client.db("healthcare_system")
    const usersCollection = db.collection("users")
    const hospitalsCollection = db.collection("hospitals")

    // Check if admin already exists
    if (!ADMIN_PASSWORD) {
      throw new Error("ADMIN_PASSWORD is not defined")
    }

    const existingAdmin = await usersCollection.findOne({ email: ADMIN_EMAIL.toLowerCase() })

    if (existingAdmin) {
      console.log("Admin user already exists")
      return
    }

    // Create default hospital
    const defaultHospital = {
      name: "Central Healthcare Hospital",
      address: "123 Medical Center Drive, Healthcare City",
      phone: "+1-555-0100",
      email: "info@centralhealthcare.com",
      registrationNumber: "HOS-2024-001",
      type: "private",
      departments: ["Cardiology", "Neurology", "Orthopedics", "Pediatrics", "General Medicine", "Emergency", "Surgery"],
      facilities: ["ICU", "Emergency Room", "Laboratory", "Radiology", "Pharmacy", "Blood Bank"],
      operatingHours: {
        open: "00:00",
        close: "23:59",
      },
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const hospitalResult = await hospitalsCollection.insertOne(defaultHospital)
    console.log("Default hospital created:", hospitalResult.insertedId)

    // Create admin user
    const hashedPassword = await hashPassword(ADMIN_PASSWORD)

    const adminUser = {
      email: ADMIN_EMAIL.toLowerCase(),
      password: hashedPassword,
      name: ADMIN_NAME,
      role: "admin",
      phone: "+1-555-0100",
      hospitalId: hospitalResult.insertedId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const userResult = await usersCollection.insertOne(adminUser)
    console.log("Admin user created:", userResult.insertedId)

    console.log("\n=== Admin Credentials ===")
    console.log("Email:", ADMIN_EMAIL.toLowerCase())
    console.log("Password: configured ADMIN_PASSWORD")
    console.log("========================\n")

    console.log("Seeding completed successfully!")
  } catch (error) {
    console.error("Error seeding admin:", error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

seedAdmin()