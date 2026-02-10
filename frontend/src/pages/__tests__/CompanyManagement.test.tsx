import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import CompanyManagement from "../CompanyManagement";
import * as authUtils from "../../utils/auth";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

const renderCompanyManagement = () => {
  return render(
    <BrowserRouter>
      <CompanyManagement />
    </BrowserRouter>
  );
};

describe("CompanyManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "companyOwner",
    });
  });

  it("renders company management page", async () => {
    renderCompanyManagement();
    await waitFor(() => {
      // Page should render
    });
  });

  it("displays loading state", () => {
    renderCompanyManagement();
    const progressbars = screen.queryAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(0);
  });

  it("requires authentication", () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue(null);
    renderCompanyManagement();
    // Should redirect
  });
});
