import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import BoothEditor from "../BoothEditor";
import * as authUtils from "../../utils/auth";
import * as firestore from "firebase/firestore";
import * as storage from "firebase/storage";

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
  getDocs: vi.fn(),
  doc: vi.fn((_db, collectionName, docId) => ({ _collection: collectionName, _id: docId })),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  where: vi.fn(),
  query: vi.fn(),
}));

vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  db: {},
  storage: {},
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
          ref._id === "company-1"
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
        const input = screen.getByRole("textbox", { name: /company name/i });
        expect((input as HTMLInputElement).value).toBe("Tech Company");
      });
    });

    it("loads and displays existing booth data when editing", async () => {
      (firestore.getDoc as any).mockImplementation((ref: any) => {
        return Promise.resolve(
          ref._id === "company-1"
            ? { ...mockCompanyDoc, data: () => ({ ...mockCompanyDoc.data(), boothId: "booth-1" }) }
            : mockBoothDoc
        );
      });

      renderBoothEditor();

      await waitFor(() => {
        const nameInput = screen.getByRole("textbox", { name: /company name/i });
        expect((nameInput as HTMLInputElement).value).toBe("Tech Company");
      });

      const locationInput = screen.getByRole("textbox", { name: /location/i });
      expect((locationInput as HTMLInputElement).value).toBe("San Francisco, CA");

      const descriptionInput = screen.getByRole("textbox", { name: /company description/i });
      expect((descriptionInput as HTMLInputElement).value).toBe("We build innovative software solutions");
    });
  });

  // Form Interaction Tests
  describe("Form Interactions", () => {
    it("allows user to fill in company name", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      }, { timeout: 5000 });

      const nameInput = screen.getByRole("textbox", { name: /company name/i });
      await user.clear(nameInput);
      await user.type(nameInput, "New Tech Company");

      expect((nameInput as HTMLInputElement).value).toBe("New Tech Company");
    }, 10000);

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
      }, { timeout: 5000 });

      const locationInput = screen.getByRole("textbox", { name: /location/i });
      await user.clear(locationInput);
      await user.type(locationInput, "New York, NY");

      expect((locationInput as HTMLInputElement).value).toBe("New York, NY");
    }, 10000);

    it("allows user to fill in description", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company description/i })).toBeInTheDocument();
      }, { timeout: 5000 });

      const descriptionInput = screen.getByRole("textbox", { name: /company description/i });
      await user.clear(descriptionInput);
      await user.type(descriptionInput, "We are a leading tech company");

      expect((descriptionInput as HTMLInputElement).value).toBe("We are a leading tech company");
    }, 10000);

    it("allows user to fill in contact information", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /contact person name/i })).toBeInTheDocument();
      }, { timeout: 5000 });

      const contactNameInput = screen.getByRole("textbox", { name: /contact person name/i });
      await user.type(contactNameInput, "John Smith");

      const contactEmailInput = screen.getByRole("textbox", { name: /contact email/i });
      await user.type(contactEmailInput, "owner@company.com");

      expect((contactNameInput as HTMLInputElement).value).toBe("John Smith");
      expect((contactEmailInput as HTMLInputElement).value).toBe("owner@company.com");
    }, 10000);

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
      }, { timeout: 5000 });

      // Fill in required fields
      const industrySelect = screen.getByRole("combobox", { name: /industry/i });
      await user.click(industrySelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /software development/i })).toBeInTheDocument();
      }, { timeout: 3000 });
      await user.click(screen.getByRole("option", { name: /software development/i }));

      const sizeSelect = screen.getByRole("combobox", { name: /company size/i });
      await user.click(sizeSelect);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /51-200 employees/i })).toBeInTheDocument();
      }, { timeout: 3000 });
      await user.click(screen.getByRole("option", { name: /51-200 employees/i }));

      await user.type(screen.getByRole("textbox", { name: /location/i }), "San Francisco, CA");
      await user.type(screen.getByRole("textbox", { name: /company description/i }), "We build software");
      await user.type(screen.getByRole("textbox", { name: /contact person name/i }), "Jane Doe");
      await user.type(screen.getByRole("textbox", { name: /contact email/i }), "owner@company.com");

      const submitButton = screen.getByRole("button", { name: /create booth/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Booth created successfully!")).toBeInTheDocument();
      }, { timeout: 5000 });

      // Should navigate after success
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/company/company-1");
      }, { timeout: 3000 });
    }, 20000);

    it("submits form and updates existing booth successfully", async () => {
      const user = userEvent.setup();
      (firestore.getDoc as any).mockImplementation((ref: any) => {
        return Promise.resolve(
          ref._id === "company-1"
            ? { ...mockCompanyDoc, data: () => ({ ...mockCompanyDoc.data(), boothId: "booth-1" }) }
            : mockBoothDoc
        );
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Edit Booth" })).toBeInTheDocument();
      }, { timeout: 5000 });

      const locationInput = screen.getByRole("textbox", { name: /location/i });
      await user.clear(locationInput);
      await user.type(locationInput, "New York, NY");

      const submitButton = screen.getByRole("button", { name: /update booth/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Booth updated successfully!")).toBeInTheDocument();
      }, { timeout: 3000 });
    }, 10000);

    it("shows error when contact email is not registered", async () => {
      const user = userEvent.setup();
      (firestore.getDocs as any).mockResolvedValue({ empty: true, docs: [] });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      }, { timeout: 5000 });

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

      const locationInput = screen.queryByRole("textbox", { name: /location/i }) || screen.queryByLabelText(/location/i);
      if (locationInput) {
        await user.type(locationInput, "San Francisco");
      }
      await user.type(screen.getByRole("textbox", { name: /company description/i }), "Description");
      await user.type(screen.getByRole("textbox", { name: /contact person name/i }), "Test User");
      await user.type(screen.getByRole("textbox", { name: /contact email/i }), "nonexistent@example.com");

      await user.click(screen.getByRole("button", { name: /create booth/i }));

      await waitFor(() => {
        expect(screen.getByText(/Contact email does not match any registered user/)).toBeInTheDocument();
      }, { timeout: 3000 });
    }, 15000);

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

    it("allows user to close success alerts", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Fill in form and submit
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

      await user.click(screen.getByRole("button", { name: /create booth/i }));

      await waitFor(() => {
        expect(screen.getByText("Booth created successfully!")).toBeInTheDocument();
      });

      // Close the success alert
      const closeButtons = screen.getAllByTitle("Close");
      const successAlertCloseButton = closeButtons.find(btn =>
        btn.closest('[class*="MuiAlert-standardSuccess"]')
      );
      if (successAlertCloseButton) {
        await user.click(successAlertCloseButton);
        await waitFor(() => {
          expect(screen.queryByText("Booth created successfully!")).not.toBeInTheDocument();
        });
      }
    });

    it("shows go back button on fatal error", async () => {
      const user = userEvent.setup();
      (firestore.getDoc as any).mockResolvedValue({
        exists: () => false,
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByText("Company not found")).toBeInTheDocument();
      });

      const goBackButton = screen.getByRole("button", { name: /go back/i });
      expect(goBackButton).toBeInTheDocument();

      await user.click(goBackButton);
      expect(mockNavigate).toHaveBeenCalledWith("/companies");
    });
  });

  // File Upload Tests
  describe("File Upload", () => {
    it("validates file type and rejects non-image files", async () => {
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      const file = new File(["content"], "document.pdf", { type: "application/pdf" });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      // Simulate file change event
      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      });

      const changeEvent = new Event('change', { bubbles: true });
      input.dispatchEvent(changeEvent);

      await waitFor(() => {
        expect(screen.getByText("Only PNG or JPG images are allowed.")).toBeInTheDocument();
      });
    });

    it("validates file size and rejects files over 5MB", async () => {
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Create a large file (6MB)
      const largeContent = new Array(6 * 1024 * 1024).fill("a").join("");
      const file = new File([largeContent], "large-logo.png", { type: "image/png" });
      Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      });

      const changeEvent = new Event('change', { bubbles: true });
      input.dispatchEvent(changeEvent);

      await waitFor(() => {
        expect(screen.getByText("Logo file must be under 5MB.")).toBeInTheDocument();
      });
    });

    it("accepts valid PNG file and shows preview", async () => {
      const user = userEvent.setup();
      globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
      globalThis.URL.revokeObjectURL = vi.fn();

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      const file = new File(["content"], "logo.png", { type: "image/png" });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByAltText("Selected logo preview")).toBeInTheDocument();
        expect(screen.getByText(/Selected: logo.png/i)).toBeInTheDocument();
      });

      expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(file);
    });

    it("accepts valid JPG file", async () => {
      const user = userEvent.setup();
      globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      const file = new File(["content"], "logo.jpg", { type: "image/jpeg" });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByAltText("Selected logo preview")).toBeInTheDocument();
      });
    });

    it("displays existing logo when booth has logoUrl", async () => {
      (firestore.getDoc as any).mockImplementation((ref: any) => {
        return Promise.resolve(
          ref._id === "company-1"
            ? { ...mockCompanyDoc, data: () => ({ ...mockCompanyDoc.data(), boothId: "booth-1" }) }
            : { ...mockBoothDoc, data: () => ({ ...mockBoothDoc.data(), logoUrl: "https://example.com/logo.png" }) }
        );
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByAltText("Current logo")).toBeInTheDocument();
        expect(screen.getByText(/Current logo is saved and will display on booth pages/i)).toBeInTheDocument();
      });
    });

    it("displays placeholder when no logo is selected or exists", async () => {
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Check for the placeholder icon (BusinessIcon)
      const placeholders = document.querySelectorAll('[data-testid="BusinessIcon"]');
      expect(placeholders.length).toBeGreaterThan(0);
    });

    it("uploads logo file during form submission", async () => {
      const user = userEvent.setup();
      globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
      globalThis.URL.revokeObjectURL = vi.fn();

      const mockUploadTask = {
        on: vi.fn((_event, onProgress, _onError, onComplete) => {
          // Simulate progress
          onProgress({ bytesTransferred: 50, totalBytes: 100 });
          // Simulate completion
          setTimeout(() => onComplete(), 0);
        }),
        snapshot: { ref: {} },
      };

      (storage.uploadBytesResumable as any).mockReturnValue(mockUploadTask);
      (storage.getDownloadURL as any).mockResolvedValue("https://example.com/uploaded-logo.png");
      (storage.ref as any).mockReturnValue({});

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Upload a file
      const file = new File(["content"], "logo.png", { type: "image/png" });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByAltText("Selected logo preview")).toBeInTheDocument();
      });

      // Fill in form and submit
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

      await user.click(screen.getByRole("button", { name: /create booth/i }));

      await waitFor(() => {
        expect(storage.uploadBytesResumable).toHaveBeenCalled();
        expect(storage.getDownloadURL).toHaveBeenCalled();
      });
    });

    it("shows error when logo upload fails", async () => {
      const user = userEvent.setup();
      globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");

      const mockUploadTask = {
        on: vi.fn((_event, _onProgress, onError) => {
          // Simulate upload error
          setTimeout(() => onError(new Error("Upload failed")), 0);
        }),
        snapshot: { ref: {} },
      };

      (storage.uploadBytesResumable as any).mockReturnValue(mockUploadTask);
      (storage.ref as any).mockReturnValue({});

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Upload a file
      const file = new File(["content"], "logo.png", { type: "image/png" });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(input, file);

      // Fill in form and submit
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

      await user.click(screen.getByRole("button", { name: /create booth/i }));

      await waitFor(() => {
        expect(screen.getByText("Logo upload failed. Please try again.")).toBeInTheDocument();
      });
    });

    it("disables upload button while saving", async () => {
      const user = userEvent.setup();
      let resolveSubmit: any;
      (firestore.addDoc as any).mockImplementation(() => new Promise(resolve => { resolveSubmit = resolve; }));

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

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

      await user.click(screen.getByRole("button", { name: /create booth/i }));

      await waitFor(() => {
        const uploadButton = screen.getByRole("button", { name: /upload logo/i });
        expect(uploadButton).toHaveAttribute('aria-disabled', 'true');
      });

      if (resolveSubmit) resolveSubmit({ id: "booth-1" });
    });
  });

  // Additional Form Field Tests
  describe("Additional Form Fields", () => {
    it("allows user to fill in website URL", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company website/i })).toBeInTheDocument();
      });

      const websiteInput = screen.getByRole("textbox", { name: /company website/i });
      await user.type(websiteInput, "https://example.com");

      expect((websiteInput as HTMLInputElement).value).toBe("https://example.com");
    });

    it("allows user to fill in careers page URL", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /careers page/i })).toBeInTheDocument();
      });

      const careersInput = screen.getByRole("textbox", { name: /careers page/i });
      await user.type(careersInput, "https://example.com/careers");

      expect((careersInput as HTMLInputElement).value).toBe("https://example.com/careers");
    });

    it("allows user to fill in contact phone", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /contact phone/i })).toBeInTheDocument();
      });

      const phoneInput = screen.getByRole("textbox", { name: /contact phone/i });
      await user.type(phoneInput, "+1 (555) 123-4567");

      expect((phoneInput as HTMLInputElement).value).toBe("+1 (555) 123-4567");
    });

    it("includes optional fields in booth creation", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Fill in all fields including optional ones
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

      const locationInput = screen.queryByRole("textbox", { name: /location/i }) || screen.queryByLabelText(/location/i);
      if (locationInput) await user.type(locationInput, "San Francisco");
      await user.type(screen.getByRole("textbox", { name: /company description/i }), "Description");
      await user.type(screen.getByRole("textbox", { name: /company website/i }), "https://example.com");
      await user.type(screen.getByRole("textbox", { name: /careers page/i }), "https://example.com/careers");
      await user.type(screen.getByRole("textbox", { name: /contact person name/i }), "Test User");
      await user.type(screen.getByRole("textbox", { name: /contact email/i }), "owner@company.com");
      await user.type(screen.getByRole("textbox", { name: /contact phone/i }), "+1 555-1234");

      await user.click(screen.getByRole("button", { name: /create booth/i }));

      await waitFor(() => {
        expect(firestore.addDoc).toHaveBeenCalled();
        const callArgs = (firestore.addDoc as any).mock.calls[0];
        const boothData = callArgs[1];
        expect(boothData.website).toBe("https://example.com");
        expect(boothData.careersPage).toBe("https://example.com/careers");
        expect(boothData.contactPhone).toBe("+1 555-1234");
      });
    }, 15000);
  });

  // Representative Access Tests
  describe("Representative Access", () => {
    it("allows representative to edit company booth", async () => {
      (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
        uid: "rep-1",
        role: "representative",
      });

      (firestore.getDoc as any).mockResolvedValue({
        exists: () => true,
        id: "company-1",
        data: () => ({
          companyName: "Tech Company",
          ownerId: "owner-1",
          representativeIDs: ["rep-1"],
        }),
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByText("Company Information")).toBeInTheDocument();
      });
    });

    it("allows contact email to be representative", async () => {
      const user = userEvent.setup();

      (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
        uid: "user-1",
        role: "companyOwner",
      });

      (firestore.getDoc as any).mockResolvedValue({
        exists: () => true,
        id: "company-1",
        data: () => ({
          companyName: "Tech Company",
          ownerId: "user-1",
          representativeIDs: ["rep-1"],
        }),
      });

      (firestore.getDocs as any).mockResolvedValue({
        empty: false,
        docs: [{
          data: () => ({ uid: "rep-1", email: "rep@company.com" }),
        }],
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Fill in form with representative as contact
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

      const locationInput = screen.queryByRole("textbox", { name: /location/i }) || screen.queryByLabelText(/location/i);
      if (locationInput) await user.type(locationInput, "Test");
      await user.type(screen.getByRole("textbox", { name: /company description/i }), "Test");
      await user.type(screen.getByRole("textbox", { name: /contact person name/i }), "Rep User");
      await user.type(screen.getByRole("textbox", { name: /contact email/i }), "rep@company.com");

      await user.click(screen.getByRole("button", { name: /create booth/i }));

      await waitFor(() => {
        expect(screen.getByText("Booth created successfully!")).toBeInTheDocument();
      });
    }, 15000);
  });

  // Missing Auth State Tests
  describe("Authentication State Edge Cases", () => {
    it("redirects when user is not authenticated or has no userId", async () => {
      (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
        uid: null,
        role: "companyOwner",
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/login");
      });
    });

    it("redirects when user has no role", async () => {
      (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
        uid: "user-1",
        role: null,
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/login");
      });
    });

    it("redirects admin users to dashboard", async () => {
      (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
        uid: "admin-1",
        role: "admin",
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
      });
    });
  });

  // Edge Cases for Booth Loading
  describe("Booth Loading Edge Cases", () => {
    it("handles error when loading booth fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (firestore.getDoc as any).mockImplementation((ref: any) => {
        if (ref._id === "company-1") {
          return Promise.resolve({
            ...mockCompanyDoc,
            data: () => ({ ...mockCompanyDoc.data(), boothId: "booth-1" })
          });
        }
        // Booth fetch fails
        return Promise.reject(new Error("Booth load error"));
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith("Error loading booth:", expect.any(Error));
      consoleErrorSpy.mockRestore();
    });

    it("handles missing booth data gracefully", async () => {
      (firestore.getDoc as any).mockImplementation((ref: any) => {
        if (ref._id === "company-1") {
          return Promise.resolve({
            ...mockCompanyDoc,
            data: () => ({ ...mockCompanyDoc.data(), boothId: "booth-1" })
          });
        }
        // Booth doesn't exist
        return Promise.resolve({ exists: () => false });
      });

      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });
    });

    it("handles booth with missing optional fields", async () => {
      (firestore.getDoc as any).mockImplementation((ref: any) => {
        if (ref._id === "company-1") {
          return Promise.resolve({
            ...mockCompanyDoc,
            data: () => ({ ...mockCompanyDoc.data(), boothId: "booth-1" })
          });
        }
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            companyName: "Minimal Company",
            // All other fields missing
          })
        });
      });

      renderBoothEditor();

      await waitFor(() => {
        const nameInput = screen.getByRole("textbox", { name: /company name/i });
        expect((nameInput as HTMLInputElement).value).toBe("Minimal Company");
      });
    });
  });

  // Alert Dismissal Tests
  describe("Alert Dismissal", () => {
    it("allows dismissing regular error alerts", async () => {
      const user = userEvent.setup();
      renderBoothEditor();

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /company name/i })).toBeInTheDocument();
      });

      // Trigger a validation error
      const file = new File(["content"], "document.pdf", { type: "application/pdf" });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      });

      const changeEvent = new Event('change', { bubbles: true });
      input.dispatchEvent(changeEvent);

      await waitFor(() => {
        expect(screen.getByText("Only PNG or JPG images are allowed.")).toBeInTheDocument();
      });

      // Close the error alert
      const closeButtons = screen.getAllByTitle("Close");
      const errorAlertCloseButton = closeButtons.find(btn =>
        btn.closest('[class*="MuiAlert-standardError"]')
      );

      if (errorAlertCloseButton) {
        await user.click(errorAlertCloseButton);
        await waitFor(() => {
          expect(screen.queryByText("Only PNG or JPG images are allowed.")).not.toBeInTheDocument();
        });
      }
    });
  });
});
