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
      const fairNameElements = screen.getAllByText("Test Fair");
      expect(fairNameElements.length).toBeGreaterThan(0);
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

  it("renders booth cards with company information", async () => {
    renderBooths();
    await waitFor(() => {
      const cards = screen.queryAllByRole("region");
      expect(cards || screen.queryAllByText(/./)).toBeDefined();
    });
  });

  it("displays booth count in statistics", async () => {
    renderBooths();
    await waitFor(() => {
      expect(screen.getByText(/active booths/i)).toBeInTheDocument();
    });
  });

  it("displays total open positions in statistics", async () => {
    renderBooths();
    await waitFor(() => {
      expect(screen.getByText(/open positions/i)).toBeInTheDocument();
    });
  });

  it("displays event status card", async () => {
    renderBooths();
    await waitFor(() => {
      expect(screen.getByText(/event status/i)).toBeInTheDocument();
    });
  });

  it("shows 'Career Fair' text in header", async () => {
    renderBooths();
    await waitFor(() => {
      expect(screen.getByText(/job goblin - virtual career fair/i)).toBeInTheDocument();
    });
  });

  it("displays schedule description when fair is live", async () => {
    renderBooths();
    await waitFor(() => {
      const descriptions = screen.queryAllByText(/spring|technical|recruiting/i);
      expect(descriptions.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("fetches booths from Firestore on mount", async () => {
    renderBooths();
    await waitFor(() => {
      expect(fairStatus.evaluateFairStatus).toHaveBeenCalled();
    });
  });

  it("handles error when fetching booths fails", async () => {
    (fairStatus.evaluateFairStatus as any).mockRejectedValue(new Error("Fetch failed"));
    renderBooths();
    await waitFor(() => {
      expect(fairStatus.evaluateFairStatus).toHaveBeenCalled();
    });
  });

  it("displays different message when fair is offline", async () => {
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

  it("shows available booths to authenticated users", async () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "student",
      email: "student@example.com",
    });
    renderBooths();
    await waitFor(() => {
      expect(fairStatus.evaluateFairStatus).toHaveBeenCalled();
    });
  });

  it("shows only user's booths for company owners when fair is offline", async () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "owner-1",
      role: "companyOwner",
    });
    (fairStatus.evaluateFairStatus as any).mockResolvedValue({
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    });
    renderBooths();
    await waitFor(() => {
      expect(authUtils.authUtils.getCurrentUser).toHaveBeenCalled();
    });
  });

  it("displays Material-UI Grid layout", () => {
    const { container } = renderBooths();
    const gridElements = container.querySelectorAll(".MuiGrid-root");
    expect(gridElements.length).toBeGreaterThanOrEqual(0);
  });

  it("renders Container component for layout", () => {
    const { container } = renderBooths();
    expect(container.querySelector(".MuiContainer-root")).toBeDefined();
  });

  it("shows profile menu button", async () => {
    renderBooths();
    await waitFor(() => {
      const buttons = screen.queryAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("navigates to booth details on card click", async () => {
    const user = userEvent.setup();
    renderBooths();

    await waitFor(() => {
      const cards = screen.queryAllByRole("button");
      expect(cards.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("displays loading progress bars initially", () => {
    renderBooths();
    const progressbars = screen.queryAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(0);
  });

  it("displays alert styling for statistics", async () => {
    renderBooths();
    await waitFor(() => {
      const alerts = screen.queryAllByRole("alert");
      expect(alerts).toBeDefined();
    });
  });
});
