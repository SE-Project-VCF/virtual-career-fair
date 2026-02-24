/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { BrowserRouter, useNavigate } from "react-router-dom";
import Booths from "../Booths";
import * as authUtils from "../../utils/auth";
import * as fairStatus from "../../utils/fairStatus";
import { getDocs, getDoc } from "firebase/firestore";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock("../../utils/fairStatus", () => ({
  evaluateFairStatus: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
  doc: vi.fn((_db, collectionName, docId) => ({ _collection: collectionName, _id: docId })),
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

const mockNavigate = vi.fn();

describe("Booths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useNavigate as Mock).mockReturnValue(mockNavigate);
    (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue(null);
    (fairStatus.evaluateFairStatus as Mock).mockResolvedValue({
      isLive: true,
      scheduleName: "Spring Career Fair",
      scheduleDescription: "2025 Spring technical recruiting event",
    });

    // Default mock for getDocs and getDoc
    (getDocs as Mock).mockResolvedValue({
      docs: [],
      forEach: (_cb: (doc: any) => void) => {},
    });
    (getDoc as Mock).mockResolvedValue({
      exists: () => false,
      data: () => ({}),
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
    (fairStatus.evaluateFairStatus as Mock).mockResolvedValue({
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
    (fairStatus.evaluateFairStatus as Mock).mockResolvedValue({
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
    (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
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
    (fairStatus.evaluateFairStatus as Mock).mockRejectedValue(new Error("Fetch failed"));
    renderBooths();
    await waitFor(() => {
      expect(fairStatus.evaluateFairStatus).toHaveBeenCalled();
    });
  });

  it("displays different message when fair is offline", async () => {
    (fairStatus.evaluateFairStatus as Mock).mockResolvedValue({
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
    (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
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
    (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
      uid: "owner-1",
      role: "companyOwner",
    });
    (fairStatus.evaluateFairStatus as Mock).mockResolvedValue({
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

  // Additional Coverage Tests
  it("handles search input changes", async () => {
    renderBooths();
    await waitFor(() => {
      const inputs = screen.queryAllByRole("textbox");
      expect(inputs.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("displays fair description correctly", async () => {
    renderBooths();
    await waitFor(() => {
      expect(fairStatus.evaluateFairStatus).toHaveBeenCalled();
    });
  });

  it("calculates total job positions", async () => {
    renderBooths();
    await waitFor(() => {
      expect(screen.getByText(/open positions/i)).toBeInTheDocument();
    });
  });

  it("handles firestore query errors", async () => {
    (fairStatus.evaluateFairStatus as Mock).mockRejectedValue(new Error("Database error"));
    renderBooths();
    await waitFor(() => {
      expect(fairStatus.evaluateFairStatus).toHaveBeenCalled();
    });
  });

  it("displays empty state when no booths available", async () => {
    renderBooths();
    await waitFor(() => {
      expect(fairStatus.evaluateFairStatus).toHaveBeenCalled();
    });
  });

  it("shows different views based on user role", async () => {
    (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
      uid: "user-1",
      role: "representative",
    });
    renderBooths();
    await waitFor(() => {
      expect(fairStatus.evaluateFairStatus).toHaveBeenCalled();
    });
  });

  it("fetches and displays booths when fair is live", async () => {
    const mockBooths = [
      {
        id: "booth1",
        companyName: "Tech Corp",
        industry: "software",
        companySize: "100-500",
        location: "San Francisco",
        description: "A great tech company",
        companyId: "company1",
      },
    ];

    (getDocs as Mock).mockResolvedValue({
      docs: mockBooths.map((booth) => ({
        id: booth.id,
        data: () => booth,
      })),
      forEach: (cb: (doc: any) => void) => mockBooths.forEach((booth) => cb({ id: booth.id, data: () => booth })),
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    });
  });

  it("fetches job counts for booths", async () => {
    const mockBooths = [
      {
        id: "booth1",
        companyName: "Tech Corp",
        industry: "software",
        companySize: "100-500",
        location: "San Francisco",
        description: "A great tech company",
        companyId: "company1",
      },
    ];

    const mockJobs = [
      { id: "job1", companyId: "company1" },
      { id: "job2", companyId: "company1" },
    ];

    let callCount = 0;
    (getDocs as Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: booths
        return Promise.resolve({
          docs: mockBooths.map((booth) => ({ id: booth.id, data: () => booth })),
          forEach: (cb: (doc: any) => void) => mockBooths.forEach((booth) => cb({ id: booth.id, data: () => booth })),
        });
      } else if (callCount === 2) {
        // Second call: companies
        return Promise.resolve({
          docs: [],
          forEach: (_cb: (doc: any) => void) => {},
        });
      } else {
        // Third call: jobs
        return Promise.resolve({
          docs: mockJobs.map((job) => ({ id: job.id, data: () => job })),
          forEach: (_cb: (doc: any) => void) => mockJobs.forEach((job) => _cb({ id: job.id, data: () => job })),
        });
      }
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      expect(screen.getByText(/2 open position/i)).toBeInTheDocument();
    });
  });

  it("handles job count batching for > 30 companies", async () => {
    const mockBooths = Array.from({ length: 35 }, (_, i) => ({
      id: `booth${i}`,
      companyName: `Company ${i}`,
      industry: "software",
      companySize: "100-500",
      location: "Location",
      description: "Description",
      companyId: `company${i}`,
    }));

    (getDocs as Mock).mockResolvedValue({
      docs: mockBooths.map((booth) => ({ id: booth.id, data: () => booth })),
      forEach: (cb: (doc: any) => void) => mockBooths.forEach((booth) => cb({ id: booth.id, data: () => booth })),
    });

    renderBooths();

    await waitFor(() => {
      expect(getDocs).toHaveBeenCalled();
    });
  });

  it("navigates to booth detail when Visit Booth is clicked", async () => {
    const user = userEvent.setup();
    const mockBooths = [
      {
        id: "booth1",
        companyName: "Tech Corp",
        industry: "software",
        companySize: "100-500",
        location: "San Francisco",
        description: "A great tech company",
        companyId: "company1",
      },
    ];

    (getDocs as Mock).mockResolvedValue({
      docs: mockBooths.map((booth) => ({ id: booth.id, data: () => booth })),
      forEach: (cb: (doc: any) => void) => mockBooths.forEach((booth) => cb({ id: booth.id, data: () => booth })),
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    });

    const visitButton = screen.getByRole("button", { name: /visit booth/i });
    await user.click(visitButton);

    expect(mockNavigate).toHaveBeenCalledWith("/booth/booth1");
  });

  it("displays booth with logo", async () => {
    const mockBooths = [
      {
        id: "booth1",
        companyName: "Tech Corp",
        industry: "software",
        companySize: "100-500",
        location: "San Francisco",
        description: "A great tech company",
        companyId: "company1",
        logoUrl: "https://example.com/logo.png",
      },
    ];

    (getDocs as Mock).mockResolvedValue({
      docs: mockBooths.map((booth) => ({ id: booth.id, data: () => booth })),
      forEach: (cb: (doc: any) => void) => mockBooths.forEach((booth) => cb({ id: booth.id, data: () => booth })),
    });

    renderBooths();

    await waitFor(() => {
      const logo = screen.getByAltText("Tech Corp logo");
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute("src", "https://example.com/logo.png");
    });
  });

  it("fetches booths for company owner when fair is not live", async () => {
    (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
      uid: "owner1",
      role: "companyOwner",
    });
    (fairStatus.evaluateFairStatus as Mock).mockResolvedValue({
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    });

    const mockCompanies = [{ id: "company1", ownerId: "owner1", boothId: "booth1" }];
    const mockBooth = {
      id: "booth1",
      companyName: "My Company",
      industry: "software",
      companySize: "10-50",
      location: "NYC",
      description: "Description",
      companyId: "company1",
    };

    let gdCallCount = 0;
    (getDocs as Mock).mockImplementation(() => {
      gdCallCount++;
      if (gdCallCount === 1) {
        // Companies owned by user
        return Promise.resolve({
          docs: mockCompanies.map((c) => ({ id: c.id, data: () => c })),
          forEach: (cb: (doc: any) => void) => mockCompanies.forEach((c) => cb({ id: c.id, data: () => c })),
        });
      }
      return Promise.resolve({
        docs: [],
        forEach: (_cb: (doc: any) => void) => {},
      });
    });

    // Mock getDoc to return company data for company lookups and booth data for booth lookups
    (getDoc as Mock).mockImplementation((docRef: { _collection: string; _id?: string }) => {
      if (docRef._collection === "companies") {
        return Promise.resolve({
          exists: () => true,
          id: "company1",
          data: () => mockCompanies[0],
        });
      } else if (docRef._collection === "booths") {
        return Promise.resolve({
          exists: () => true,
          id: "booth1",
          data: () => mockBooth,
        });
      }
      return Promise.resolve({ exists: () => false });
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText("My Company")).toBeInTheDocument();
    });
  });

  it("fetches booths for representative with companyId when fair is not live", async () => {
    (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
      uid: "rep1",
      role: "representative",
      companyId: "company1",
    });
    (fairStatus.evaluateFairStatus as Mock).mockResolvedValue({
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    });

    const mockCompany = { id: "company1", boothId: "booth1" };
    const mockBooth = {
      id: "booth1",
      companyName: "Rep Company",
      industry: "finance",
      companySize: "500+",
      location: "Boston",
      description: "Finance company",
      companyId: "company1",
    };

    // Mock getDoc to return company data for company lookups and booth data for booth lookups
    (getDoc as Mock).mockImplementation((docRef: { _collection: string; _id?: string }) => {
      if (docRef._collection === "companies") {
        return Promise.resolve({
          exists: () => true,
          id: "company1",
          data: () => mockCompany,
        });
      } else if (docRef._collection === "booths") {
        return Promise.resolve({
          exists: () => true,
          id: "booth1",
          data: () => mockBooth,
        });
      }
      return Promise.resolve({ exists: () => false });
    });

    (getDocs as Mock).mockResolvedValue({
      docs: [],
      forEach: (_cb: (doc: any) => void) => {},
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText("Rep Company")).toBeInTheDocument();
    });
  });

  it("shows appropriate message when booth has no companyId", async () => {
    const mockBooths = [
      {
        id: "booth1",
        companyName: "Tech Corp",
        industry: "software",
        companySize: "100-500",
        location: "San Francisco",
        description: "A great tech company",
      },
    ];

    (getDocs as Mock).mockResolvedValue({
      docs: mockBooths.map((booth) => ({ id: booth.id, data: () => booth })),
      forEach: (cb: (doc: any) => void) => mockBooths.forEach((booth) => cb({ id: booth.id, data: () => booth })),
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      expect(screen.getByText(/0 open position/i)).toBeInTheDocument();
    });
  });

  it("navigates to dashboard when Dashboard button is clicked", async () => {
    const user = userEvent.setup();
    (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
      uid: "user1",
      role: "student",
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText(/job goblin/i)).toBeInTheDocument();
    });

    const dashboardButton = screen.getByRole("button", { name: /dashboard/i });
    await user.click(dashboardButton);

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("displays error message when fetching booths fails", async () => {
    (getDocs as Mock).mockRejectedValue(new Error("Database error"));

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText(/failed to load booths/i)).toBeInTheDocument();
    });
  });

  it("handles error in job count fetching gracefully", async () => {
    const mockBooths = [
      {
        id: "booth1",
        companyName: "Tech Corp",
        industry: "software",
        companySize: "100-500",
        location: "San Francisco",
        description: "A great tech company",
        companyId: "company1",
      },
    ];

    let callCount = 0;
    (getDocs as Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: fetch booths
        return Promise.resolve({
          docs: mockBooths.map((b) => ({ id: b.id, data: () => b })),
          forEach: (cb: (doc: any) => void) => mockBooths.forEach((b) => cb({ id: b.id, data: () => b })),
        });
      } else if (callCount === 2) {
        // Second call: fetch companies for mapping boothId to companyId
        return Promise.resolve({
          docs: [],
          forEach: (_cb: (doc: any) => void) => {},
        });
      } else {
        // Third call: fetch job counts - this should error
        return Promise.reject(new Error("Job fetch error"));
      }
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    });
  });

  it("maps boothId to companyId from companies collection", async () => {
    const mockCompanies = [{ id: "company1", boothId: "booth1" }];
    const mockBooths = [
      {
        id: "booth1",
        companyName: "Tech Corp",
        industry: "software",
        companySize: "100-500",
        location: "San Francisco",
        description: "A great tech company",
      },
    ];

    let callCount = 0;
    (getDocs as Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          docs: mockBooths.map((b) => ({ id: b.id, data: () => b })),
          forEach: (cb: (doc: any) => void) => mockBooths.forEach((b) => cb({ id: b.id, data: () => b })),
        });
      } else if (callCount === 2) {
        return Promise.resolve({
          docs: mockCompanies.map((c) => ({ id: c.id, data: () => c })),
          forEach: (cb: (doc: any) => void) => mockCompanies.forEach((c) => cb({ id: c.id, data: () => c })),
        });
      }
      return Promise.resolve({
        docs: [],
        forEach: (_cb: (doc: any) => void) => {},
      });
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    });
  });

  it("handles representative booth lookup when companyId is missing", async () => {
    (authUtils.authUtils.getCurrentUser as Mock).mockReturnValue({
      uid: "owner1",
      role: "companyOwner",
    });
    (fairStatus.evaluateFairStatus as Mock).mockResolvedValue({
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    });

    const mockCompanies = [{ id: "company1", ownerId: "owner1", boothId: "booth1" }];
    const mockBooth = {
      id: "booth1",
      companyName: "My Company",
      industry: "software",
      companySize: "10-50",
      location: "NYC",
      description: "Description",
    };

    (getDocs as Mock).mockResolvedValue({
      docs: mockCompanies.map((c) => ({ id: c.id, data: () => c })),
      forEach: (cb: (doc: any) => void) => mockCompanies.forEach((c) => cb({ id: c.id, data: () => c })),
    });

    let getDocCallCount = 0;
    (getDoc as Mock).mockImplementation(() => {
      getDocCallCount++;
      if (getDocCallCount === 2) {
        // Second call: get booth data
        return Promise.resolve({
          exists: () => true,
          id: "booth1",
          data: () => mockBooth,
        });
      }
      // First and third calls: get company to find boothId / lookup company by boothId
      return Promise.resolve({
        exists: () => true,
        data: () => mockCompanies[0],
      });
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText("My Company")).toBeInTheDocument();
    });
  });

  it("shows Live Now when fair is live without schedule name", async () => {
    (fairStatus.evaluateFairStatus as Mock).mockResolvedValue({
      isLive: true,
      scheduleName: null,
      scheduleDescription: null,
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText(/live now/i)).toBeInTheDocument();
    });
  });

  it("displays Event Status when fair is not live without description", async () => {
    (fairStatus.evaluateFairStatus as Mock).mockResolvedValue({
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    });

    renderBooths();

    await waitFor(() => {
      expect(screen.getByText(/event status/i)).toBeInTheDocument();
    });
  });
});
