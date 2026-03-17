import { BrowserRouter, Routes, Route, useParams } from "react-router-dom"
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
import BoothVisitorsPage from "./pages/BoothVisitorsPage"
import EmailVerificationPending from "./pages/EmailVerificationPending"
import VerifyEmail from "./pages/VerifyEmail"
import ChatPage from "./pages/ChatPage"
import AdminDashboard from "./pages/AdminDashboard"
import BoothHistoryPage from "./pages/BoothHistoryPage"
import JobInvitations from "./pages/JobInvitations"
import FairBoothsPage from "./pages/FairBoothsPage"
import StudentFairBoothsPage from "./pages/StudentFairBoothsPage"
import TailorResumeSimplePage from "./pages/TailorResumeSimplePage"
import TailoredResumeViewPage from "./pages/TailoredResumeViewPage"
import TailoredResumesPage from "./pages/TailoredResumesPage"
import SubmissionsPage from "./pages/SubmissionsPage"
import FairList from "./pages/FairList"
import FairLanding from "./pages/FairLanding"
import FairBooths from "./pages/FairBooths"
import FairBoothView from "./pages/FairBoothView"
import FairAdminDashboard from "./pages/FairAdminDashboard"
import { FairProvider } from "./contexts/FairContext"

// Wrapper components to inject fairId from URL params into FairProvider
function FairLandingWrapper() {
  const { fairId } = useParams<{ fairId: string }>()
  return <FairProvider fairId={fairId || ""}><FairLanding /></FairProvider>
}
function FairBoothsWrapper() {
  const { fairId } = useParams<{ fairId: string }>()
  return <FairProvider fairId={fairId || ""}><FairBooths /></FairProvider>
}
function FairBoothViewWrapper() {
  const { fairId } = useParams<{ fairId: string }>()
  return <FairProvider fairId={fairId || ""}><FairBoothView /></FairProvider>
}
function FairAdminWrapper() {
  const { fairId } = useParams<{ fairId: string }>()
  return <FairProvider fairId={fairId || ""}><FairAdminDashboard /></FairProvider>
}
function FairBoothEditorWrapper() {
  const { fairId } = useParams<{ fairId: string }>()
  return <FairProvider fairId={fairId || ""}><BoothEditor /></FairProvider>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleSelection />} />

        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />

        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/chat" element={<ChatPage />} />
        <Route path="/dashboard/booth-history" element={<BoothHistoryPage />} />
        <Route path="/dashboard/job-invitations" element={<JobInvitations />} />
        <Route path="/dashboard/tailored-resumes" element={<TailoredResumesPage />} />
        <Route path="/dashboard/tailored-resume/:tailoredResumeId" element={<TailoredResumeViewPage />} />
        <Route path="/invitations/:invitationId/tailor-simple" element={<TailorResumeSimplePage />} />

        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/fairs/:fairId" element={<FairBoothsPage />} />
        <Route path="/companies" element={<CompanyManagement />} />
        <Route path="/company/:id" element={<Company />} />
        <Route path="/company/:companyId/booth" element={<BoothEditor />} />
        <Route path="/company/:companyId/submissions" element={<SubmissionsPage />} />
        <Route path="/booths" element={<Booths />} />
        <Route path="/fairs/:fairId/booths" element={<StudentFairBoothsPage />} />
        <Route path="/booth/:boothId" element={<BoothView />} />
        <Route path="/booth/:boothId/visitors" element={<BoothVisitorsPage />} />
        <Route path="/verification-pending" element={<EmailVerificationPending />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/profile" element={<StudentProfilePage />} />

        {/* Multi-fair routes */}
        <Route path="/fairs" element={<FairList />} />
        <Route path="/fair/:fairId" element={<FairLandingWrapper />} />
        <Route path="/fair/:fairId/booths" element={<FairBoothsWrapper />} />
        <Route path="/fair/:fairId/booth/:boothId" element={<FairBoothViewWrapper />} />
        <Route path="/fair/:fairId/admin" element={<FairAdminWrapper />} />
        <Route path="/fair/:fairId/company/:companyId/booth" element={<FairBoothEditorWrapper />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
