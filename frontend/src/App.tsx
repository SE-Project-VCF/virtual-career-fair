import { BrowserRouter, Routes, Route } from "react-router-dom"
import StudentProfilePage from "./pages/StudentProfilePage"
import RoleSelection from "./pages/RoleSelection"
import Register from "./pages/Register"
import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import CompanyManagement from "./pages/CompanyManagement"
import Company from "./pages/Company"
import BoothEditor from "./pages/BoothEditor"
import Booths from "./pages/Booths"
import BoothView from "./pages/BoothView"
import EmailVerificationPending from "./pages/EmailVerificationPending"
import VerifyEmail from "./pages/VerifyEmail"
import ChatPage from "./pages/ChatPage" // ✅ added import
import AdminDashboard from "./pages/AdminDashboard"
import BoothHistoryPage from "./pages/BoothHistoryPage" // ✅ added import

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleSelection />} />

        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />

        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/chat" element={<ChatPage />} /> {/* ✅ added route */}
        <Route path="/dashboard/booth-history" element={<BoothHistoryPage />} /> {/* ✅ added route */}

        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/companies" element={<CompanyManagement />} />
        <Route path="/company/:id" element={<Company />} />
        <Route path="/company/:companyId/booth" element={<BoothEditor />} />
        <Route path="/booths" element={<Booths />} />
        <Route path="/booth/:boothId" element={<BoothView />} />
        <Route path="/verification-pending" element={<EmailVerificationPending />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/profile" element={<StudentProfilePage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
