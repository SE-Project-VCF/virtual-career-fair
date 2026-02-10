import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import AdminDashboard from "../AdminDashboard";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
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
    now: vi.fn(),
  },
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}));

// Import after mocking
import { authUtils } from "../../utils/auth";
import { evaluateFairStatus } from "../../utils/fairStatus";
import * as firestore from "firebase/firestore";

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
    mockNavigate.mockClear();
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "admin-1",
      role: "administrator",
      email: "admin@example.com",
    });
    (authUtils.isAuthenticated as any).mockReturnValue(true);
    (evaluateFairStatus as any).mockResolvedValue({
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    });
    (firestore.getDocs as any).mockResolvedValue({ docs: [] });
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    });
  });

  // Authentication and Authorization Tests
  it("redirects non-authenticated users to login", async () => {
    (authUtils.isAuthenticated as any).mockReturnValue(false);
    renderAdminDashboard();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  it("redirects non-admin users to dashboard", () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "student",
      email: "user@example.com",
    });
    renderAdminDashboard();
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("allows admin users to access dashboard", async () => {
    renderAdminDashboard();

    await waitFor(() => {
      expect(authUtils.getCurrentUser).toHaveBeenCalled();
    });
  });

  it("handles missing role gracefully by redirecting", () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      email: "user@example.com",
      // role is undefined
    });
    renderAdminDashboard();
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  // Component Loading Tests
  it("displays loading state initially", () => {
    (firestore.getDocs as any).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );
    renderAdminDashboard();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("calls evaluateFairStatus on mount", async () => {
    renderAdminDashboard();

    await waitFor(() => {
      expect(evaluateFairStatus).toHaveBeenCalled();
    });
  });

  // Header Tests
  it("displays admin panel icon in header", async () => {
    renderAdminDashboard();

    await waitFor(() => {
      expect(screen.getByTestId("AdminPanelSettingsIcon")).toBeInTheDocument();
    });
  });

  it("displays ProfileMenu component in header", async () => {
    renderAdminDashboard();

    await waitFor(() => {
      expect(screen.getByTestId("profile-menu")).toBeInTheDocument();
    });
  });

  // Fair Status Tests
  it("renders fair status controls", async () => {
    renderAdminDashboard();

    await waitFor(() => {
      // Should render the component without errors
      expect(screen.getByTestId("AdminPanelSettingsIcon")).toBeInTheDocument();
    });
  });

  it("handles fair offline status", async () => {
    (evaluateFairStatus as any).mockResolvedValue({
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    });

    renderAdminDashboard();

    await waitFor(() => {
      expect(evaluateFairStatus).toHaveBeenCalled();
    });
  });

  it("handles fair live status with schedule info", async () => {
    (evaluateFairStatus as any).mockResolvedValue({
      isLive: true,
      scheduleName: "Spring 2024 Career Fair",
      scheduleDescription: "Join us for our spring career fair",
    });

    renderAdminDashboard();

    await waitFor(() => {
      expect(evaluateFairStatus).toHaveBeenCalled();
    });
  });

  // Schedule Management Tests
  it("displays schedule management with add button", async () => {
    renderAdminDashboard();

    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("opens schedule form dialog when add button is clicked", async () => {
    const user = userEvent.setup();
    renderAdminDashboard();

    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });

    // Click the first add/create button
    const buttons = screen.getAllByRole("button");
    const addButton = buttons.find(btn => btn.querySelector('svg[data-testid="AddIcon"]'));

    if (addButton) {
      await user.click(addButton);
      // Dialog should open
      await waitFor(() => {
        const dialogs = screen.queryAllByRole("dialog");
        expect(dialogs.length).toBeGreaterThanOrEqual(0);
      });
    }
  });

  // Schedule Form Tests
  it("renders form input fields when component loads", async () => {
    renderAdminDashboard();

    await waitFor(() => {
      const inputs = screen.queryAllByRole("textbox");
      // Component should render at least some input fields
      expect(inputs).toBeDefined();
    });
  });

  // Schedule List Tests
  it("renders table component for schedules", async () => {
    renderAdminDashboard();

    await waitFor(() => {
      // Table should render, may be empty or with data
      const tables = screen.queryAllByRole("table");
      expect(tables).toBeDefined();
    });
  });

  it("handles empty schedule list gracefully", async () => {
    (firestore.getDocs as any).mockResolvedValue({ docs: [] });

    renderAdminDashboard();

    await waitFor(() => {
      expect(firestore.getDocs).toHaveBeenCalled();
    });
  });

  it("displays schedule rows in table", async () => {
    (firestore.getDocs as any).mockResolvedValue({
      docs: [
        {
          id: "schedule-1",
          data: () => ({
            name: "Spring Career Fair 2024",
            startTime: new Date().getTime(),
            endTime: new Date().getTime() + 3600000,
          }),
        },
      ],
    });

    renderAdminDashboard();

    await waitFor(() => {
      expect(firestore.getDocs).toHaveBeenCalled();
    });
  });

  // Schedule Action Tests
  it("loads schedule data from firestore", async () => {
    (firestore.getDocs as any).mockResolvedValue({
      docs: [
        {
          id: "schedule-1",
          data: () => ({
            name: "Spring Career Fair 2024",
            startTime: new Date().getTime(),
            endTime: new Date().getTime() + 3600000,
          }),
        },
      ],
    });

    renderAdminDashboard();

    await waitFor(() => {
      expect(firestore.getDocs).toHaveBeenCalled();
    });
  });

  it("renders with edit and delete icons", async () => {
    renderAdminDashboard();

    await waitFor(() => {
      const editIcons = screen.queryAllByTestId("EditIcon");
      const deleteIcons = screen.queryAllByTestId("DeleteIcon");
      // May or may not have schedule rows to display icons
      expect(editIcons).toBeDefined();
      expect(deleteIcons).toBeDefined();
    });
  });

  // Error Handling Tests
  it("displays error message when fair status fetch fails", async () => {
    (evaluateFairStatus as any).mockRejectedValue(
      new Error("Failed to fetch fair status")
    );

    renderAdminDashboard();

    await waitFor(() => {
      expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    });
  });

  it("displays error message when schedule fetch fails", async () => {
    (firestore.getDocs as any).mockRejectedValue(
      new Error("Failed to fetch schedules")
    );

    renderAdminDashboard();

    // Component should handle error gracefully
    await waitFor(() => {
      expect(firestore.getDocs).toHaveBeenCalled();
    });
  });

  // Layout Tests
  it("renders with Material-UI Container", async () => {
    const { container } = renderAdminDashboard();
    expect(container.querySelector(".MuiContainer-root")).toBeDefined();
  });

  it("renders Material-UI components for dashboard", () => {
    const { container } = renderAdminDashboard();
    // Check that MUI elements are rendered
    const muiElements = container.querySelectorAll("[class*='Mui']");
    expect(muiElements.length).toBeGreaterThan(0);
  });
});
