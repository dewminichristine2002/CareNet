import { ObjectId, type Db } from "mongodb"

const MAX_STRING_LENGTH = 500
const DEFAULT_PAGE_LIMIT = 25
const MAX_PAGE_LIMIT = 100

export function isNonEmptyString(value: unknown, maxLength = MAX_STRING_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength
}

export function normalizeString(value: unknown, maxLength = MAX_STRING_LENGTH): string | undefined {
  if (!isNonEmptyString(value, maxLength)) return undefined
  return value.trim()
}

export function normalizeEmail(value: unknown): string | undefined {
  const email = normalizeString(value, 254)?.toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined
  return email
}

export function isValidPhone(value: unknown): value is string {
  if (typeof value !== "string") return false
  const phone = value.trim()
  return /^[0-9]{10}$/.test(phone)
}

export function isValidDateOfBirth(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const today = new Date()
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date <= todayUtc
}

export function isValidPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128
}

export function toObjectId(value: unknown): ObjectId | null {
  if (typeof value !== "string" || !ObjectId.isValid(value)) return null
  return new ObjectId(value)
}

export function isAllowedValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T)
}

export function parsePagination(searchParams: URLSearchParams) {
  const requestedLimit = Number(searchParams.get("limit") || DEFAULT_PAGE_LIMIT)
  const requestedPage = Number(searchParams.get("page") || 1)
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT)
  const page = Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1)

  return {
    limit,
    page,
    skip: (page - 1) * limit,
  }
}

export async function doctorCanAccessPatient(
  db: Db,
  doctorId: ObjectId,
  patientId: ObjectId,
  appointmentId?: ObjectId | null,
): Promise<boolean> {
  const patient = await db.collection("users").findOne({ _id: patientId, role: "patient" }, { projection: { _id: 1 } })
  if (!patient) return false

  const appointmentQuery: Record<string, unknown> = {
    doctorId,
    patientId,
    status: { $nin: ["cancelled", "no-show"] },
  }

  if (appointmentId) appointmentQuery._id = appointmentId

  const appointment = await db.collection("appointments").findOne(appointmentQuery, { projection: { _id: 1 } })
  return Boolean(appointment)
}

