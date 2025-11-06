import { useState, useEffect } from "react"
import { IconButton, Menu, MenuItem, Avatar, Divider } from "@mui/material"
import { useNavigate } from "react-router-dom"
import { authUtils } from "../utils/auth"
import { doc, getDoc } from "firebase/firestore"
import { db } from "../firebase"
import { getAuth } from "firebase/auth"

interface ProfileMenuProps {
  photoURL?: string
}

export default function ProfileMenu() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [role, setRole] = useState(null)
  const open = Boolean(anchorEl)
  const [photoURL, setPhotoURL] = useState<string | undefined>()

  useEffect(() => {
    const fetchPhoto = async () => {
      const user = getAuth().currentUser
      if (!user) return
      const userRef = doc(db, "users", user.uid)
      const snapshot = await getDoc(userRef)
      if (snapshot.exists()) {
        setPhotoURL(snapshot.data()?.photoURL)
      }
    }
    fetchPhoto()
  }, [])
  useEffect(() => {
    const fetchRole = async () => {
      if (!user?.uid) return
      try {
        const userRef = doc(db, "users", user.uid)
        const snapshot = await getDoc(userRef)
        if (snapshot.exists()) {
          const data = snapshot.data()
          setRole(data.role)
        }
      } catch (error) {
        console.error("Error fetching user role:", error)
      }
    }
    fetchRole()
  }, [user])

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)
  const handleMenuClose = () => setAnchorEl(null)

  const handleProfile = () => {
    handleMenuClose()
    navigate("/profile")
  }

  const handleResetPassword = () => {
    handleMenuClose()
    navigate("/password-reset")
  }

  const handleLogout = () => {
    handleMenuClose()
    authUtils.logout()
    navigate("/login")
  }

  return (
    <>
      <IconButton onClick={handleMenuOpen}>
      <Avatar
  sx={{ bgcolor: "#b03a6c", width: 40, height: 40 }}
  src={photoURL}
>
  {!photoURL && (user?.email?.charAt(0).toUpperCase() || "U")}
</Avatar>

      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleMenuClose}
        PaperProps={{
          elevation: 3,
          sx: { mt: 1.5, minWidth: 180, borderRadius: 2 },
        }}
      >
        <MenuItem onClick={handleProfile}>Edit Profile</MenuItem>
        <Divider />

        {/* Role-specific options (only if needed in the menu) */}
        {role === "companyOwner" || role === "companyRepresentative" ? (
          <>
            <MenuItem onClick={() => navigate("/company/dashboard")}>
              Company Dashboard
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => navigate("/company/post-job")}>
              Post a Job
            </MenuItem>
            <Divider />
          </>
        ) : null}

        <MenuItem onClick={handleResetPassword}>Reset Password</MenuItem>
        <Divider />

        <MenuItem onClick={handleLogout} sx={{ color: "red" }}>
          Logout
        </MenuItem>
      </Menu>
    </>
  )
}
