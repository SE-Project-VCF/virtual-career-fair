import { useState } from "react"
import { IconButton, Menu, MenuItem, Avatar, Divider } from "@mui/material"
import { useNavigate } from "react-router-dom"
import { authUtils } from "../utils/auth"

export default function ProfileMenu() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  const handleProfile = () => {
    handleMenuClose()
    navigate("/profile")
  }

  const handleLogout = () => {
    handleMenuClose()
    authUtils.logout()
    navigate("/login")
  }

  return (
    <>
      <IconButton onClick={handleMenuOpen} sx={{ ml: 2 }}>
        <Avatar sx={{ bgcolor: "#388560", width: 40, height: 40 }}>
          {user?.email?.charAt(0).toUpperCase() || "U"}
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
        <MenuItem onClick={handleLogout} sx={{ color: "red" }}>
          Logout
        </MenuItem>
      </Menu>
    </>
  )
}
