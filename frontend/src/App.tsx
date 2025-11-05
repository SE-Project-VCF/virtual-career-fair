import { BrowserRouter, Routes, Route } from "react-router-dom"
import StudentProfilePage from "./pages/StudentProfilePage"
import RoleSelection from "./pages/RoleSelection"
import StudentRegister from "./pages/StudentRegister"
import StudentLogin from "./pages/StudentLogin"
import EmployerRegister from "./pages/EmployerRegister"
import EmployerLogin from "./pages/EmployerLogin"
import Dashboard from "./pages/Dashboard"
import EmployerRoleSelection from "./pages/EmployerRoleSelection"
import RepresentativeLogin from "./pages/RepresentativeLogin"
import RepresentativeRegister from "./pages/RepresentativeRegister"
import InviteCodeManager from "./pages/InviteCodeManager"
import EmailVerificationPending from "./pages/EmailVerificationPending"
import VerifyEmail from "./pages/VerifyEmail"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleSelection />} />

        <Route path="/student/register" element={<StudentRegister />} />
        <Route path="/student/login" element={<StudentLogin />} />

        <Route path="/employer/role-selection" element={<EmployerRoleSelection />} />

        <Route path="/employer/register" element={<EmployerRegister />} />
        <Route path="/employer/login" element={<EmployerLogin />} />

        <Route path="/representative/register" element={<RepresentativeRegister />} />
        <Route path="/representative/login" element={<RepresentativeLogin />} />

        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/invite-code" element={<InviteCodeManager />} />
        <Route path="/verification-pending" element={<EmailVerificationPending />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/profile" element={<StudentProfilePage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
