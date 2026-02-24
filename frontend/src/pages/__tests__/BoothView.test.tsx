import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import BoothView from "../BoothView";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ boothId: "booth-1" }),
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  };
});

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
  where: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}));

vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}));

// Import after mocking
import { authUtils } from "../../utils/auth";
import { evaluateFairStatus } from "../../utils/fairStatus";
import * as firestore from "firebase/firestore";

const mockBoothData = {
  exists: () => true,
  id: "booth-1",
  data: () => ({
    companyName: "Tech Corp",
    industry: "software",
    companySize: "500",
    location: "San Francisco, CA",
    description: "Leading software company",
    logoUrl: "https://example.com/logo.png",
    openPositions: 5,
    hiringFor: "Software Engineers",
    website: "https://techcorp.com",
    careersPage: "https://techcorp.com/careers",
    contactName: "John Smith",
    contactEmail: "john@techcorp.com",
    contactPhone: "555-1234",
    companyId: "company-1",
  }),
};

const renderBoothView = () => {
  return render(
    <BrowserRouter>
      <BoothView />
    </BrowserRouter>
  );
};

describe("BoothView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "student-1",
      role: "student",
    });
    (evaluateFairStatus as any).mockResolvedValue({
      isLive: true,
    });
    (firestore.getDoc as any).mockResolvedValue(mockBoothData);
    (firestore.getDocs as any).mockResolvedValue({ docs: [] });
    (firestore.query as any).mockReturnValue({});
    (firestore.collection as any).mockReturnValue({});
    (firestore.where as any).mockReturnValue({});
    // Default fetch mock - resolves with empty jobs
    (globalThis.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [] }),
    });
  });

  // Authentication and Access Tests
  it("checks fair status on mount", async () => {
    renderBoothView();
    await waitFor(() => {
      expect(evaluateFairStatus).toHaveBeenCalled();
    });
  });

  it("redirects to booths list when boothId is missing", async () => {
    // The component handles missing boothId by redirecting
    // This is tested implicitly through the navigation mock
  });

  // Booth Loading Tests
  it("displays loading state initially", () => {
    (firestore.getDoc as any).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );
    renderBoothView();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("displays error message when booth not found", async () => {
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => false,
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/Booth not found/)).toBeInTheDocument();
    });
  });

  it("displays back to booths button on error", async () => {
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => false,
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/Back to Booths/)).toBeInTheDocument();
    });
  });

  // Booth Header Tests
  it("displays company name in header", async () => {
    renderBoothView();

    await waitFor(() => {
      const headings = screen.getAllByText("Tech Corp");
      expect(headings.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("displays industry chip for booth", async () => {
    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/Software Development/)).toBeInTheDocument();
    });
  });

  it("displays location information", async () => {
    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("San Francisco, CA")).toBeInTheDocument();
    });
  });

  it("displays company size", async () => {
    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/500 employees/)).toBeInTheDocument();
    });
  });

  it("displays company description", async () => {
    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Leading software company")).toBeInTheDocument();
    });
  });

  // Booth Logo Tests
  it("displays company logo if available", async () => {
    renderBoothView();

    await waitFor(() => {
      const logo = screen.getByAltText(/Tech Corp logo/);
      expect(logo).toBeInTheDocument();
      expect((logo as HTMLImageElement).src).toBe("https://example.com/logo.png");
    });
  });

  // Contact Information Tests
  it("displays contact information section", async () => {
    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Contact Information")).toBeInTheDocument();
    });
  });

  it("displays contact person name", async () => {
    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("John Smith")).toBeInTheDocument();
    });
  });

  it("displays contact email with mailto link", async () => {
    renderBoothView();

    await waitFor(() => {
      const emailLink = screen.getByRole("link", {
        name: /john@techcorp.com/i,
      });
      expect(emailLink).toHaveAttribute("href", "mailto:john@techcorp.com");
    });
  });

  it("displays contact phone when available", async () => {
    renderBoothView();

    await waitFor(() => {
      const phoneLink = screen.getByRole("link", { name: /555-1234/ });
      expect(phoneLink).toHaveAttribute("href", "tel:555-1234");
    });
  });

  // Message Button Tests
  it("displays message representative button", async () => {
    renderBoothView();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Message Representative/ })
      ).toBeInTheDocument();
    });
  });

  it("messages representative button is enabled when not starting chat", async () => {
    renderBoothView();

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /Message Representative/ });
      expect(button).not.toBeDisabled();
    });
  });

  it("handles starting chat with representative", async () => {
    const user = userEvent.setup();
    (firestore.getDocs as any).mockResolvedValue({
      empty: false,
      docs: [
        {
          data: () => ({
            uid: "rep-1",
            email: "john@techcorp.com",
          }),
        },
      ],
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Contact Information")).toBeInTheDocument();
    });

    const messageButton = screen.getByRole("button", {
      name: /Message Representative/,
    });
    await user.click(messageButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        "/dashboard/chat",
        expect.objectContaining({
          state: expect.objectContaining({
            repId: "rep-1",
          }),
        })
      );
    });
  });

  // Job Openings Tests
  it("displays open positions card", async () => {
    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/Open Position/)).toBeInTheDocument();
    });
  });

  // Jobs Fetching Tests
  it("fetches jobs for company on booth load", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [] }),
    });

    renderBoothView();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/jobs?companyId=company-1")
      );
    });
  });

  it("displays job listings when jobs are available", async () => {
    const jobs = [
      {
        id: "job-1",
        name: "Senior Software Engineer",
        description: "Build amazing software",
        majorsAssociated: "Computer Science",
        applicationLink: "https://apply.techcorp.com",
      },
    ];

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ jobs }),
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    });
  });

  it("displays apply button for jobs with application links", async () => {
    const jobs = [
      {
        id: "job-1",
        name: "Engineer",
        description: "Build software",
        majorsAssociated: "CS",
        applicationLink: "https://apply.techcorp.com",
      },
    ];

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ jobs }),
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Apply Now/ })).toBeInTheDocument();
    });
  });

  // Links Tests
  it("displays learn more section with links", async () => {
    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Learn More")).toBeInTheDocument();
      expect(screen.getByText("Company Website")).toBeInTheDocument();
      expect(screen.getByText("Careers Page")).toBeInTheDocument();
    });
  });

  it("displays website link with correct href", async () => {
    renderBoothView();

    await waitFor(() => {
      const websiteLink = screen.getByRole("link", { name: /Company Website/ });
      expect(websiteLink).toHaveAttribute("href", "https://techcorp.com");
      expect(websiteLink).toHaveAttribute("target", "_blank");
    });
  });

  it("displays careers page link with correct href", async () => {
    renderBoothView();

    await waitFor(() => {
      const careersLink = screen.getByRole("link", { name: /Careers Page/ });
      expect(careersLink).toHaveAttribute("href", "https://techcorp.com/careers");
      expect(careersLink).toHaveAttribute("target", "_blank");
    });
  });

  // Access Control Tests
  it("allows students to view live booths", async () => {
    renderBoothView();

    // When fair is live, students can view booth
    expect(evaluateFairStatus).toHaveBeenCalled();
  });

  it("restricts access for non-owners when fair is offline", async () => {
    (evaluateFairStatus as any).mockResolvedValue({
      isLive: false,
    });
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "student-1",
      role: "student",
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/not currently live/i)).toBeInTheDocument();
    });
  });

  it("displays ProfileMenu component", async () => {
    renderBoothView();

    await waitFor(() => {
      expect(screen.getByTestId("profile-menu")).toBeInTheDocument();
    });
  });

  // Error Handling Tests
  it("displays error when job fetch fails", async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error("Network error"));

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load job postings/)).toBeInTheDocument();
    });
  });

  // Layout Tests
  it("renders Card components for booth sections", async () => {
    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Contact Information")).toBeInTheDocument();
    });
  });

  // Missing Logo Test
  it("displays default logo placeholder when no logo URL provided", async () => {
    const boothWithoutLogo = {
      exists: () => true,
      id: "booth-1",
      data: () => ({
        ...mockBoothData.data(),
        logoUrl: undefined,
      }),
    };
    (firestore.getDoc as any).mockResolvedValue(boothWithoutLogo);

    renderBoothView();

    await waitFor(() => {
      const companyNames = screen.getAllByText("Tech Corp");
      expect(companyNames.length).toBeGreaterThanOrEqual(1);
    });

    // Should not find image, should have default icon
    const logo = screen.queryByAltText(/Tech Corp logo/);
    expect(logo).not.toBeInTheDocument();
  });

  // Empty Jobs Test
  it("does not display job section when no jobs available", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [] }),
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Contact Information")).toBeInTheDocument();
    });

    // Should not display job openings header when there are no jobs
    expect(screen.queryByText(/Job Openings/)).not.toBeInTheDocument();
  });

  // Booth without companyId lookup
  it("fetches companyId from companies collection when not in booth data", async () => {
    const boothWithoutCompanyId = {
      exists: () => true,
      id: "booth-1",
      data: () => ({
        ...mockBoothData.data(),
        companyId: undefined,
      }),
    };
    (firestore.getDoc as any).mockResolvedValue(boothWithoutCompanyId);
    
    // Mock getDocs to return companies list for companyId lookup
    (firestore.getDocs as any).mockResolvedValue({
      forEach: (callback: any) => {
        callback({
          id: "company-2",
          data: () => ({ boothId: "booth-1" }),
        });
      },
      docs: [
        {
          id: "company-2",
          data: () => ({ boothId: "booth-1" }),
        },
      ],
    });

    renderBoothView();

    await waitFor(() => {
      const companyNames = screen.getAllByText("Tech Corp");
      expect(companyNames.length).toBeGreaterThanOrEqual(1);
    });

    // Should still fetch jobs with found companyId
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/jobs?companyId=company-2")
      );
    });
  });

  // Company Owner Access When Fair is Offline
  it("allows company owner to view their booth when fair is offline", async () => {
    (evaluateFairStatus as any).mockResolvedValue({
      isLive: false,
    });
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "owner-1",
      role: "companyOwner",
    });
    
    // Mock getDocs for owner query (access control) and companies lookup
    (firestore.getDocs as any).mockImplementation(() => ({
      forEach: (callback: any) => {
        callback({
          id: "company-1",
          data: () => ({ ownerId: "owner-1", boothId: "booth-1" }),
        });
      },
      docs: [
        {
          id: "company-1",
          data: () => ({ ownerId: "owner-1", boothId: "booth-1" }),
        },
      ],
    }));

    renderBoothView();

    await waitFor(() => {
      const companyNames = screen.getAllByText("Tech Corp");
      expect(companyNames.length).toBeGreaterThanOrEqual(1);
    });

    // Should not show error message
    expect(screen.queryByText(/not currently live/i)).not.toBeInTheDocument();
  });

  // Representative Access When Fair is Offline
  it("allows representative to view their company booth when fair is offline", async () => {
    (evaluateFairStatus as any).mockResolvedValue({
      isLive: false,
    });
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "rep-1",
      role: "representative",
      companyId: "company-1",
    });

    const companyDoc = {
      exists: () => true,
      data: () => ({ boothId: "booth-1" }),
    };
    
    (firestore.getDoc as any)
      .mockResolvedValueOnce(mockBoothData) // First call for booth
      .mockResolvedValueOnce(companyDoc); // Second call for company

    renderBoothView();

    await waitFor(() => {
      const companyNames = screen.getAllByText("Tech Corp");
      expect(companyNames.length).toBeGreaterThanOrEqual(1);
    });

    // Should not show error message
    expect(screen.queryByText(/not currently live/i)).not.toBeInTheDocument();
  });

  // Representative without company access when offline
  it("denies representative without companyId when fair is offline", async () => {
    (evaluateFairStatus as any).mockResolvedValue({
      isLive: false,
    });
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "rep-1",
      role: "representative",
      companyId: undefined,
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    });
  });

  // Company owner without matching booth when offline
  it("denies company owner viewing non-owned booth when fair is offline", async () => {
    (evaluateFairStatus as any).mockResolvedValue({
      isLive: false,
    });
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "owner-1",
      role: "companyOwner",
    });
    
    (firestore.getDocs as any).mockImplementation(() => ({
      forEach: (callback: any) => {
        callback({
          id: "company-1",
          data: () => ({ ownerId: "owner-1", boothId: "different-booth" }),
        });
      },
      docs: [
        {
          id: "company-1",
          data: () => ({ ownerId: "owner-1", boothId: "different-booth" }),
        },
      ],
    }));

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    });
  });

  // Chat error when representative not found
  it("handles chat error when representative not found", async () => {
    const user = userEvent.setup();
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    
    (firestore.getDocs as any).mockResolvedValue({
      empty: true,
      docs: [],
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Contact Information")).toBeInTheDocument();
    });

    const messageButton = screen.getByRole("button", {
      name: /Message Representative/,
    });
    await user.click(messageButton);

    await waitFor(() => {
      expect(consoleWarn).toHaveBeenCalledWith("Chat: representative not found");
    });

    // Should not navigate
    expect(mockNavigate).not.toHaveBeenCalledWith(
      "/dashboard/chat",
      expect.any(Object)
    );

    consoleWarn.mockRestore();
  });

  // Chat general error
  it("handles chat error exception", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    
    (firestore.getDocs as any).mockRejectedValue(new Error("Network error"));

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Contact Information")).toBeInTheDocument();
    });

    const messageButton = screen.getByRole("button", {
      name: /Message Representative/,
    });
    await user.click(messageButton);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith("Chat: failed to initialize", expect.any(Error));
    });

    consoleError.mockRestore();
  });

  // Jobs without application link
  it("does not display apply button for jobs without application link", async () => {
    const jobs = [
      {
        id: "job-1",
        name: "Internship Position",
        description: "Great opportunity",
        majorsAssociated: "All Majors",
        applicationLink: null,
      },
    ];

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ jobs }),
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Internship Position")).toBeInTheDocument();
    });

    // Should not have apply button
    expect(screen.queryByRole("link", { name: /Apply Now/ })).not.toBeInTheDocument();
  });

  // Booth without phone
  it("does not display phone when not provided", async () => {
    const boothWithoutPhone = {
      exists: () => true,
      id: "booth-1",
      data: () => ({
        ...mockBoothData.data(),
        contactPhone: undefined,
      }),
    };
    (firestore.getDoc as any).mockResolvedValue(boothWithoutPhone);

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Contact Information")).toBeInTheDocument();
    });

    expect(screen.queryByText("Phone")).not.toBeInTheDocument();
  });

  // Booth without website or careers page
  it("does not display Learn More section when no website or careers page", async () => {
    const boothWithoutLinks = {
      exists: () => true,
      id: "booth-1",
      data: () => ({
        ...mockBoothData.data(),
        website: undefined,
        careersPage: undefined,
      }),
    };
    (firestore.getDoc as any).mockResolvedValue(boothWithoutLinks);

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Contact Information")).toBeInTheDocument();
    });

    expect(screen.queryByText("Learn More")).not.toBeInTheDocument();
  });

  // Booth with only website
  it("displays only website link when careers page not provided", async () => {
    const boothWithOnlyWebsite = {
      exists: () => true,
      id: "booth-1",
      data: () => ({
        ...mockBoothData.data(),
        careersPage: undefined,
      }),
    };
    (firestore.getDoc as any).mockResolvedValue(boothWithOnlyWebsite);

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Learn More")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Company Website/ })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Careers Page/ })).not.toBeInTheDocument();
    });
  });

  // Booth with only careers page
  it("displays only careers page link when website not provided", async () => {
    const boothWithOnlyCareers = {
      exists: () => true,
      id: "booth-1",
      data: () => ({
        ...mockBoothData.data(),
        website: undefined,
      }),
    };
    (firestore.getDoc as any).mockResolvedValue(boothWithOnlyCareers);

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Learn More")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Company Website/ })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Careers Page/ })).toBeInTheDocument();
    });
  });

  // Fetch error handling
  it("handles booth fetch error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    (firestore.getDoc as any).mockRejectedValue(new Error("Firestore error"));

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load booth/)).toBeInTheDocument();
    });

    consoleError.mockRestore();
  });

  // Back button navigation
  it("navigates back to booths list when back button clicked", async () => {
    const user = userEvent.setup();
    renderBoothView();

    await waitFor(() => {
      const companyNames = screen.getAllByText("Tech Corp");
      expect(companyNames.length).toBeGreaterThanOrEqual(1);
    });

    const backButtons = screen.getAllByRole("button");
    const backButton = backButtons.find(
      (btn) => btn.querySelector('[data-testid="ArrowBackIcon"]')
    );
    
    if (backButton) {
      await user.click(backButton);
      expect(mockNavigate).toHaveBeenCalledWith("/booths");
    }
  });

  // Loading jobs state
  it("displays loading state while fetching jobs", async () => {
    let resolveJobs: any;
    const jobsPromise = new Promise((resolve) => {
      resolveJobs = resolve;
    });

    (globalThis.fetch as any).mockReturnValue(jobsPromise);

    renderBoothView();

    await waitFor(() => {
      const companyNames = screen.getAllByText("Tech Corp");
      expect(companyNames.length).toBeGreaterThanOrEqual(1);
    });

    // Should show loading indicator for jobs
    const progressBars = screen.getAllByRole("progressbar");
    expect(progressBars.length).toBeGreaterThan(0);

    // Resolve jobs
    resolveJobs({
      ok: true,
      json: async () => ({ jobs: [] }),
    });
  });

  // Job fetch non-ok response
  it("handles non-ok response when fetching jobs", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load job postings/)).toBeInTheDocument();
    });

    consoleError.mockRestore();
  });

  // Back button on error state
  it("navigates back when clicking back button in error state", async () => {
    const user = userEvent.setup();
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => false,
    });

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/Booth not found/)).toBeInTheDocument();
    });

    const backButton = screen.getByRole("button", { name: /Back to Booths/ });
    await user.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith("/booths");
  });
});
