import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, afterEach } from "vitest"
import App from "../App"

vi.mock("../pages/RoleSelection", () => ({ default: () => <div>RoleSelection</div> }))
vi.mock("../pages/Register", () => ({ default: () => <div>Register</div> }))
vi.mock("../pages/Login", () => ({ default: () => <div>Login</div> }))
vi.mock("../pages/Dashboard", () => ({ default: () => <div>Dashboard</div> }))
vi.mock("../pages/FairyJobmotherPage", () => ({ default: () => <div>FairyJobmotherPage</div> }))
vi.mock("../pages/FairAnnouncementsPage", () => ({ default: () => <div>FairAnnouncementsPage</div> }))
vi.mock("../pages/CompanyManagement", () => ({ default: () => <div>CompanyManagement</div> }))
vi.mock("../pages/Company", () => ({ default: () => <div>Company</div> }))
vi.mock("../pages/BoothEditor", () => ({ default: () => <div>BoothEditor</div> }))
vi.mock("../pages/Booths", () => ({ default: () => <div>Booths</div> }))
vi.mock("../pages/BoothView", () => ({ default: () => <div>BoothView</div> }))
vi.mock("../pages/EmailVerificationPending", () => ({ default: () => <div>EmailVerificationPending</div> }))
vi.mock("../pages/VerifyEmail", () => ({ default: () => <div>VerifyEmail</div> }))
vi.mock("../pages/ChatPage", () => ({ default: () => <div>ChatPage</div> }))
vi.mock("../pages/AdminDashboard", () => ({ default: () => <div>AdminDashboard</div> }))
vi.mock("../pages/BoothHistoryPage", () => ({ default: () => <div>BoothHistoryPage</div> }))
vi.mock("../pages/JobInvitations", () => ({ default: () => <div>JobInvitations</div> }))
vi.mock("../pages/FairList", () => ({ default: () => <div>FairList</div> }))
vi.mock("../pages/FairLanding", () => ({ default: () => <div>FairLanding</div> }))
vi.mock("../pages/FairBooths", () => ({ default: () => <div>FairBooths</div> }))
vi.mock("../pages/FairBoothView", () => ({ default: () => <div>FairBoothView</div> }))
vi.mock("../pages/FairAdminDashboard", () => ({ default: () => <div>FairAdminDashboard</div> }))
vi.mock("../pages/BoothVisitorsPage", () => ({ default: () => <div>BoothVisitorsPage</div> }))
vi.mock("../pages/FairBoothsPage", () => ({ default: () => <div>FairBoothsPage</div> }))
vi.mock("../pages/StudentFairBoothsPage", () => ({ default: () => <div>StudentFairBoothsPage</div> }))
vi.mock("../pages/TailorResumeSimplePage", () => ({ default: () => <div>TailorResumeSimplePage</div> }))
vi.mock("../pages/TailoredResumeViewPage", () => ({ default: () => <div>TailoredResumeViewPage</div> }))
vi.mock("../pages/TailoredResumesPage", () => ({ default: () => <div>TailoredResumesPage</div> }))
vi.mock("../pages/SubmissionsPage", () => ({ default: () => <div>SubmissionsPage</div> }))
vi.mock("../pages/NetworkingLounge", () => ({ default: () => <div>NetworkingLounge</div> }))
vi.mock("../pages/ProfilePage", () => ({ default: () => <div>ProfilePage</div> }))
vi.mock("../pages/JobSearchPage", () => ({ default: () => <div>JobSearchPage</div> }))
vi.mock("../pages/CallInvitationsPage", () => ({ default: () => <div>CallInvitationsPage</div> }))
vi.mock("../pages/StudentCallInvitations", () => ({
  StudentCallInvitations: () => <div>StudentCallInvitations</div>,
}))
vi.mock("../pages/EmployerMyCalls", () => ({
  EmployerMyCalls: () => <div>EmployerMyCalls</div>,
}))
vi.mock("../pages/ShortlistPage", () => ({ default: () => <div>ShortlistPage</div> }))
vi.mock("../pages/QASessionsPage", () => ({ default: () => <div>QASessionsPage</div> }))
vi.mock("../pages/QASessionPage", () => ({ default: () => <div>QASessionPage</div> }))
vi.mock("../components/videoChat/Call1x1Room", () => ({
  Call1x1Room: () => <div>Call1x1Room</div>,
}))
vi.mock("../contexts/FairContext", () => ({
  FairProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useFair: vi.fn(),
}))

describe("App", () => {
  afterEach(() => {
    globalThis.history.pushState({}, "", "/")
  })

  it("renders RoleSelection at /", () => {
    render(<App />)
    expect(screen.getByText("RoleSelection")).toBeInTheDocument()
  })

  it("renders FairLandingWrapper at /fair/:fairId", () => {
    globalThis.history.pushState({}, "", "/fair/test-fair-id")
    render(<App />)
    expect(screen.getByText("FairLanding")).toBeInTheDocument()
  })

  it("renders FairBoothsWrapper at /fair/:fairId/booths", () => {
    globalThis.history.pushState({}, "", "/fair/test-fair-id/booths")
    render(<App />)
    expect(screen.getByText("FairBooths")).toBeInTheDocument()
  })

  it("renders FairBoothViewWrapper at /fair/:fairId/booth/:boothId", () => {
    globalThis.history.pushState({}, "", "/fair/test-fair-id/booth/test-booth-id")
    render(<App />)
    expect(screen.getByText("FairBoothView")).toBeInTheDocument()
  })

  it("renders FairAdminWrapper at /fair/:fairId/admin", () => {
    globalThis.history.pushState({}, "", "/fair/test-fair-id/admin")
    render(<App />)
    expect(screen.getByText("FairAdminDashboard")).toBeInTheDocument()
  })

  it("renders FairBoothEditorWrapper at /fair/:fairId/company/:companyId/booth", () => {
    globalThis.history.pushState({}, "", "/fair/test-fair-id/company/test-company-id/booth")
    render(<App />)
    expect(screen.getByText("BoothEditor")).toBeInTheDocument()
  })

  it("renders BoothVisitorsPage at /booth/:boothId/visitors", () => {
    globalThis.history.pushState({}, "", "/booth/booth-123/visitors")
    render(<App />)
    expect(screen.getByText("BoothVisitorsPage")).toBeInTheDocument()
  })

  it("renders FairList at /fairs", () => {
    globalThis.history.pushState({}, "", "/fairs")
    render(<App />)
    expect(screen.getByText("FairList")).toBeInTheDocument()
  })

  it("renders FairBoothsPage at /admin/fairs/:fairId", () => {
    globalThis.history.pushState({}, "", "/admin/fairs/fair-456")
    render(<App />)
    expect(screen.getByText("FairBoothsPage")).toBeInTheDocument()
  })

  it("renders StudentFairBoothsPage at /fairs/:fairId/booths", () => {
    globalThis.history.pushState({}, "", "/fairs/fair-789/booths")
    render(<App />)
    expect(screen.getByText("StudentFairBoothsPage")).toBeInTheDocument()
  })

  it("renders TailoredResumesPage at /dashboard/tailored-resumes", () => {
    globalThis.history.pushState({}, "", "/dashboard/tailored-resumes")
    render(<App />)
    expect(screen.getByText("TailoredResumesPage")).toBeInTheDocument()
  })

  it("renders TailorResumeSimplePage at /invitations/:id/tailor-simple", () => {
    globalThis.history.pushState({}, "", "/invitations/inv-abc/tailor-simple")
    render(<App />)
    expect(screen.getByText("TailorResumeSimplePage")).toBeInTheDocument()
  })

  it("renders SubmissionsPage at /company/:companyId/submissions", () => {
    globalThis.history.pushState({}, "", "/company/company-1/submissions")
    render(<App />)
    expect(screen.getByText("SubmissionsPage")).toBeInTheDocument()
  })

  it("renders TailoredResumeViewPage at /dashboard/tailored-resume/:tailoredResumeId", () => {
    globalThis.history.pushState({}, "", "/dashboard/tailored-resume/res-123")
    render(<App />)
    expect(screen.getByText("TailoredResumeViewPage")).toBeInTheDocument()
  })

  it("renders NetworkingLoungeWrapper at /fair/:fairId/lounge", () => {
    globalThis.history.pushState({}, "", "/fair/test-fair-id/lounge")
    render(<App />)
    expect(screen.getByText("NetworkingLounge")).toBeInTheDocument()
  })

  it("renders ProfilePage at /profile", () => {
    globalThis.history.pushState({}, "", "/profile")
    render(<App />)
    expect(screen.getByText("ProfilePage")).toBeInTheDocument()
  })

  it("renders JobSearchPage at /dashboard/job-search", () => {
    globalThis.history.pushState({}, "", "/dashboard/job-search")
    render(<App />)
    expect(screen.getByText("JobSearchPage")).toBeInTheDocument()
  })

  it("renders Register at /register", () => {
    globalThis.history.pushState({}, "", "/register")
    render(<App />)
    expect(screen.getByText("Register")).toBeInTheDocument()
  })

  it("renders Login at /login", () => {
    globalThis.history.pushState({}, "", "/login")
    render(<App />)
    expect(screen.getByText("Login")).toBeInTheDocument()
  })

  it("renders Dashboard at /dashboard", () => {
    globalThis.history.pushState({}, "", "/dashboard")
    render(<App />)
    expect(screen.getByText("Dashboard")).toBeInTheDocument()
  })

  it("renders FairyJobmotherPage at /dashboard/fairy-jobmother", () => {
    globalThis.history.pushState({}, "", "/dashboard/fairy-jobmother")
    render(<App />)
    expect(screen.getByText("FairyJobmotherPage")).toBeInTheDocument()
  })

  it("renders FairAnnouncementsPage at /dashboard/fair-announcements", () => {
    globalThis.history.pushState({}, "", "/dashboard/fair-announcements")
    render(<App />)
    expect(screen.getByText("FairAnnouncementsPage")).toBeInTheDocument()
  })

  it("renders AdminDashboard at /admin", () => {
    globalThis.history.pushState({}, "", "/admin")
    render(<App />)
    expect(screen.getByText("AdminDashboard")).toBeInTheDocument()
  })

  it("renders ChatPage at /dashboard/chat", () => {
    globalThis.history.pushState({}, "", "/dashboard/chat")
    render(<App />)
    expect(screen.getByText("ChatPage")).toBeInTheDocument()
  })

  it("renders CallInvitationsPage at /dashboard/call-invitations", () => {
    globalThis.history.pushState({}, "", "/dashboard/call-invitations")
    render(<App />)
    expect(screen.getByText("CallInvitationsPage")).toBeInTheDocument()
  })

  it("renders StudentCallInvitations at /dashboard/1x1-calls", () => {
    globalThis.history.pushState({}, "", "/dashboard/1x1-calls")
    render(<App />)
    expect(screen.getByText("StudentCallInvitations")).toBeInTheDocument()
  })

  it("renders EmployerMyCalls at /dashboard/my-calls", () => {
    globalThis.history.pushState({}, "", "/dashboard/my-calls")
    render(<App />)
    expect(screen.getByText("EmployerMyCalls")).toBeInTheDocument()
  })

  it("renders Call1x1Room wrapper at /dashboard/1x1-call/:invitationId", () => {
    globalThis.history.pushState({}, "", "/dashboard/1x1-call/inv-99")
    render(<App />)
    expect(screen.getByText("Call1x1Room")).toBeInTheDocument()
  })

  it("renders ShortlistPage at /dashboard/shortlist", () => {
    globalThis.history.pushState({}, "", "/dashboard/shortlist")
    render(<App />)
    expect(screen.getByText("ShortlistPage")).toBeInTheDocument()
  })

  it("renders QASessionsPage at /dashboard/qa-sessions", () => {
    globalThis.history.pushState({}, "", "/dashboard/qa-sessions")
    render(<App />)
    expect(screen.getByText("QASessionsPage")).toBeInTheDocument()
  })

  it("renders QASessionPage at /qa-session/:boothId", () => {
    globalThis.history.pushState({}, "", "/qa-session/booth-xyz")
    render(<App />)
    expect(screen.getByText("QASessionPage")).toBeInTheDocument()
  })
})
