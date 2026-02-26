/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import AdminDashboard from "../AdminDashboard";
import * as authUtils from "../../utils/auth";

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

vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
}));

vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}));

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
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
    mockNavigate.mockClear();

    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "admin-1",
      role: "administrator",
      email: "admin@example.com",
    });
    (authUtils.authUtils.isAuthenticated as any).mockReturnValue(true);

    // Default fetch mock — returns empty fairs list
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fairs: [] }),
    });
  });

  // Authentication and Authorization Tests
  describe("Authentication & Authorization", () => {
    it("redirects unauthenticated users to login", async () => {
      (authUtils.authUtils.isAuthenticated as any).mockReturnValue(false);
      renderAdminDashboard();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/login");
      });
    });

    it("redirects non-admin users to dashboard", () => {
      (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
        uid: "user-1",
        role: "student",
        email: "user@example.com",
      });
      renderAdminDashboard();
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("redirects users with missing role to dashboard", () => {
      (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
        uid: "user-1",
        email: "user@example.com",
      });
      renderAdminDashboard();
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("allows administrator users to access dashboard", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Administrator Dashboard")).toBeInTheDocument();
      });
    });
  });

  // Header Tests
  describe("Header", () => {
    it("displays admin panel icon", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByTestId("AdminPanelSettingsIcon")).toBeInTheDocument();
      });
    });

    it("displays Administrator Dashboard title", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Administrator Dashboard")).toBeInTheDocument();
      });
    });

    it("displays ProfileMenu component", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByTestId("profile-menu")).toBeInTheDocument();
      });
    });
  });

  // Fairs Management Tests
  describe("Fairs Management", () => {
    it("displays Manage Career Fairs section", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Manage Career Fairs")).toBeInTheDocument();
      });
    });

    it("displays empty state when no fairs exist", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText(/No fairs created yet/i)).toBeInTheDocument();
      });
    });

    it("displays fairs list when fairs exist", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fairs: [
            {
              id: "fair-1",
              name: "Spring Career Fair 2024",
              isLive: false,
              startTime: Date.now() + 86400000,
              endTime: Date.now() + 90000000,
            },
          ],
        }),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Spring Career Fair 2024")).toBeInTheDocument();
      });
    });

    it("displays live fair with live indicator", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fairs: [
            {
              id: "fair-1",
              name: "Active Fair",
              isLive: true,
              startTime: Date.now() - 3600000,
              endTime: Date.now() + 3600000,
            },
          ],
        }),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Active Fair")).toBeInTheDocument();
        // "Live" appears both as table header and as status chip
        const liveElements = screen.getAllByText("Live");
        expect(liveElements.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("opens create dialog when New Fair button is clicked", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /new fair/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /new fair/i }));

      expect(screen.getByText("Create New Fair")).toBeInTheDocument();
    });

    it("displays form fields in create dialog", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /new fair/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /new fair/i }));

      expect(screen.getByLabelText(/Fair Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Start Time/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/End Time/i)).toBeInTheDocument();
    });

    it("closes create dialog when Cancel is clicked", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /new fair/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /new fair/i }));
      expect(screen.getByText("Create New Fair")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByText("Create New Fair")).not.toBeInTheDocument();
      });
    });
  });

  // Quick Actions Tests
  describe("Quick Actions", () => {
    it("displays Quick Actions section", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Quick Actions")).toBeInTheDocument();
      });
    });

    it("navigates to fairs when View All Fairs is clicked", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /View All Fairs/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /View All Fairs/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/fairs");
    });

    it("navigates to dashboard when Go to Dashboard is clicked", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Go to Dashboard/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Go to Dashboard/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  // UI Component Tests
  describe("UI Components", () => {
    it("renders with Material-UI Container", async () => {
      const { container } = renderAdminDashboard();

      await waitFor(() => {
        expect(container.querySelector(".MuiContainer-root")).toBeTruthy();
      });
    });

    it("displays descriptive text for fairs management", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText(/Create and manage multiple concurrent fairs/i)).toBeInTheDocument();
      });
    });
  });
});
