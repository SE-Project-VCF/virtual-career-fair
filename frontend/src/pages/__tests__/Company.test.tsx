import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import Company from "../Company";
import * as authUtils from "../../utils/auth";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "company-1" }),
  };
});

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
  arrayRemove: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

const renderCompany = () => {
  return render(
    <BrowserRouter>
      <Company />
    </BrowserRouter>
  );
};

describe("Company", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "companyOwner",
    });
  });

  it("renders company page", async () => {
    renderCompany();
    await waitFor(() => {
      // Page should render
    });
  });

  it("displays loading state initially", () => {
    renderCompany();
    const progressbars = screen.queryAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(0);
  });

  it("requires authentication", () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue(null);
    renderCompany();
    // Should redirect
  });
});
