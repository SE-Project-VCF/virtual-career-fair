import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { authUtils } from "../utils/auth"
import StudentProfilePage from "./StudentProfilePage"
import EmployerProfilePage from "./EmployerProfilePage"

/**
 * Routes `/profile` by role: students see the academic resume profile;
 * representatives, company owners, and other non-students see employer profile.
 */
export default function ProfilePage() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const isAuthenticated = authUtils.isAuthenticated()

  useEffect(() => {
    if (!isAuthenticated) navigate("/login")
  }, [navigate, isAuthenticated])

  if (!isAuthenticated || !user) return null

  if (user.role === "student") {
    return <StudentProfilePage />
  }

  return <EmployerProfilePage />
}
