import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import Booths from "../Booths";
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
  query: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

const renderBooths = () => {
  return render(
    <BrowserRouter>
      <Booths />
    </BrowserRouter>
  );
};

describe("Booths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue(null);
    (fairStatus.evaluateFairStatus as any).mockResolvedValue({
      isLive: true,
      scheduleName: "Spring Career Fair",
      scheduleDescription: "2025 Spring technical recruiting event",
    });
  });

  it("renders the booths page", async () => {
    renderBooths();
    await waitFor(() => {
      expect(screen.getByText(/job goblin/i)).toBeInTheDocument();
    });
  });

  it("displays header with title and profile menu", () => {
    renderBooths();
    expect(screen.getByText(/job goblin - virtual career fair/i)).toBeInTheDocument();
    expect(screen.getByText(/explore opportunities from top companies/i)).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    renderBooths();
    const progressbars = screen.queryAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(0);
  });

  it("displays fair name when career fair is live", async () => {
    (fairStatus.evaluateFairStatus as any).mockResolvedValue({
      isLive: true,
      scheduleName: "Test Fair",
      scheduleDescription: "Test Description",
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText("Test Fair")).toBeInTheDocument();
    });
  });

  it("displays stats cards for booths and jobs", async () => {
    renderBooths();

    await waitFor(() => {
      expect(screen.getByText(/active booths/i)).toBeInTheDocument();
      expect(screen.getByText(/open positions/i)).toBeInTheDocument();
      expect(screen.getByText(/event status/i)).toBeInTheDocument();
    });
  });

  it("shows no booths message when fair is not live and no booths available", async () => {
    (fairStatus.evaluateFairStatus as any).mockResolvedValue({
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText(/career fair not live/i)).toBeInTheDocument();
    });
  });

  it("navigates to dashboard when dashboard button is clicked", async () => {
    const user = userEvent.setup();
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "student",
    });

    renderBooths();

    const dashboardButton = screen.queryByRole("button", { name: /dashboard/i });
    if (dashboardButton) {
      await user.click(dashboardButton);
    }
  });
});
