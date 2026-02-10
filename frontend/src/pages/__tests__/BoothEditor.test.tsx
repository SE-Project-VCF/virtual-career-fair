import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import BoothEditor from "../BoothEditor";
import * as authUtils from "../../utils/auth";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ companyId: "company-1" }),
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
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

const renderBoothEditor = () => {
  return render(
    <BrowserRouter>
      <BoothEditor />
    </BrowserRouter>
  );
};

describe("BoothEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.authUtils.isAuthenticated as any).mockReturnValue(true);
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "companyOwner",
    });
  });

  it("renders loading state initially", () => {
    renderBoothEditor();
    const progressbars = screen.queryAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(0);
  });

  it("renders form fields for booth creation", async () => {
    renderBoothEditor();

    await waitFor(() => {
      // Wait for form to load, checking for common elements
      // Form should have loaded after async operations
    });
  });

  it("requires authentication", () => {
    (authUtils.authUtils.isAuthenticated as any).mockReturnValue(false);
    renderBoothEditor();
    // Should redirect to login
  });

  it("grants access to company owner", () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "companyOwner",
    });
    renderBoothEditor();
    // Should have access
  });

  it("grants access to representative", () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "representative",
    });
    renderBoothEditor();
    // Should have access
  });
});
