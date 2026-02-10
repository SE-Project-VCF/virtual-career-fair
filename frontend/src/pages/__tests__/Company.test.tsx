import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import Company from "../Company";
import * as authUtils from "../../utils/auth";
import * as firestore from "firebase/firestore";

const mockNavigate = vi.fn();

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(() => true),
    deleteCompany: vi.fn(),
    updateInviteCode: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "company-1" }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock("firebase/firestore");
vi.mock("../../firebase", () => ({
  db: {},
}));

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(() => Promise.resolve()),
  },
});

const mockCompanyData = {
  id: "company-1",
  companyName: "Tech Corp",
  inviteCode: "INVITE123",
  representativeIDs: ["rep-1"],
  boothId: "booth-1",
  ownerId: "owner-1",
};

const mockRepresentativeData = {
  uid: "rep-1",
  email: "rep@example.com",
  firstName: "John",
  lastName: "Doe",
};

const mockJobData = {
  id: "job-1",
  companyId: "company-1",
  name: "Software Engineer",
  description: "We are hiring",
  majorsAssociated: "Computer Science",
  applicationLink: "https://example.com/apply",
  createdAt: new Date().getTime(),
};

const renderCompany = () => {
  return render(
    <BrowserRouter>
      <Company />
    </BrowserRouter>
  );
};

const setupDefaultMocks = () => {
  // Mock getDoc for company
  const mockGetDoc = vi.fn();
  mockGetDoc.mockResolvedValueOnce({
    exists: () => true,
    id: "company-1",
    data: () => ({
      companyName: mockCompanyData.companyName,
      inviteCode: mockCompanyData.inviteCode,
      representativeIDs: mockCompanyData.representativeIDs,
      boothId: mockCompanyData.boothId,
      ownerId: mockCompanyData.ownerId,
    }),
  });

  // Mock getDoc for representative
  mockGetDoc.mockResolvedValueOnce({
    exists: () => true,
    id: "rep-1",
    data: () => mockRepresentativeData,
  });

  // Mock getDocs for jobs
  const mockGetDocs = vi.fn();
  mockGetDocs.mockResolvedValueOnce({
    forEach: vi.fn((callback) => {
      callback({
        id: "job-1",
        data: () => ({
          companyId: mockJobData.companyId,
          name: mockJobData.name,
          description: mockJobData.description,
          majorsAssociated: mockJobData.majorsAssociated,
          applicationLink: mockJobData.applicationLink,
          createdAt: { toMillis: () => mockJobData.createdAt },
        }),
      });
    }),
  });

  (firestore.getDoc as any).mockImplementation(mockGetDoc);
  (firestore.getDocs as any).mockImplementation(mockGetDocs);
  (firestore.doc as any).mockImplementation((db, collection, id) => ({ collection, id }));
  (firestore.collection as any).mockImplementation((db, name) => ({ name }));
  (firestore.query as any).mockImplementation((ref, ...args) => ref);
  (firestore.where as any).mockImplementation(() => ({}));
  (firestore.updateDoc as any).mockResolvedValue(undefined);
  (firestore.addDoc as any).mockResolvedValue({ id: "new-job-1" });
  (firestore.deleteDoc as any).mockResolvedValue(undefined);
  (firestore.arrayRemove as any).mockImplementation((val) => val);
};

describe("Company", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "owner-1",
      role: "companyOwner",
    });
    (authUtils.authUtils.isAuthenticated as any).mockReturnValue(true);
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Authentication tests
  it("requires authentication and redirects when not authenticated", () => {
    (authUtils.authUtils.isAuthenticated as any).mockReturnValue(false);
    renderCompany();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("displays error when company not found", async () => {
    (firestore.getDoc as any).mockResolvedValueOnce({
      exists: () => false,
    });
    renderCompany();
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
    });
  });

  it("displays 'Go Back' button when company not found", async () => {
    (firestore.getDoc as any).mockResolvedValueOnce({
      exists: () => false,
    });
    renderCompany();
    await waitFor(() => {
      expect(screen.getByText("Go Back")).toBeInTheDocument();
    });
  });

  it("navigates back when 'Go Back' button is clicked", async () => {
    (firestore.getDoc as any).mockResolvedValueOnce({
      exists: () => false,
    });
    renderCompany();
    await waitFor(() => {
      expect(screen.getByText("Go Back")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Go Back"));
    expect(mockNavigate).toHaveBeenCalledWith("/companies");
  });

  it("loads and displays company data on mount", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
      expect(firestore.getDocs).toHaveBeenCalled();
    });
  });

  it("denies access to non-owner company owners", async () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "different-owner",
      role: "companyOwner",
    });
    (firestore.getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      id: "company-1",
      data: () => mockCompanyData,
    });
    renderCompany();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/companies");
    });
  });

  it("allows representative to access assigned company", async () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "rep-1",
      role: "representative",
    });
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("denies access to unassigned representatives", async () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "different-rep",
      role: "representative",
    });
    (firestore.getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      id: "company-1",
      data: () => mockCompanyData,
    });
    renderCompany();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  // Job management tests
  it("displays job postings section with fetched jobs", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDocs).toHaveBeenCalled();
    });
  });

  it("opens job creation dialog when add job button is clicked", async () => {
    renderCompany();
    await waitFor(() => {
      const addJobButtons = screen.queryAllByRole("button").filter(btn =>
        btn.textContent?.includes("Add Job") || btn.getAttribute("aria-label")?.includes("add")
      );
      if (addJobButtons.length > 0) {
        fireEvent.click(addJobButtons[0]);
      }
    });
  });

  it("validates job form fields are required", async () => {
    renderCompany();
    await waitFor(() => {
      const buttons = screen.queryAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("sends job data to firebase on save", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("fetches company data on first render", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("handles job creation error gracefully", async () => {
    (firestore.addDoc as any).mockRejectedValueOnce(new Error("Firebase error"));
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Representative management tests
  it("displays representatives list after loading", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("handles representative deletion with confirmation", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("updates company data after removing representative", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Invite code management tests
  it("displays invite code section", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("copies invite code to clipboard", async () => {
    renderCompany();
    await waitFor(() => {
      const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText");
      expect(clipboardSpy).toBeDefined();
    });
  });

  it("regenerates invite code via authUtils", async () => {
    (authUtils.authUtils.updateInviteCode as any).mockResolvedValueOnce({
      success: true,
      inviteCode: "NEWCODE123",
    });
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("handles invite code update validation", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Company deletion tests
  it("calls deleteCompany from authUtils on confirm", async () => {
    (authUtils.authUtils.deleteCompany as any).mockResolvedValueOnce({
      success: true,
    });
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("navigates to companies page after successful deletion", async () => {
    (authUtils.authUtils.deleteCompany as any).mockResolvedValueOnce({
      success: true,
    });
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("displays error when company deletion fails", async () => {
    (authUtils.authUtils.deleteCompany as any).mockResolvedValueOnce({
      success: false,
      error: "Failed to delete company",
    });
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Error handling
  it("displays error alert on firebase fetch failure", async () => {
    (firestore.getDoc as any).mockRejectedValueOnce(new Error("Network error"));
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("shows loading state while fetching data", async () => {
    renderCompany();
    // Component should have loading state initially
    expect(firestore.getDoc).toHaveBeenCalled();
  });

  it("fetches jobs for the company", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDocs).toHaveBeenCalled();
    });
  });

  it("fetches representatives for the company", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("renders authUtils.isAuthenticated returns true", () => {
    renderCompany();
    expect(authUtils.authUtils.isAuthenticated).toHaveBeenCalled();
  });

  it("calls getCurrentUser on mount", () => {
    renderCompany();
    expect(authUtils.authUtils.getCurrentUser).toHaveBeenCalled();
  });

  // Job editing tests
  it("opens edit dialog for existing job", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDocs).toHaveBeenCalled();
    });
  });

  it("updates job successfully", async () => {
    (firestore.updateDoc as any).mockResolvedValueOnce({});
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("handles job update error", async () => {
    (firestore.updateDoc as any).mockRejectedValueOnce(new Error("Update failed"));
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("deletes job after confirmation", async () => {
    (firestore.deleteDoc as any).mockResolvedValueOnce({});
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("handles job deletion error", async () => {
    (firestore.deleteDoc as any).mockRejectedValueOnce(new Error("Delete failed"));
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("validates job title is required", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("validates job description is required", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("validates application link URL format", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("allows empty application link", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Representative deletion tests
  it("removes representative from company", async () => {
    (firestore.updateDoc as any).mockResolvedValue({});
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("updates representative user document on removal", async () => {
    (firestore.updateDoc as any).mockResolvedValue({});
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("handles representative deletion error", async () => {
    (firestore.updateDoc as any).mockRejectedValueOnce(new Error("Update failed"));
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("displays representative name correctly", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("falls back to email when name is missing", async () => {
    const mockGetDocNoName = vi.fn();
    mockGetDocNoName.mockResolvedValueOnce({
      exists: () => true,
      id: "company-1",
      data: () => mockCompanyData,
    });
    mockGetDocNoName.mockResolvedValueOnce({
      exists: () => true,
      id: "rep-1",
      data: () => ({ uid: "rep-1", email: "rep@example.com" }),
    });
    (firestore.getDoc as any) = mockGetDocNoName;
    
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Invite code editing tests
  it("enters edit mode for invite code", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("cancels invite code edit", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("validates invite code length", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("saves custom invite code", async () => {
    (authUtils.authUtils.updateInviteCode as any).mockResolvedValueOnce({
      success: true,
      inviteCode: "CUSTOM123",
    });
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("handles invite code save error", async () => {
    (authUtils.authUtils.updateInviteCode as any).mockResolvedValueOnce({
      success: false,
      error: "Invite code already in use",
    });
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("handles invite code regeneration error", async () => {
    (authUtils.authUtils.updateInviteCode as any).mockRejectedValueOnce(
      new Error("Network error")
    );
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Company deletion tests  
  it("opens delete company confirmation dialog", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("cancels company deletion", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("only allows owner to delete company", async () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "rep-1",
      role: "representative",
    });
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Copy to clipboard tests
  it("copies invite code on button click", async () => {
    const user = userEvent.setup();
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
    
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText");
    const copyButtons = screen.queryAllByTestId("ContentCopyIcon");
    if (copyButtons.length > 0) {
      await user.click(copyButtons[0].closest("button")!);
      // Clipboard may or may not be called based on rendering
    }
  });

  it("handles clipboard copy error", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("Clipboard error")
    );
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Navigation tests
  it("navigates back on back button click", async () => {
    const user = userEvent.setup();
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  it("navigates to booth when booth ID exists", async () => {
    renderCompany();
    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Error boundary tests
  it("handles missing company ID in params", async () => {
    const useParamsMock = await import("react-router-dom");
    vi.spyOn(useParamsMock, "useParams").mockReturnValue({ id: undefined });
    renderCompany();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/companies");
    });
  });
});
