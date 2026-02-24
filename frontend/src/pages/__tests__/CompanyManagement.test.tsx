import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import CompanyManagement from "../CompanyManagement";
import * as authUtils from "../../utils/auth";
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
    isAuthenticated: vi.fn(() => true),
    createCompany: vi.fn(),
    deleteCompany: vi.fn(),
    updateInviteCode: vi.fn(),
  },
}));

vi.mock("firebase/firestore");
vi.mock("../../firebase", () => ({
  db: {},
}));

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}));

const renderCompanyManagement = () => {
  return render(
    <BrowserRouter>
      <CompanyManagement />
    </BrowserRouter>
  );
};

const mockCompanyData = [
  {
    id: "company-1",
    data: () => ({
      companyName: "Tech Corp",
      inviteCode: "TECH123",
      representativeIDs: ["rep1", "rep2"],
      ownerId: "owner-1",
    }),
  },
  {
    id: "company-2",
    data: () => ({
      companyName: "Software Inc",
      inviteCode: "SOFT456",
      representativeIDs: ["rep3"],
      ownerId: "owner-1",
    }),
  },
];

describe("CompanyManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();

    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "owner-1",
      role: "companyOwner",
      email: "owner@company.com",
    });
    (authUtils.authUtils.isAuthenticated as any).mockReturnValue(true);

    // Default mock for getDocs
    (firestore.getDocs as any).mockResolvedValue({
      forEach: (callback: any) => {
        mockCompanyData.forEach((item) => callback(item));
      },
      docs: mockCompanyData,
    });
  });

  // Authentication Tests
  describe("Authentication & Authorization", () => {
    it("redirects to login when not authenticated", () => {
      (authUtils.authUtils.isAuthenticated as any).mockReturnValue(false);
      renderCompanyManagement();
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });

    it("redirects non-company owners to dashboard", () => {
      (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
        uid: "student-1",
        role: "student",
        email: "student@example.com",
      });
      renderCompanyManagement();
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("allows company owners to access the page", async () => {
      renderCompanyManagement();
      await waitFor(() => {
        expect(screen.getByText("Company Management")).toBeInTheDocument();
      });
    });
  });

  // Loading State Tests
  describe("Loading States", () => {
    it("displays loading spinner while fetching companies", () => {
      (firestore.getDocs as any).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      renderCompanyManagement();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("hides loading spinner after companies are loaded", async () => {
      renderCompanyManagement();
      await waitFor(() => {
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      });
    });
  });

  // Company List Display Tests
  describe("Company List Display", () => {
    it("displays empty state when no companies exist", async () => {
      (firestore.getDocs as any).mockResolvedValue({
        forEach: vi.fn(),
        docs: [],
      });

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("No Companies Yet")).toBeInTheDocument();
        expect(screen.getByText("Create your first company to get started with invite codes and team management.")).toBeInTheDocument();
      });
    });

    it("displays company cards when companies exist", async () => {
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
        expect(screen.getByText("Software Inc")).toBeInTheDocument();
      });
    });

    it("displays invite codes for each company", async () => {
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByDisplayValue("TECH123")).toBeInTheDocument();
        expect(screen.getByDisplayValue("SOFT456")).toBeInTheDocument();
      });
    });

    it("displays representative counts correctly", async () => {
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("2 Representatives")).toBeInTheDocument();
        expect(screen.getByText("1 Representative")).toBeInTheDocument();
      });
    });

    it("handles error when fetching companies fails", async () => {
      (firestore.getDocs as any).mockRejectedValue(new Error("Network error"));

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Failed to load companies")).toBeInTheDocument();
      });
    });
  });

  // Company Creation Tests
  describe("Company Creation", () => {
    it("opens create dialog when Create Company button is clicked", async () => {
      const user = userEvent.setup();
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      const createButton = screen.getAllByText("Create Company")[0];
      await user.click(createButton);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Create New Company")).toBeInTheDocument();
      expect(screen.getByLabelText("Company Name")).toBeInTheDocument();
    });

    it("creates company successfully with valid name", async () => {
      const user = userEvent.setup();
      (authUtils.authUtils.createCompany as any).mockResolvedValue({
        success: true,
        companyId: "new-company-id",
      });

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Open dialog
      const createButton = screen.getAllByText("Create Company")[0];
      await user.click(createButton);

      // Fill in company name
      const nameInput = screen.getByLabelText("Company Name");
      await user.type(nameInput, "New Company");

      // Click create button
      const submitButton = screen.getByRole("button", { name: "Create" });
      await user.click(submitButton);

      // Verify API was called
      await waitFor(() => {
        expect(authUtils.authUtils.createCompany).toHaveBeenCalledWith(
          "New Company",
          "owner-1"
        );
      });

      // Verify success message
      await waitFor(() => {
        expect(screen.getByText(/Company "New Company" created successfully!/)).toBeInTheDocument();
      });
    });

    it("shows error when creating company with empty name", async () => {
      const user = userEvent.setup();
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Open dialog
      const createButton = screen.getAllByText("Create Company")[0];
      await user.click(createButton);

      // Try to create without entering name
      const submitButton = screen.getByRole("button", { name: "Create" });
      expect(submitButton).toBeDisabled();
    });

    it("shows error when company creation fails", async () => {
      const user = userEvent.setup();
      (authUtils.authUtils.createCompany as any).mockResolvedValue({
        success: false,
        error: "Company name already exists",
      });

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      }, { timeout: 5000 });

      // Open dialog
      const createButton = screen.getAllByText("Create Company")[0];
      await user.click(createButton);

      // Fill in company name
      const nameInput = screen.getByLabelText("Company Name");
      await user.type(nameInput, "Duplicate Company");

      // Click create button
      const submitButton = screen.getByRole("button", { name: "Create" });
      await user.click(submitButton);

      // Verify error message
      await waitFor(() => {
        expect(screen.getByText("Company name already exists")).toBeInTheDocument();
      }, { timeout: 5000 });
    }, 15000);

    it("closes dialog after successful creation", async () => {
      const user = userEvent.setup();
      (authUtils.authUtils.createCompany as any).mockResolvedValue({
        success: true,
        companyId: "new-id",
      });

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Open dialog
      const createButton = screen.getAllByText("Create Company")[0];
      await user.click(createButton);

      // Fill and submit
      const nameInput = screen.getByLabelText("Company Name");
      await user.type(nameInput, "New Company");
      const submitButton = screen.getByRole("button", { name: "Create" });
      await user.click(submitButton);

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText("Create New Company")).not.toBeInTheDocument();
      });
    });
  });

  // Invite Code Management Tests
  describe("Invite Code Management", () => {
    it("copies invite code to clipboard", async () => {
      const user = userEvent.setup();
      const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText");

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Find and click copy button for first company
      const copyButtons = screen.getAllByRole("button", { name: /copy invite code/i });
      await user.click(copyButtons[0]);

      expect(clipboardSpy).toHaveBeenCalledWith("TECH123");
      await waitFor(() => {
        expect(screen.getByText("Invite code copied to clipboard!")).toBeInTheDocument();
      });
    });

    it("regenerates invite code successfully", async () => {
      const user = userEvent.setup();
      (authUtils.authUtils.updateInviteCode as any).mockResolvedValue({
        success: true,
        inviteCode: "NEWCODE789",
      });

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Click regenerate button
      const regenerateButtons = screen.getAllByRole("button", { name: /regenerate invite code/i });
      await user.click(regenerateButtons[0]);

      await waitFor(() => {
        expect(authUtils.authUtils.updateInviteCode).toHaveBeenCalledWith("company-1", "owner-1");
        expect(screen.getByText("Invite code regenerated successfully!")).toBeInTheDocument();
      });
    });

    it("enters edit mode for invite code", async () => {
      const user = userEvent.setup();
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Click edit button
      const editButtons = screen.getAllByRole("button", { name: /edit invite code/i });
      await user.click(editButtons[0]);

      // Should show save and cancel buttons
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
      });
    });

    it("saves custom invite code", async () => {
      const user = userEvent.setup();
      (authUtils.authUtils.updateInviteCode as any).mockResolvedValue({
        success: true,
        inviteCode: "CUSTOM123",
      });

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Enter edit mode
      const editButtons = screen.getAllByRole("button", { name: /edit invite code/i });
      await user.click(editButtons[0]);

      // Edit the invite code
      const inviteCodeInput = screen.getByDisplayValue("TECH123");
      await user.clear(inviteCodeInput);
      await user.type(inviteCodeInput, "CUSTOM123");

      // Save
      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(authUtils.authUtils.updateInviteCode).toHaveBeenCalledWith(
          "company-1",
          "owner-1",
          "CUSTOM123"
        );
        expect(screen.getByText("Invite code updated successfully!")).toBeInTheDocument();
      });
    });

    it("cancels invite code edit", async () => {
      const user = userEvent.setup();
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Enter edit mode
      const editButtons = screen.getAllByRole("button", { name: /edit invite code/i });
      await user.click(editButtons[0]);

      // Cancel
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      // Should not show save/cancel buttons anymore
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
      });
    });

    it("validates invite code length (too short)", async () => {
      const user = userEvent.setup();
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Enter edit mode
      const editButtons = screen.getAllByRole("button", { name: /edit invite code/i });
      await user.click(editButtons[0]);

      // Enter too short code
      const inviteCodeInput = screen.getByDisplayValue("TECH123");
      await user.clear(inviteCodeInput);
      await user.type(inviteCodeInput, "AB");

      // Try to save
      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText("Invite code must be 4-20 characters")).toBeInTheDocument();
      });
    });
  });

  // Company Deletion Tests
  describe("Company Deletion", () => {
    it("opens delete confirmation dialog", async () => {
      const user = userEvent.setup();
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Click delete button
      const deleteButtons = screen.getAllByRole("button", { name: /delete company/i });
      await user.click(deleteButtons[0]);

      // Verify dialog appears
      await waitFor(() => {
        expect(screen.getAllByText("Delete Company")[0]).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();
      });
    });

    it("deletes company successfully", async () => {
      const user = userEvent.setup();
      (authUtils.authUtils.deleteCompany as any).mockResolvedValue({
        success: true,
      });

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Open delete dialog
      const deleteButtons = screen.getAllByRole("button", { name: /delete company/i });
      await user.click(deleteButtons[0]);

      // Confirm deletion
      await waitFor(() => {
        expect(screen.getAllByText("Delete Company")[0]).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: "Delete Company" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(authUtils.authUtils.deleteCompany).toHaveBeenCalledWith("company-1", "owner-1");
        expect(screen.getByText(/Company "Tech Corp" has been deleted successfully/)).toBeInTheDocument();
      });
    });

    it("cancels company deletion", async () => {
      const user = userEvent.setup();
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Open delete dialog
      const deleteButtons = screen.getAllByRole("button", { name: /delete company/i });
      await user.click(deleteButtons[0]);

      // Cancel
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText(/Are you sure you want to delete/i)).not.toBeInTheDocument();
      });

      // Company should still be there
      expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    });

    it("handles company deletion error", async () => {
      const user = userEvent.setup();
      (authUtils.authUtils.deleteCompany as any).mockResolvedValue({
        success: false,
        error: "Company has active representatives",
      });

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      // Open and confirm delete
      const deleteButtons = screen.getAllByRole("button", { name: /delete company/i });
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getAllByText("Delete Company")[0]).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: "Delete Company" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText("Company has active representatives")).toBeInTheDocument();
      });
    });
  });

  // Navigation Tests
  describe("Navigation", () => {
    it("navigates back to dashboard when back button is clicked", async () => {
      const user = userEvent.setup();
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Company Management")).toBeInTheDocument();
      });

      const backButton = screen.getByRole("button", { name: "" }); // Arrow back has no text
      await user.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("navigates to company details when Manage Company is clicked", async () => {
      const user = userEvent.setup();
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      const manageButtons = screen.getAllByRole("button", { name: /manage company/i });
      await user.click(manageButtons[0]);

      expect(mockNavigate).toHaveBeenCalledWith("/company/company-1");
    });
  });

  // UI Component Tests
  describe("UI Components", () => {
    it("renders profile menu in header", async () => {
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByTestId("profile-menu")).toBeInTheDocument();
      });
    });

    it("displays page title in header", async () => {
      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Company Management")).toBeInTheDocument();
      });
    });

    it("renders Create Company button in empty state", async () => {
      (firestore.getDocs as any).mockResolvedValue({
        forEach: vi.fn(),
        docs: [],
      });

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Create Your First Company")).toBeInTheDocument();
      });
    });
  });

  // Error Handling Tests
  describe("Error Handling", () => {
    it("displays and dismisses error alerts", async () => {
      const user = userEvent.setup();
      (firestore.getDocs as any).mockRejectedValue(new Error("Network error"));

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Failed to load companies")).toBeInTheDocument();
      });

      // Close the error alert
      const closeButton = screen.getByRole("button", { name: /close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText("Failed to load companies")).not.toBeInTheDocument();
      });
    });

    it("handles clipboard copy error gracefully", async () => {
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
        new Error("Clipboard error")
      );

      renderCompanyManagement();

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      });

      const copyButtons = screen.getAllByRole("button", { name: /copy invite code/i });
      await user.click(copyButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Failed to copy to clipboard")).toBeInTheDocument();
      });
    });
  });
});
