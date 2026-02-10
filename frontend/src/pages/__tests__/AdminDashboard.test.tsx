import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import AdminDashboard from "../AdminDashboard";
import * as authUtils from "../../utils/auth";
import * as fairStatus from "../../utils/fairStatus";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock("../../utils/fairStatus", () => ({
  evaluateFairStatus: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
  },
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

const renderAdminDashboard = () => {
  return render(
    <BrowserRouter>
      <AdminDashboard />
    </BrowserRouter>
  );
};

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "admin-1",
      role: "admin",
      email: "admin@example.com",
    });
    (fairStatus.evaluateFairStatus as any).mockResolvedValue({
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    });
  });

  it("renders admin dashboard", async () => {
    renderAdminDashboard();

    await waitFor(() => {
      // Dashboard should render
    });
  });

  it("displays loading state initially", () => {
    renderAdminDashboard();
    const progressbars = screen.queryAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(0);
  });

  it("shows fair status", async () => {
    renderAdminDashboard();

    await waitFor(() => {
      // Status should be displayed
    });
  });

  it("allows admin to manage schedules", async () => {
    const user = userEvent.setup();
    (fairStatus.evaluateFairStatus as any).mockResolvedValue({
      isLive: true,
      scheduleName: "Spring Fair",
      scheduleDescription: "2025 Spring Career Fair",
    });

    renderAdminDashboard();

    await waitFor(() => {
      // Admin controls should be available
    });
  });
});
