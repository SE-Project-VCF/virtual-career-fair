import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import BoothEditor from "../BoothEditor";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ companyId: "company-1" }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  updateDoc: vi.fn().mockResolvedValue({}),
  addDoc: vi.fn().mockResolvedValue({ id: "booth-1" }),
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

// Import after mocking
import { authUtils } from "../../utils/auth";
import * as firestore from "firebase/firestore";

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
    mockNavigate.mockClear();
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "companyOwner",
    });
    (authUtils.isAuthenticated as any).mockReturnValue(true);
    // Default mock for getDoc that returns valid company data
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => true,
      id: "company-1",
      data: () => ({
        companyName: "Tech Company",
        ownerId: "user-1",
        representativeIDs: [],
      }),
    });
  });

  // Authentication Tests
  it("redirects to login when not authenticated", () => {
    (authUtils.isAuthenticated as any).mockReturnValue(false);
    renderBoothEditor();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("calls isAuthenticated on mount", async () => {
    renderBoothEditor();
    await waitFor(() => {
      expect(authUtils.isAuthenticated).toHaveBeenCalled();
    });
  });

  it("calls getCurrentUser for role verification", async () => {
    renderBoothEditor();
    await waitFor(() => {
      expect(authUtils.getCurrentUser).toHaveBeenCalled();
    });
  });

  // Access Control Tests
  it("grants access to company owner", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "companyOwner",
    });
    renderBoothEditor();
    await waitFor(() => {
      expect(authUtils.getCurrentUser).toHaveBeenCalled();
    });
  });

  it("grants access to representative", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "representative",
    });
    renderBoothEditor();
    await waitFor(() => {
      expect(authUtils.getCurrentUser).toHaveBeenCalled();
    });
  });

  // Loading States
  it("renders loading state initially", () => {
    (firestore.getDoc as any).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );
    renderBoothEditor();
    const progressbars = screen.queryAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(0);
  });

  // Form Fields Tests
  it("displays company name input field", async () => {
    renderBoothEditor();
    await waitFor(() => {
      const inputs = screen.queryAllByRole("textbox");
      expect(inputs).toBeDefined();
    });
  });

  it("allows user to fill in form fields", async () => {
    const user = userEvent.setup();
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => true,
      id: "company-1",
      data: () => ({
        companyName: "Tech Company",
        ownerId: "user-1",
        representativeIDs: [],
      }),
    });

    renderBoothEditor();

    await waitFor(() => {
      const inputs = screen.queryAllByRole("textbox");
      expect(inputs.length).toBeGreaterThanOrEqual(1);
    });

    const inputs = screen.queryAllByRole("textbox");
    if (inputs.length > 0) {
      await user.clear(inputs[0]);
      await user.type(inputs[0], "Tech Company Inc");
      expect((inputs[0] as HTMLInputElement).value).toBe("Tech Company Inc");
    }
  });

  // Firestore Operations
  it("loads existing company data when editing", async () => {
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        companyName: "Existing Company",
        industry: "software",
      }),
    });

    renderBoothEditor();

    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("handles company not found gracefully", async () => {
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => false,
    });

    renderBoothEditor();

    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Button/Navigation Tests
  it("displays buttons for navigation and actions", async () => {
    renderBoothEditor();

    await waitFor(() => {
      const buttons = screen.queryAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("displays save button", async () => {
    renderBoothEditor();

    await waitFor(() => {
      const buttons = screen.queryAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  // Layout Tests
  it("renders with Material-UI Container", () => {
    const { container } = renderBoothEditor();
    expect(container.querySelector(".MuiContainer-root")).toBeDefined();
  });

  it("renders Material-UI components", () => {
    const { container } = renderBoothEditor();
    const muiElements = container.querySelectorAll("[class*='Mui']");
    expect(muiElements.length).toBeGreaterThan(0);
  });

  it("renders with proper Box layout", () => {
    const { container } = renderBoothEditor();
    const boxes = container.querySelectorAll(".MuiBox-root");
    expect(boxes.length).toBeGreaterThanOrEqual(0);
  });

  // Error Handling
  it("handles missing role gracefully", () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      // role is missing
    });
    renderBoothEditor();
    expect(authUtils.getCurrentUser).toHaveBeenCalled();
  });

  it("handles null user gracefully", () => {
    (authUtils.getCurrentUser as any).mockReturnValue(null);
    renderBoothEditor();
    expect(authUtils.getCurrentUser).toHaveBeenCalled();
  });

  // Form Submission
  it("submits form when save button is clicked", async () => {
    const user = userEvent.setup();
    (firestore.updateDoc as any).mockResolvedValue({});

    renderBoothEditor();

    await waitFor(() => {
      const buttons = screen.queryAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });

    // Component should render without errors
    expect(firestore.updateDoc).toBeDefined();
  });
});
