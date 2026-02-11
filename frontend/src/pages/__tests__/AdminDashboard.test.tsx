import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import AdminDashboard from "../AdminDashboard";
import * as authUtils from "../../utils/auth";
import * as fairStatus from "../../utils/fairStatus";
import * as firestore from "firebase/firestore";

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

vi.mock("firebase/firestore", () => {
  class MockTimestamp {
    seconds: number;
    nanoseconds: number;
    
    constructor(seconds: number, nanoseconds: number) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    
    toMillis() {
      return this.seconds * 1000 + this.nanoseconds / 1000000;
    }
    
    static now() {
      return new MockTimestamp(Math.floor(Date.now() / 1000), 0);
    }
    
    static fromDate(date: Date) {
      return new MockTimestamp(Math.floor(date.getTime() / 1000), 0);
    }
  }
  
  return {
    collection: vi.fn(),
    getDocs: vi.fn(),
    doc: vi.fn(),
    getDoc: vi.fn(),
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    setDoc: vi.fn(),
    Timestamp: MockTimestamp,
  };
});

vi.mock("../../firebase", () => ({
  db: {},
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

const mockScheduleData = {
  name: "Spring Career Fair 2024",
  description: "Join us for our spring career fair",
  startTime: { toMillis: () => Date.now() + 86400000 }, // Tomorrow
  endTime: { toMillis: () => Date.now() + 90000000 }, // Day after tomorrow
  createdAt: { toMillis: () => Date.now() },
  updatedAt: { toMillis: () => Date.now() },
  createdBy: "admin-1",
  updatedBy: "admin-1",
};

const mockSchedule = {
  id: "schedule-1",
  data: () => mockScheduleData,
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
    (fairStatus.evaluateFairStatus as any).mockResolvedValue({
      isLive: false,
      scheduleName: null,
      scheduleDescription: null,
    });
    (firestore.getDocs as any).mockResolvedValue({
      docs: [],
      forEach: (_callback: any) => {},
    });
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => false,
      data: () => ({}),
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

  // Loading State Tests
  describe("Loading States", () => {
    it("displays loading spinner while fetching data", () => {
      (firestore.getDocs as any).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      renderAdminDashboard();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("hides loading spinner after data loads", async () => {
      renderAdminDashboard();
      await waitFor(() => {
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
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

  // Fair Status Tests
  describe("Fair Status Management", () => {
    it("displays Career Fair Status section", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Career Fair Status")).toBeInTheDocument();
      });
    });

    it("displays fair as offline when not live", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Career Fair is OFFLINE")).toBeInTheDocument();
      });
    });

    it("displays fair as live when active", async () => {
      (fairStatus.evaluateFairStatus as any).mockResolvedValue({
        isLive: true,
        scheduleName: "Spring Fair",
        scheduleDescription: "Join us!",
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Career Fair is LIVE")).toBeInTheDocument();
      });
    });

    it("displays schedule name and description banner when fair is live", async () => {
      (fairStatus.evaluateFairStatus as any).mockResolvedValue({
        isLive: true,
        scheduleName: "Spring Career Fair 2024",
        scheduleDescription: "Join us for networking",
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Spring Career Fair 2024")).toBeInTheDocument();
        expect(screen.getByText("Join us for networking")).toBeInTheDocument();
      });
    });

    it("toggles fair status when switch is clicked", async () => {
      const user = userEvent.setup();
      (firestore.getDoc as any).mockResolvedValue({
        exists: () => true,
        data: () => ({ isLive: false }),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Career Fair is OFFLINE")).toBeInTheDocument();
      });

      const toggle = screen.getByRole("switch");
      await user.click(toggle);

      await waitFor(() => {
        expect(firestore.setDoc).toHaveBeenCalled();
        expect(screen.getByText(/Career fair is now LIVE/)).toBeInTheDocument();
      });
    });

    it("displays success message when toggling fair to live", async () => {
      const user = userEvent.setup();
      (firestore.getDoc as any).mockResolvedValue({
        exists: () => true,
        data: () => ({ isLive: false }),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Career Fair is OFFLINE")).toBeInTheDocument();
      });

      const toggle = screen.getByRole("switch");
      await user.click(toggle);

      await waitFor(() => {
        expect(screen.getByText(/Career fair is now LIVE/)).toBeInTheDocument();
      });
    });

    it("displays success message when toggling fair to offline", async () => {
      const user = userEvent.setup();
      (fairStatus.evaluateFairStatus as any).mockResolvedValue({
        isLive: true,
        scheduleName: null,
        scheduleDescription: null,
      });
      (firestore.getDoc as any).mockResolvedValue({
        exists: () => true,
        data: () => ({ isLive: true }),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Career Fair is LIVE")).toBeInTheDocument();
      });

      const toggle = screen.getByRole("switch");
      await user.click(toggle);

      await waitFor(() => {
        expect(screen.getByText(/Career fair is now offline/)).toBeInTheDocument();
      });
    });
  });

  // Schedule Management Tests
  describe("Schedule Management", () => {
    it("displays Scheduled Career Fairs section", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Scheduled Career Fairs")).toBeInTheDocument();
      });
    });

    it("displays Schedule Career Fair button", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        const buttons = screen.queryAllByRole("button");
        const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
        expect(scheduleButton).toBeTruthy();
      });
    });

    it("displays empty state when no schedules exist", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText(/No career fairs scheduled yet/)).toBeInTheDocument();
      });
    });

    it("displays loading spinner while fetching schedules", async () => {
      (firestore.getDocs as any).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      renderAdminDashboard();

      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("displays schedule list when schedules exist", async () => {
      (firestore.getDocs as any).mockResolvedValue({
        docs: [mockSchedule],
        forEach: (cb: any) => cb(mockSchedule),
      });
      
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText(/Spring Career Fair 2024/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("opens schedule dialog when Schedule Career Fair button is clicked", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        const buttons = screen.queryAllByRole("button");
        const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
        expect(scheduleButton).toBeTruthy();
      });

      const buttons = screen.getAllByRole("button");
      const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      await user.click(scheduleButton!);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Schedule Career Fair" })).toBeInTheDocument();
    });

    it("displays schedule form fields in dialog", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        const buttons = screen.queryAllByRole("button");
        const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
        expect(scheduleButton).toBeTruthy();
      });

      const buttons = screen.getAllByRole("button");
      const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      await user.click(scheduleButton!);

      expect(screen.getByLabelText(/Career Fair Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Start Time/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/End Time/i)).toBeInTheDocument();
    });

    it("creates new schedule successfully", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        const buttons = screen.queryAllByRole("button");
        const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
        expect(scheduleButton).toBeTruthy();
      });

      const buttons = screen.getAllByRole("button");
      const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      await user.click(scheduleButton!);

      // Fill in form
      const nameInput = screen.getByLabelText(/Career Fair Name/i);
      const startTimeInput = screen.getByLabelText(/Start Time/i);
      const endTimeInput = screen.getByLabelText(/End Time/i);

      await user.type(nameInput, "Fall Career Fair 2024");
      await user.type(startTimeInput, "2024-10-01T09:00");
      await user.type(endTimeInput, "2024-10-01T17:00");

      const submitButtons = screen.getAllByRole("button");
      const submitButton = submitButtons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      await user.click(submitButton!);

      await waitFor(() => {
        expect(firestore.addDoc).toHaveBeenCalled();
        expect(screen.getByText(/Career fair scheduled successfully/i)).toBeInTheDocument();
      });
    });

    it("validates that start and end times are required", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        const buttons = screen.queryAllByRole("button");
        const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
        expect(scheduleButton).toBeTruthy();
      });

      const buttons = screen.getAllByRole("button");
      const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      await user.click(scheduleButton!);

      const submitButtons = screen.getAllByRole("button");
      const submitButton = submitButtons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      expect(submitButton).toBeDisabled();
    });

    it("validates that end time is after start time", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        const buttons = screen.queryAllByRole("button");
        const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
        expect(scheduleButton).toBeTruthy();
      });

      const buttons = screen.getAllByRole("button");
      const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      await user.click(scheduleButton!);

      const startTimeInput = screen.getByLabelText(/Start Time/i);
      const endTimeInput = screen.getByLabelText(/End Time/i);

      await user.type(startTimeInput, "2024-10-01T17:00");
      await user.type(endTimeInput, "2024-10-01T09:00");

      const submitButtons = screen.getAllByRole("button");
      const submitButton = submitButtons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      await user.click(submitButton!);

      await waitFor(() => {
        expect(screen.getByText(/End time must be after start time/i)).toBeInTheDocument();
      });
    });

    it("opens edit dialog when edit button is clicked", async () => {
      const user = userEvent.setup();
      (firestore.getDocs as any).mockResolvedValue({
        docs: [mockSchedule],
        forEach: (cb: any) => cb(mockSchedule),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByTestId("EditIcon")).toBeInTheDocument();
      }, { timeout: 2000 });

      const editButton = screen.getByTestId("EditIcon").closest("button");
      await user.click(editButton!);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Edit Career Fair Schedule")).toBeInTheDocument();
    });



    it("deletes schedule after confirmation", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      (firestore.getDocs as any).mockResolvedValue({
        docs: [mockSchedule],
        forEach: (cb: any) => cb(mockSchedule),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByTestId("DeleteIcon")).toBeInTheDocument();
      }, { timeout: 2000 });

      const deleteButton = screen.getByTestId("DeleteIcon").closest("button");
      await user.click(deleteButton!);

      await waitFor(() => {
        expect(firestore.deleteDoc).toHaveBeenCalled();
        expect(screen.getByText(/Career fair schedule deleted successfully/i)).toBeInTheDocument();
      });

      confirmSpy.mockRestore();
    });

    it("cancels schedule deletion when user declines", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      (firestore.getDocs as any).mockResolvedValue({
        docs: [mockSchedule],
        forEach: (cb: any) => cb(mockSchedule),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByTestId("DeleteIcon")).toBeInTheDocument();
      }, { timeout: 2000 });

      const deleteButton = screen.getByTestId("DeleteIcon").closest("button");
      await user.click(deleteButton!);

      expect(firestore.deleteDoc).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("closes dialog when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        const buttons = screen.queryAllByRole("button");
        const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
        expect(scheduleButton).toBeTruthy();
      });

      const buttons = screen.getAllByRole("button");
      const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      await user.click(scheduleButton!);

      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });





    it("displays schedule status as Ended", async () => {
      const endedSchedule = {
        id: "schedule-1",
        data: () => ({
          name: "Past Fair",
          description: "Already happened",
          startTime: { toMillis: () => Date.now() - 90000000 },
          endTime: { toMillis: () => Date.now() - 86400000 },
          createdAt: { toMillis: () => Date.now() },
          updatedAt: { toMillis: () => Date.now() },
          createdBy: "admin-1",
          updatedBy: "admin-1",
        }),
      };

      (firestore.getDocs as any).mockResolvedValue({
        docs: [endedSchedule],
        forEach: (cb: any) => cb(endedSchedule),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Ended")).toBeInTheDocument();
      }, { timeout: 2000 });
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

    it("navigates to booths when View All Booths is clicked", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /View All Booths/i })).toBeInTheDocument();
      });

      const boothsButton = screen.getByRole("button", { name: /View All Booths/i });
      await user.click(boothsButton);

      expect(mockNavigate).toHaveBeenCalledWith("/booths");
    });

    it("navigates to dashboard when Go to Dashboard is clicked", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Go to Dashboard/i })).toBeInTheDocument();
      });

      const dashboardButton = screen.getByRole("button", { name: /Go to Dashboard/i });
      await user.click(dashboardButton);

      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  // Error Handling Tests
  describe("Error Handling", () => {
    it("displays error when fair status fetch fails", async () => {
      (fairStatus.evaluateFairStatus as any).mockRejectedValue(
        new Error("Failed to fetch fair status")
      );

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch fair status/i)).toBeInTheDocument();
      });
    });

    it("handles schedule creation error gracefully", async () => {
      const user = userEvent.setup();
      (firestore.addDoc as any).mockRejectedValue(new Error("Database error"));

      renderAdminDashboard();

      await waitFor(() => {
        const buttons = screen.queryAllByRole("button");
        const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
        expect(scheduleButton).toBeTruthy();
      });

      const buttons = screen.getAllByRole("button");
      const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      await user.click(scheduleButton!);

      const startTimeInput = screen.getByLabelText(/Start Time/i);
      const endTimeInput = screen.getByLabelText(/End Time/i);

      await user.type(startTimeInput, "2024-10-01T09:00");
      await user.type(endTimeInput, "2024-10-01T17:00");

      const submitButtons = screen.getAllByRole("button");
      const submitButton = submitButtons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      await user.click(submitButton!);

      await waitFor(() => {
        expect(screen.getByText(/Database error/i)).toBeInTheDocument();
      });
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

    it("displays descriptive text for fair status functionality", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText(/Control when the career fair is live/i)).toBeInTheDocument();
      });
    });

    it("displays note about scheduled fairs", async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText(/The career fair will be live when ANY scheduled career fair is active/i)).toBeInTheDocument();
      });
    });

    it("displays schedule description in table", async () => {
      (firestore.getDocs as any).mockResolvedValue({
        docs: [mockSchedule],
        forEach: (cb: any) => cb(mockSchedule),
      });
      
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText(/Join us for our spring career fair/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("displays 'No Status' chip when schedule has no times", async () => {
      const scheduleNoTimes = {
        id: "schedule-1",
        data: () => ({
          name: "Fair Without Times",
          description: "Missing times",
          startTime: null,
          endTime: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: "admin-1",
          updatedBy: "admin-1",
        }),
      };

      (firestore.getDocs as any).mockResolvedValue({
        docs: [scheduleNoTimes],
        forEach: (cb: any) => cb(scheduleNoTimes),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("No Status")).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("displays 'Unnamed Career Fair' when schedule has no name", async () => {
      const scheduleNoName = {
        id: "schedule-1",
        data: () => ({
          name: "",
          description: "Test description",
          startTime: { toMillis: () => Date.now() + 86400000 },
          endTime: { toMillis: () => Date.now() + 90000000 },
          createdAt: { toMillis: () => Date.now() },
          updatedAt: { toMillis: () => Date.now() },
          createdBy: "admin-1",
          updatedBy: "admin-1",
        }),
      };

      (firestore.getDocs as any).mockResolvedValue({
        docs: [scheduleNoName],
        forEach: (cb: any) => cb(scheduleNoName),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Unnamed Career Fair")).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it ("displays 'Not set' for null timestamp", async () => {
      const scheduleNullEnd = {
        id: "schedule-1",
        data: () => ({
          name: "Fair",
          description: "Test",
          startTime: { toMillis: () => Date.now() },
          endTime: null,
          createdAt: { toMillis: () => Date.now() },
          updatedAt: { toMillis: () => Date.now() },
          createdBy: "admin-1",
          updatedBy: "admin-1",
        }),
      };

      (firestore.getDocs as any).mockResolvedValue({
        docs: [scheduleNullEnd],
        forEach: (cb: any) => cb(scheduleNullEnd),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Not set")).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  // Additional Edge Cases
  describe("Edge Cases", () => {
    it("handles toggle fair status error", async () => {
      const user = userEvent.setup();
      (firestore.setDoc as any).mockRejectedValue(new Error("Failed to toggle"));
      (firestore.getDoc as any).mockResolvedValue({
        exists: () => true,
        data: () => ({ isLive: false }),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText("Career Fair is OFFLINE")).toBeInTheDocument();
      });

      const toggle = screen.getByRole("switch");
      await user.click(toggle);

      await waitFor(() => {
        expect(screen.getByText(/Failed to toggle fair status/i)).toBeInTheDocument();
      });
    });







    it("handles error in delete schedule", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      (firestore.deleteDoc as any).mockRejectedValue(new Error("Delete failed"));
      (firestore.getDocs as any).mockResolvedValue({
        docs: [mockSchedule],
        forEach: (cb: any) => cb(mockSchedule),
      });

      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByTestId("DeleteIcon")).toBeInTheDocument();
      }, { timeout: 2000 });

      const deleteButton = screen.getByTestId("DeleteIcon").closest("button");
      await user.click(deleteButton!);

      await waitFor(() => {
        expect(screen.getByText(/Delete failed/i)).toBeInTheDocument();
      });

      confirmSpy.mockRestore();
    });

    it("validates start time is required for save", async () => {
      const user = userEvent.setup();
      renderAdminDashboard();

      await waitFor(() => {
        const buttons = screen.queryAllByRole("button");
        const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
        expect(scheduleButton).toBeTruthy();
      });

      const buttons = screen.getAllByRole("button");
      const scheduleButton = buttons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      await user.click(scheduleButton!);

      const endTimeInput = screen.getByLabelText(/End Time/i);
      await user.type(endTimeInput, "2024-10-01T17:00");

      const submitButtons = screen.getAllByRole("button");
      const submitButton = submitButtons.find(btn => btn.textContent?.includes("Schedule Career Fair"));
      
      expect(submitButton).toBeDisabled();
    });








  });
});
