import { BrowserRouter, Routes, Route } from "react-router-dom"
import RoleSelection from "./pages/RoleSelection"
import Register from "./pages/Register"
import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import CompanyManagement from "./pages/CompanyManagement"
import Company from "./pages/Company"
import EmailVerificationPending from "./pages/EmailVerificationPending"
import VerifyEmail from "./pages/VerifyEmail"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleSelection />} />

        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />

        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/companies" element={<CompanyManagement />} />
        <Route path="/company/:id" element={<Company />} />
        <Route path="/verification-pending" element={<EmailVerificationPending />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
