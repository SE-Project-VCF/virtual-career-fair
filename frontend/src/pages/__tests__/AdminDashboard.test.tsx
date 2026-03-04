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

  // Fair status labels
  describe("Fair Status Labels", () => {
    it("shows 'Ended' chip for a fair whose endTime is in the past", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fairs: [
            {
              id: "fair-ended",
              name: "Past Fair",
              isLive: false,
              startTime: Date.now() - 7200000,
              endTime: Date.now() - 3600000,
            },
          ],
        }),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Ended")).toBeInTheDocument();
      });
    });

    it("shows 'Upcoming' chip for a fair whose startTime is in the future", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fairs: [
            {
              id: "fair-upcoming",
              name: "Future Fair",
              isLive: false,
              startTime: Date.now() + 86400000,
              endTime: Date.now() + 172800000,
            },
          ],
        }),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Upcoming")).toBeInTheDocument();
      });
    });

    it("shows 'Scheduled' chip for a fair with no startTime or endTime", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fairs: [
            {
              id: "fair-scheduled",
              name: "Unscheduled Fair",
              isLive: false,
              startTime: null,
              endTime: null,
            },
          ],
        }),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Scheduled")).toBeInTheDocument();
      });
    });

    it("renders em dash for fairs with no start/end time", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fairs: [
            { id: "fair-1", name: "No Dates Fair", isLive: false, startTime: null, endTime: null },
          ],
        }),
      });

      renderAdminDashboard();

      await waitFor(() => {
        const dashes = screen.getAllByText("—");
        expect(dashes.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // Toggle Live
  describe("Toggle Live", () => {
    it("calls toggle-status API and updates fair isLive on success", async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            fairs: [{ id: "fair-1", name: "My Fair", isLive: false, startTime: null, endTime: null }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isLive: true }),
        });

      renderAdminDashboard();

      await waitFor(() => expect(screen.getByText("My Fair")).toBeInTheDocument());

      const toggle = screen.getByRole("switch");
      await user.click(toggle);

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "http://localhost:3000/api/fairs/fair-1/toggle-status",
          expect.objectContaining({ method: "POST" })
        );
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeChecked();
      });
    });

    it("shows toggle error when API returns error", async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            fairs: [{ id: "fair-1", name: "My Fair", isLive: false, startTime: null, endTime: null }],
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: "Toggle failed" }),
        });

      renderAdminDashboard();

      await waitFor(() => expect(screen.getByText("My Fair")).toBeInTheDocument());

      await user.click(screen.getByRole("switch"));

      await waitFor(() => {
        expect(screen.getByText("Toggle failed")).toBeInTheDocument();
      });
    });
  });

  // Delete Fair
  describe("Delete Fair", () => {
    it("calls delete API and reloads fairs when user confirms", async () => {
      const user = userEvent.setup();
      vi.spyOn(globalThis, "confirm").mockReturnValue(true);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            fairs: [{ id: "fair-1", name: "Doomed Fair", isLive: false, startTime: null, endTime: null }],
          }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // DELETE
        .mockResolvedValueOnce({ ok: true, json: async () => ({ fairs: [] }) }); // reload

      renderAdminDashboard();

      await waitFor(() => expect(screen.getByText("Doomed Fair")).toBeInTheDocument());

      await user.click(screen.getByTestId("DeleteIcon").closest("button")!);

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "http://localhost:3000/api/fairs/fair-1",
          expect.objectContaining({ method: "DELETE" })
        );
      });
    });

    it("does not call delete API when user cancels confirmation", async () => {
      const user = userEvent.setup();
      vi.spyOn(globalThis, "confirm").mockReturnValue(false);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fairs: [{ id: "fair-1", name: "Safe Fair", isLive: false, startTime: null, endTime: null }],
        }),
      });

      renderAdminDashboard();

      await waitFor(() => expect(screen.getByText("Safe Fair")).toBeInTheDocument());

      await user.click(screen.getByTestId("DeleteIcon").closest("button")!);

      // Only initial loadFairs call, no DELETE
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // Create Fair
  describe("Create Fair", () => {
    const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
      await waitFor(() => expect(screen.getByRole("button", { name: /new fair/i })).toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: /new fair/i }));
    };

    it("creates fair successfully and reloads list", async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ fairs: [] }) }) // initial load
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "new-fair" }) }) // POST
        .mockResolvedValueOnce({ ok: true, json: async () => ({ fairs: [] }) }); // reload

      renderAdminDashboard();
      await openDialog(user);

      await user.type(screen.getByLabelText(/Fair Name/i), "My New Fair");
      await user.click(screen.getByRole("button", { name: /^create$/i }));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "http://localhost:3000/api/fairs",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining("My New Fair"),
          })
        );
      });

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText("Create New Fair")).not.toBeInTheDocument();
      });
    });

    it("sends startTime and endTime as ISO strings when provided", async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ fairs: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "new-fair" }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ fairs: [] }) });

      renderAdminDashboard();
      await openDialog(user);

      await user.type(screen.getByLabelText(/Fair Name/i), "Timed Fair");
      await user.type(screen.getByLabelText(/Start Time/i), "2025-06-01T09:00");
      await user.type(screen.getByLabelText(/End Time/i), "2025-06-01T17:00");
      await user.click(screen.getByRole("button", { name: /^create$/i }));

      await waitFor(() => {
        const body = JSON.parse(
          (globalThis.fetch as any).mock.calls[1][1].body
        );
        expect(body.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(body.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });
    });

    it("shows API error message when create fails", async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ fairs: [] }) })
        .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Name already taken" }) });

      renderAdminDashboard();
      await openDialog(user);

      await user.type(screen.getByLabelText(/Fair Name/i), "Duplicate Fair");
      await user.click(screen.getByRole("button", { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText("Name already taken")).toBeInTheDocument();
      });
    });

    it("navigates to fair admin when Manage button is clicked", async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fairs: [{ id: "fair-42", name: "Managed Fair", isLive: false, startTime: null, endTime: null }],
        }),
      });

      renderAdminDashboard();

      await waitFor(() => expect(screen.getByRole("button", { name: /manage/i })).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: /manage/i }));

      expect(mockNavigate).toHaveBeenCalledWith("/fair/fair-42/admin");
    });
  });
});
