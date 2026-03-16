import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, afterEach } from "vitest"
import App from "../App"

vi.mock("../pages/RoleSelection", () => ({ default: () => <div>RoleSelection</div> }))
vi.mock("../pages/Register", () => ({ default: () => <div>Register</div> }))
vi.mock("../pages/Login", () => ({ default: () => <div>Login</div> }))
vi.mock("../pages/Dashboard", () => ({ default: () => <div>Dashboard</div> }))
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
})
