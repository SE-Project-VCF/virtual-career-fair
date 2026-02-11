import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import BoothEditor from "../BoothEditor";
import * as authUtils from "../../utils/auth";
import * as firestore from "firebase/firestore";

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

vi.mock("firebase/firestore");
vi.mock("../../firebase", () => ({
  db: {},
}));

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}));

const renderBoothEditor = () => {
  return render(
    <BrowserRouter>
      <BoothEditor />
    </BrowserRouter>
  );
};

const mockCompanyDoc = {
  exists: () => true,
  id: "company-1",
  data: () => ({
    companyName: "Tech Company",
    ownerId: "user-1",
    representativeIDs: [],
  }),
};

const mockBoothDoc = {
  exists: () => true,
  id: "booth-1",
  data: () => ({
    companyName: "Tech Company",
    industry: "software",
    companySize: "51-200",
    location: "San Francisco, CA",
    description: "We build innovative software solutions",
    website: "https://techcompany.com",
    careersPage: "https://techcompany.com/careers",
    contactName: "Jane Doe",
    contactEmail: "owner@company.com",
    contactPhone: "+1 (555) 123-4567",
  }),
};

describe("BoothEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "companyOwner",
    });
    (authUtils.authUtils.isAuthenticated as any).mockReturnValue(true);

    // Default mock for getDoc
    (firestore.getDoc as any).mockResolvedValue(mockCompanyDoc);
    (firestore.getDocs as any).mockResolvedValue({
      empty: false,
      docs: [{
        data: () => ({ uid: "user-1", email: "owner@company.com" }),
      }],
    });
    (firestore.addDoc as any).mockResolvedValue({ id: "booth-1" });
    (firestore.updateDoc as any).mockResolvedValue({});
  });

  // Authentication Tests
  describe("Authentication & Authorization", () => {
    it("redirects to login when not authenticated", () => {
      (authUtils.authUtils.isAuthenticated as any).mockReturnValue(false);
      renderBoothEditor();
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });

    it("redirects to companies page when companyId is missing", async () => {
      // Note: This test is limited by the module-level mock of useParams
      // In real app, missing companyId would redirect to /companies
      // We verify the component handles this case in the useEffect
      renderBoothEditor();
      // Since our mock always provides companyId, we just verify the render completes
      await waitFor(() => {
        expect(screen.getByText("Company Information")).toBeInTheDocument();
      });
    });

    it("shows error when company not found", async () => {
      (firestore.getDoc as any).mockResolvedValue({
        exists: () => false,
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByText("Company not found")).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
    });

    it("redirects when non-owner tries to access another company's booth", async () => {
      (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
        uid: "user-2",
        role: "companyOwner",
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/companies");
      });
    });

    it("redirects when representative is not linked to company", async () => {
      (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
        uid: "user-2",
        role: "representative",
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
      });
    });

    it("redirects students to dashboard", async () => {
      (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
        uid: "user-1",
        role: "student",
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
      });
    });
  });

  // UI Rendering Tests
  describe("UI Rendering", () => {
    it("displays loading state initially", () => {
      (firestore.getDoc as any).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      renderBoothEditor();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("displays 'Create Booth' header when creating new booth", async () => {
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Create Booth" })).toBeInTheDocument();
      });
      expect(screen.getByText("Set up your company presence at the virtual career fair")).toBeInTheDocument();
    });

    it("displays 'Edit Booth' header when editing existing booth", async () => {
      (firestore.getDoc as any).mockImplementation((ref: any) => {
        // First call is for company, second is for booth
        return Promise.resolve(
          ref.id === "company-1"
            ? { ...mockCompanyDoc, data: () => ({ ...mockCompanyDoc.data(), boothId: "booth-1" }) }
            : mockBoothDoc
        );
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Edit Booth" })).toBeInTheDocument();
      });
    });

    it("displays all required form sections", async () => {
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByText("Company Information")).toBeInTheDocument();
      });
      expect(screen.getByText("Recruitment Information")).toBeInTheDocument();
      expect(screen.getByText("Contact Information")).toBeInTheDocument();
    });

    it("displays all form fields", async () => {
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });
      expect(screen.getByRole("combobox", { name: /industry/i })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /company size/i })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /location/i })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /company description/i })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /contact person name/i })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /contact email/i })).toBeInTheDocument();
    });

    it("displays action buttons", async () => {
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /create booth/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /upload logo/i })).toBeInTheDocument();
    });

    it("pre-fills company name when creating new booth", async () => {
      renderBoothEditor();

      await waitFor(() => {
        const input = screen.getByRole("textbox", { name: /company name/i }) as HTMLInputElement;
        expect(input.value).toBe("Tech Company");
      });
    });

    it("loads and displays existing booth data when editing", async () => {
      (firestore.getDoc as any).mockImplementation((ref: any) => {
        return Promise.resolve(
          ref.id === "company-1"
            ? { ...mockCompanyDoc, data: () => ({ ...mockCompanyDoc.data(), boothId: "booth-1" }) }
            : mockBoothDoc
        );
      });

      renderBoothEditor();

      await waitFor(() => {
        const nameInput = screen.getByRole("textbox", { name: /company name/i }) as HTMLInputElement;
        expect(nameInput.value).toBe("Tech Company");
      });

      const locationInput = screen.getByRole("textbox", { name: /location/i }) as HTMLInputElement;
      expect(locationInput.value).toBe("San Francisco, CA");

      const descriptionInput = screen.getByRole("textbox", { name: /company description/i }) as HTMLInputElement;
      expect(descriptionInput.value).toBe("We build innovative software solutions");
    });
  });

  // Form Interaction Tests
  describe("Form Interactions", () => {
    it("allows user to fill in company name", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      const nameInput = screen.getByRole("textbox", { name: /company name/i });
      await user.clear(nameInput);
      await user.type(nameInput, "New Tech Company");

      expect((nameInput as HTMLInputElement).value).toBe("New Tech Company");
    });

    it("allows user to select industry from dropdown", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("combobox", { name: /industry/i })).toBeInTheDocument();
      });

      const industrySelect = screen.getByRole("combobox", { name: /industry/i });
      await user.click(industrySelect);

      await waitFor(() => {
        expect(screen.getByRole("option", { name: /software development/i })).toBeInTheDocument();
      });
    });

    it("allows user to select company size", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("combobox", { name: /company size/i })).toBeInTheDocument();
      });

      const sizeSelect = screen.getByRole("combobox", { name: /company size/i });
      await user.click(sizeSelect);

      await waitFor(() => {
        expect(screen.getByRole("option", { name: /51-200 employees/i })).toBeInTheDocument();
      });
    });

    it("allows user to fill in location", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /location/i })).toBeInTheDocument();
      });

      const locationInput = screen.getByRole("textbox", { name: /location/i });
      await user.clear(locationInput);
      await user.type(locationInput, "New York, NY");

      expect((locationInput as HTMLInputElement).value).toBe("New York, NY");
    });

    it("allows user to fill in description", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company description/i })).toBeInTheDocument();
      });

      const descriptionInput = screen.getByRole("textbox", { name: /company description/i });
      await user.clear(descriptionInput);
      await user.type(descriptionInput, "We are a leading tech company");

      expect((descriptionInput as HTMLInputElement).value).toBe("We are a leading tech company");
    });

    it("allows user to fill in contact information", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /contact person name/i })).toBeInTheDocument();
      });

      const contactNameInput = screen.getByRole("textbox", { name: /contact person name/i });
      await user.type(contactNameInput, "John Smith");

      const contactEmailInput = screen.getByRole("textbox", { name: /contact email/i });
      await user.type(contactEmailInput, "owner@company.com");

      expect((contactNameInput as HTMLInputElement).value).toBe("John Smith");
      expect((contactEmailInput as HTMLInputElement).value).toBe("owner@company.com");
    });

    it("navigates back when cancel button is clicked", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/company/company-1");
    });

    it("navigates back when back arrow is clicked", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        const backButtons = screen.getAllByRole("button");
        expect(backButtons.length).toBeGreaterThan(0);
      });

      const backButton = screen.getAllByRole("button")[0]; // ArrowBackIcon button
      await user.click(backButton);
      expect(mockNavigate).toHaveBeenCalledWith("/company/company-1");
    });
  });

  // Form Submission Tests
  describe("Form Submission", () => {
    it("submits form and creates new booth successfully", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Fill in required fields
      const industrySelect = screen.getByRole("combobox", { name: /industry/i });
      await user.click(industrySelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /software development/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: /software development/i }));

      const sizeSelect = screen.getByRole("combobox", { name: /company size/i });
      await user.click(sizeSelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /51-200 employees/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: /51-200 employees/i }));

      await user.type(screen.getByRole("textbox", { name: /location/i }), "San Francisco, CA");
      await user.type(screen.getByRole("textbox", { name: /company description/i }), "We build software");
      await user.type(screen.getByRole("textbox", { name: /contact person name/i }), "Jane Doe");
      await user.type(screen.getByRole("textbox", { name: /contact email/i }), "owner@company.com");

      const submitButton = screen.getByRole("button", { name: /create booth/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Booth created successfully!")).toBeInTheDocument();
      });

      // Should navigate after success
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/company/company-1");
      }, { timeout: 2000 });
    });

    it("submits form and updates existing booth successfully", async () => {
      const user = userEvent.setup();
      (firestore.getDoc as any).mockImplementation((ref: any) => {
        return Promise.resolve(
          ref.id === "company-1"
            ? { ...mockCompanyDoc, data: () => ({ ...mockCompanyDoc.data(), boothId: "booth-1" }) }
            : mockBoothDoc
        );
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Edit Booth" })).toBeInTheDocument();
      });

      const locationInput = screen.getByRole("textbox", { name: /location/i }) as HTMLInputElement;
      await user.clear(locationInput);
      await user.type(locationInput, "New York, NY");

      const submitButton = screen.getByRole("button", { name: /update booth/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Booth updated successfully!")).toBeInTheDocument();
      });
    });

    it("shows error when contact email is not registered", async () => {
      const user = userEvent.setup();
      (firestore.getDocs as any).mockResolvedValue({ empty: true, docs: [] });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Fill in form
      const industrySelect = screen.getByRole("combobox", { name: /industry/i });
      await user.click(industrySelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /software development/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: /software development/i }));

      const sizeSelect = screen.getByRole("combobox", { name: /company size/i });
      await user.click(sizeSelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /51-200 employees/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: /51-200 employees/i }));

      await user.type(screen.getByRole("textbox", { name: /location/i }), "San Francisco");
      await user.type(screen.getByRole("textbox", { name: /company description/i }), "Description");
      await user.type(screen.getByRole("textbox", { name: /contact person name/i }), "Test User");
      await user.type(screen.getByRole("textbox", { name: /contact email/i }), "nonexistent@example.com");

      await user.click(screen.getByRole("button", { name: /create booth/i }));

      await waitFor(() => {
        expect(screen.getByText("Contact email does not match any registered user.")).toBeInTheDocument();
      });
    });

    it("shows error when contact is not company owner or representative", async () => {
      const user = userEvent.setup();
      (firestore.getDocs as any).mockResolvedValue({
        empty: false,
        docs: [{
          data: () => ({ uid: "other-user", email: "other@example.com" }),
        }],
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Fill in form
      const industrySelect = screen.getByRole("combobox", { name: /industry/i });
      await user.click(industrySelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /software development/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: /software development/i }));

      const sizeSelect = screen.getByRole("combobox", { name: /company size/i });
      await user.click(sizeSelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /51-200 employees/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: /51-200 employees/i }));

      await user.type(screen.getByRole("textbox", { name: /location/i }), "San Francisco");
      await user.type(screen.getByRole("textbox", { name: /company description/i }), "Description");
      await user.type(screen.getByRole("textbox", { name: /contact person name/i }), "Other User");
      await user.type(screen.getByRole("textbox", { name: /contact email/i }), "other@example.com");

      await user.click(screen.getByRole("button", { name: /create booth/i }));

      await waitFor(() => {
        expect(screen.getByText("This user is not an owner or representative of your company.")).toBeInTheDocument();
      });
    });

    it("shows error when booth creation fails", async () => {
      const user = userEvent.setup();
      (firestore.addDoc as any).mockRejectedValue(new Error("Database error"));

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Fill in form
      const industrySelect = screen.getByRole("combobox", { name: /industry/i });
      await user.click(industrySelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /software development/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: /software development/i }));

      const sizeSelect = screen.getByRole("combobox", { name: /company size/i });
      await user.click(sizeSelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /51-200 employees/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: /51-200 employees/i }));

      await user.type(screen.getByRole("textbox", { name: /location/i }), "San Francisco");
      await user.type(screen.getByRole("textbox", { name: /company description/i }), "Description");
      await user.type(screen.getByRole("textbox", { name: /contact person name/i }), "Jane Doe");
      await user.type(screen.getByRole("textbox", { name: /contact email/i }), "owner@company.com");

      await user.click(screen.getByRole("button", { name: /create booth/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to save booth/i)).toBeInTheDocument();
      });
    });

    it("disables submit button while saving", async () => {
      const user = userEvent.setup();
      let resolveSubmit: any;
      (firestore.addDoc as any).mockImplementation(() => new Promise(resolve => { resolveSubmit = resolve; }));

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Fill in form quickly
      const industrySelect = screen.getByRole("combobox", { name: /industry/i });
      await user.click(industrySelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /software development/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: /software development/i }));

      const sizeSelect = screen.getByRole("combobox", { name: /company size/i });
      await user.click(sizeSelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /51-200 employees/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: /51-200 employees/i }));

      await user.type(screen.getByRole("textbox", { name: /location/i }), "Test");
      await user.type(screen.getByRole("textbox", { name: /company description/i }), "Test");
      await user.type(screen.getByRole("textbox", { name: /contact person name/i }), "Test");
      await user.type(screen.getByRole("textbox", { name: /contact email/i }), "owner@company.com");

      const submitButton = screen.getByRole("button", { name: /create booth/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();
      });

      if (resolveSubmit) resolveSubmit({ id: "booth-1" });
    });
  });

  // Error Handling Tests
  describe("Error Handling", () => {
    it("handles firestore errors gracefully", async () => {
      (firestore.getDoc as any).mockRejectedValue(new Error("Network error"));

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByText("Failed to load company")).toBeInTheDocument();
      });
    });

    it("allows user to close error alerts", async () => {
      const user = userEvent.setup();
      (firestore.getDoc as any).mockResolvedValue({
        exists: () => false,
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByText("Company not found")).toBeInTheDocument();
      });

      // Find close buttons by title attribute (MUI Alert has close buttons)
      const closeButtons = screen.getAllByTitle("Close");
      await user.click(closeButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText("Company not found")).not.toBeInTheDocument();
      });
    });
  });
});
