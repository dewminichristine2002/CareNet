"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import styles from "../auth.module.css"

export default function LoginPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get("error")
    if (!oauthError) return

    const messages: Record<string, string> = {
      oauth_not_configured: "Google sign-in is not configured.",
      oauth_invalid_state: "Google sign-in expired. Please try again.",
      oauth_email_not_verified: "Your Google email address is not verified.",
      oauth_account_link_required: "This email is already linked to another Google account. Contact an administrator to link it safely.",
      oauth_failed: "Google sign-in failed. Please try again.",
    }

    setError(messages[oauthError] || "Sign-in failed. Please try again.")
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Login failed")
      }

      // Redirect based on role
      const roleRoutes = {
        patient: "/patient/dashboard",
        doctor: "/doctor/dashboard",
        admin: "/admin/dashboard",
        pharmacist: "/pharmacist/dashboard",
      }

      router.push(roleRoutes[data.user.role as keyof typeof roleRoutes])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard}>
        <div className={styles.authHeader}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>H+</div>
            <div className={styles.logoText}>Carenet360</div>
          </div>
          <h1 className={styles.authTitle}>Welcome Back</h1>
          <p className={styles.authSubtitle}>Sign in to access your account</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.authForm}>
          {error && <div className={styles.errorMessage}>{error}</div>}

          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.formLabel}>
              Email Address
            </label>
            <input
              id="email"
              type="email"
              className={styles.formInput}
              placeholder="Enter your email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.formLabel}>
              Password
            </label>
            <input
              id="password"
              type="password"
              className={styles.formInput}
              placeholder="Enter your password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className={styles.authDivider}>
          <span>or</span>
        </div>

        <a href="/api/auth/google" className={styles.oauthButton}>
          Continue with Google
        </a>

        <div className={styles.authFooter}>
          Don't have an account?{" "}
          <Link href="/auth/register" className={styles.authLink}>
            Sign up
          </Link>
        </div>
      </div>
    </div>
  )
}
