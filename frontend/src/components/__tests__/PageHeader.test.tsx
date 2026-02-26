import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import PageHeader from "../PageHeader"

vi.mock("../NotificationBell", () => ({
  default: () => <div data-testid="notification-bell">Bell</div>,
}))

vi.mock("../../pages/ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}))

const renderPageHeader = () =>
  render(
    <BrowserRouter>
      <PageHeader />
    </BrowserRouter>
  )

describe("PageHeader", () => {
  it("renders Virtual Career Fair text", () => {
    renderPageHeader()
    expect(screen.getByText("Virtual Career Fair")).toBeInTheDocument()
  })

  it("renders notification bell", () => {
    renderPageHeader()
    expect(screen.getByTestId("notification-bell")).toBeInTheDocument()
  })

  it("renders profile menu", () => {
    renderPageHeader()
    expect(screen.getByTestId("profile-menu")).toBeInTheDocument()
  })
})
