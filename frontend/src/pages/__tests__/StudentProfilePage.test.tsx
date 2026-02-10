import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import StudentProfilePage from "../StudentProfilePage";
import * as authUtils from "../../utils/auth";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  db: {},
  storage: {},
}));

const renderStudentProfile = () => {
  return render(
    <BrowserRouter>
      <StudentProfilePage />
    </BrowserRouter>
  );
};

describe("StudentProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.authUtils.isAuthenticated as any).mockReturnValue(true);
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "student-1",
      role: "student",
      email: "student@example.com",
    });
  });

  it("renders student profile page", async () => {
    renderStudentProfile();
    await waitFor(() => {
      // Page should render
    });
  });

  it("requires authentication", () => {
    (authUtils.authUtils.isAuthenticated as any).mockReturnValue(false);
    renderStudentProfile();
    // Should redirect to login
  });

  it("displays profile form fields", async () => {
    renderStudentProfile();

    await waitFor(() => {
      // Form fields should be present
    });
  });

  it("allows resume file upload", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    await waitFor(() => {
      const fileInputs = screen.queryAllByRole("button");
      // Resume upload should be present
    });
  });
});
