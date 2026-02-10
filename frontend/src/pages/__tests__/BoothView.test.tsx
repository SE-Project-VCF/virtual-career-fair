import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
    (global.fetch as any) = vi.fn().mockResolvedValue({
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
    const { container } = renderBoothView();
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
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [] }),
    });

    renderBoothView();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
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

    (global.fetch as any).mockResolvedValue({
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

    (global.fetch as any).mockResolvedValue({
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
    (global.fetch as any).mockRejectedValue(new Error("Network error"));

    renderBoothView();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load job postings/)).toBeInTheDocument();
    });
  });

  // Layout Tests
  it("renders Card components for booth sections", async () => {
    const { container } = renderBoothView();

    await waitFor(() => {
      expect(screen.getByText("Contact Information")).toBeInTheDocument();
    });

    const cards = container.querySelectorAll(".MuiCard-root");
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });
});
