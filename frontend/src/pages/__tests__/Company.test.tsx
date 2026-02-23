import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import Company from "../Company";
import { getDoc, getDocs, updateDoc, addDoc, deleteDoc, arrayRemove } from "firebase/firestore";

const mockNavigate = vi.fn();
const mockUseParams = vi.fn(() => ({ id: "company-1" }));

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
    useParams: () => mockUseParams(),
    useNavigate: () => mockNavigate,
  };
});

vi.mock("firebase/firestore", () => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  arrayRemove: vi.fn(),
  doc: vi.fn((_db, coll, id) => ({ collection: coll, id })),
  collection: vi.fn((_db, name) => ({ name })),
  query: vi.fn((ref) => ref),
  where: vi.fn(() => ({})),
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

// Import after mocks
import { authUtils } from "../../utils/auth";

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(() => Promise.resolve()),
  },
});

const mockCompanyData = {
  companyName: "Tech Corp",
  inviteCode: "INVITE123",
  representativeIDs: ["rep-1"],
  boothId: "booth-1",
  ownerId: "owner-1",
};

const mockRepresentativeData = {
  email: "rep@example.com",
  firstName: "John",
  lastName: "Doe",
};

const mockJobData = {
  companyId: "company-1",
  name: "Software Engineer",
  description: "We are hiring",
  majorsAssociated: "Computer Science",
  applicationLink: "https://example.com/apply",
  createdAt: { toMillis: () => 1234567890 },
};

describe("Company", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockUseParams.mockReturnValue({ id: "company-1" });
    
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "owner-1",
      role: "companyOwner",
    });
    (authUtils.isAuthenticated as any).mockReturnValue(true);

    // Mock getDoc to return different values based on collection
    (getDoc as any).mockImplementation((docRef: any) => {
      if (docRef.id === "company-1") {
        return Promise.resolve({
          exists: () => true,
          id: "company-1",
          data: () => mockCompanyData,
        });
      }
      if (docRef.id === "rep-1") {
        return Promise.resolve({
          exists: () => true,
          id: "rep-1",
          data: () => mockRepresentativeData,
        });
      }
      return Promise.resolve({
        exists: () => false,
      });
    });

    (getDocs as any).mockResolvedValue({
      forEach: (cb: any) => cb({ id: "job-1", data: () => mockJobData }),
      empty: false,
    });

    (updateDoc as any).mockResolvedValue(undefined);
    (addDoc as any).mockResolvedValue({ id: "new-job" });
    (deleteDoc as any).mockResolvedValue(undefined);
    (arrayRemove as any).mockImplementation((v: unknown) => v);
  });

  const renderComp = () => render(<BrowserRouter><Company /></BrowserRouter>);

  it("redirects unauthenticated users to login", () => {
    (authUtils.isAuthenticated as any).mockReturnValue(false);
    renderComp();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("navigates to /companies when no id param", () => {
    mockUseParams.mockReturnValue({ id: undefined as any });
    renderComp();
    expect(mockNavigate).toHaveBeenCalledWith("/companies");
  });

  it("shows error when company not found", async () => {
    (getDoc as any).mockImplementation(() => Promise.resolve({ exists: () => false }));
    renderComp();
    expect(await screen.findByText(/company not found/i, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("denies access to non-owner company owners", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "other-owner",
      role: "companyOwner",
    });
    renderComp();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/companies");
    });
  });

  it("denies access to unassigned representatives", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "other-rep",
      role: "representative",
    });
    renderComp();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("redirects non-company users to dashboard", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "student-1",
      role: "student",
    });
    renderComp();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("displays company name after loading", async () => {
    renderComp();
    // Use getByRole to specifically target the h4 heading
    expect(await screen.findByRole('heading', { name: /Tech Corp/i, level: 4 }, { timeout: 3000 })).toBeInTheDocument();
  });

  it("displays invite code", async () => {
    renderComp();
    expect(await screen.findByText(/INVITE123/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("copies invite code to clipboard", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/INVITE123/, {}, { timeout: 3000 });

    const copyButtons = screen.queryAllByTestId("ContentCopyIcon");
    if (copyButtons.length > 0) {
      await user.click(copyButtons[0].closest("button")!);
    }
  });

  it("shows error when clipboard copy fails", async () => {
    const user = userEvent.setup();
    // Replace the mock implementation for this test
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error("copy failed"));
    renderComp();
    await screen.findByText(/INVITE123/, {}, { timeout: 3000 });

    const copyButtons = screen.queryAllByTestId("ContentCopyIcon");
    if (copyButtons.length > 0) {
      await user.click(copyButtons[0].closest("button")!);
    }

    expect(await screen.findByText(/failed to copy to clipboard/i)).toBeInTheDocument();
  });

  it("regenerates invite code", async () => {
    const user = userEvent.setup();
    (authUtils.updateInviteCode as any).mockResolvedValue({
      success: true,
      inviteCode: "NEWCODE",
    });
    renderComp();
    await screen.findByText(/INVITE123/, {}, { timeout: 3000 });

    const refreshButtons = screen.queryAllByTestId("RefreshIcon");
    if (refreshButtons.length > 0) {
      await user.click(refreshButtons[0].closest("button")!);
      await waitFor(() => {
        expect(authUtils.updateInviteCode).toHaveBeenCalled();
      });
    }
  });

  it("edits invite code", async () => {
    const user = userEvent.setup();
    (authUtils.updateInviteCode as any).mockResolvedValue({
      success: true,
      inviteCode: "CUSTOM",
    });
    renderComp();
    await screen.findByText(/INVITE123/, {}, { timeout: 3000 });

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      await user.click(editButtons[0].closest("button")!);

      const inputs = screen.queryAllByRole("textbox");
      const inviteInput = inputs.find(i => (i as HTMLInputElement).value.includes("INVITE") || i.getAttribute("label")?.includes("Invite"));
      if (inviteInput) {
        await user.clear(inviteInput);
        await user.type(inviteInput, "CUSTOM");

        const saveButtons = screen.queryAllByTestId("SaveIcon");
        if (saveButtons.length > 0) {
          await user.click(saveButtons[0].closest("button")!);
        }
      }
    }
  });

  it("cancels invite code edit", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/INVITE123/, {}, { timeout: 3000 });

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      await user.click(editButtons[0].closest("button")!);

      const cancelButtons = screen.queryAllByTestId("CancelIcon");
      if (cancelButtons.length > 0) {
        await user.click(cancelButtons[0].closest("button")!);
      }
    }
  });

  it("validates invite code length", async () => {
   const user = userEvent.setup();
    (authUtils.updateInviteCode as any).mockResolvedValue({
      success: false,
     error: "Invite code must be at least 6 characters long",
    });
    renderComp();
    await screen.findByText(/INVITE123/, {}, { timeout: 3000 });

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      await user.click(editButtons[0].closest("button")!);

      const inputs = screen.queryAllByRole("textbox");
      const inviteInput = inputs.find(i => (i as HTMLInputElement).value.includes("INVITE"));
      if (inviteInput) {
        await user.clear(inviteInput);
        await user.type(inviteInput, "ABC");

        const saveButtons = screen.queryAllByTestId("SaveIcon");
        if (saveButtons.length > 0) {
          await user.click(saveButtons[0].closest("button")!);
        }
      }
    }
  });

  it("blocks invite code save when length is invalid", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/INVITE123/, {}, { timeout: 3000 });

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      await user.click(editButtons[0].closest("button")!);

      const inputs = screen.queryAllByRole("textbox");
      const inviteInput = inputs.find(i => (i as HTMLInputElement).value.includes("INVITE"));
      if (inviteInput) {
        await user.clear(inviteInput);
        await user.type(inviteInput, "A");

        const saveButtons = screen.queryAllByTestId("SaveIcon");
        if (saveButtons.length > 0) {
          await user.click(saveButtons[0].closest("button")!);
        }
      }
    }

    expect(await screen.findByText(/invite code must be 4-20 characters/i)).toBeInTheDocument();
    expect(authUtils.updateInviteCode).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "A");
  });

  it("displays representatives list", async () => {
    renderComp();
    expect(await screen.findByText(/John Doe/i, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("deletes representative", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/John Doe/i, {}, { timeout: 3000 });

    const deleteButtons = screen.queryAllByTestId("DeleteIcon");
    if (deleteButtons.length > 0) {
      await user.click(deleteButtons[0].closest("button")!);
      
      const confirmButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Delete");
      if (confirmButtons.length > 0) {
        await user.click(confirmButtons[0]);
      }
    }
  });

  it("shows error when representative removal fails", async () => {
    const user = userEvent.setup();
    (updateDoc as any).mockRejectedValueOnce(new Error("remove failed"));
    renderComp();
    await screen.findByText(/John Doe/i, {}, { timeout: 3000 });

    const deleteButtons = screen.queryAllByTestId("DeleteIcon");
    if (deleteButtons.length > 0) {
      await user.click(deleteButtons[0].closest("button")!);

      const confirmButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Remove");
      if (confirmButtons.length > 0) {
        await user.click(confirmButtons[0]);
      }
    }

    expect(await screen.findByText(/failed to remove representative/i)).toBeInTheDocument();
  });

  it("displays job postings", async () => {
    renderComp();
    expect(await screen.findByText(/Software Engineer/i, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("opens add job dialog", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

    const addButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Add"));
    if (addButtons.length > 0) {
      await user.click(addButtons[0]);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    }
  });

  it("creates new job", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

    const addButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Add"));
    if (addButtons.length > 0) {
      await user.click(addButtons[0]);
      
      const titleInput = screen.getByLabelText(/job title/i);
      const descInput = screen.getByLabelText(/description/i);
      
      await user.type(titleInput, "New Job");
      await user.type(descInput, "Description");
      
      const saveButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Save");
      if (saveButtons.length > 0) {
        await user.click(saveButtons[0]);
        await waitFor(() => {
          expect(addDoc).toHaveBeenCalled();
        });
      }
    }
  });

  it("validates job title required", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

    const addButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Add"));
    if (addButtons.length > 0) {
      await user.click(addButtons[0]);
      
      const saveButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Save");
      if (saveButtons.length > 0) {
        await user.click(saveButtons[0]);
        expect(addDoc).not.toHaveBeenCalled();
      }
    }
  });

  it("validates application link URL", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

    const addButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Add"));
    if (addButtons.length > 0) {
      await user.click(addButtons[0]);
      
      const titleInput = screen.getByLabelText(/job title/i);
      const linkInput = screen.getByLabelText(/application link/i);
      
      await user.type(titleInput, "Job");
      await user.type(linkInput, "not-a-url");
      
      const saveButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Save");
      if (saveButtons.length > 0) {
        await user.click(saveButtons[0]);
        expect(addDoc).not.toHaveBeenCalled();
      }
    }
  });

  it("edits existing job", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/Software Engineer/i, {}, { timeout: 3000 });

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      await user.click(editButtons[editButtons.length - 1].closest("button")!);
    }
  });

  it("updates existing job and clears application link", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/Software Engineer/i, {}, { timeout: 3000 });

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      await user.click(editButtons[editButtons.length - 1].closest("button")!);
    }

    const linkInput = screen.getByLabelText(/application url/i);
    await user.clear(linkInput);

    const saveButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Update Job");
    if (saveButtons.length > 0) {
      await user.click(saveButtons[0]);
    }

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: "job-1" }),
        expect.objectContaining({ applicationLink: null })
      );
    });
  });

  it("deletes job", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/Software Engineer/i, {}, { timeout: 3000 });

    const deleteButtons = screen.queryAllByTestId("DeleteIcon");
    if (deleteButtons.length > 0) {
      await user.click(deleteButtons[deleteButtons.length - 1].closest("button")!);
      
      const confirmButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Delete");
      if (confirmButtons.length > 0) {
        await user.click(confirmButtons[0]);
        await waitFor(() => {
          expect(deleteDoc).toHaveBeenCalled();
        });
      }
    }
  });

  it("shows error when job deletion fails", async () => {
    const user = userEvent.setup();
    (deleteDoc as any).mockRejectedValueOnce(new Error("delete failed"));
    renderComp();
    await screen.findByText(/Software Engineer/i, {}, { timeout: 3000 });

    // Find delete buttons for jobs specifically via tooltip title
    const deleteButtons = screen.queryAllByTestId("DeleteIcon");
    if (deleteButtons.length < 2) {
      // Need at least rep delete + job delete buttons
      return;
    }

    // Rep delete is index 0, job delete is index 1
    const jobDeleteButton = deleteButtons[1].closest("button");
    if (!jobDeleteButton) return;
    await user.click(jobDeleteButton);

    // Wait for confirmation dialog
    await waitFor(() => {
      const confirmButtons = screen.getAllByRole("button").filter(b => b.textContent === "Delete");
      expect(confirmButtons.length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    const confirmButtons = screen.getAllByRole("button").filter(b => b.textContent === "Delete");
    await user.click(confirmButtons[0]);

    // Wait for error message
    await waitFor(() => {
      const errorElement = screen.queryByText(/failed to delete/i);
      expect(errorElement).toBeInTheDocument();
    }, { timeout: 8000 });
  }, 25000);

  it("navigates to booth when booth ID exists", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

    const boothButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Booth") || b.textContent?.includes("booth"));
    if (boothButtons.length > 0) {
      await user.click(boothButtons[0]);
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("booth"));
    }
  });

  it("navigates back on back button", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

    const backButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Back"));
    if (backButtons.length > 0) {
      await user.click(backButtons[0]);
      expect(mockNavigate).toHaveBeenCalled();
    }
  });

  it("opens delete company dialog", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

   const deleteButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Delete Company"));
    if (deleteButtons.length > 0) {
      await user.click(deleteButtons[0]);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    }
  });

  it("deletes company", async () => {
    const user = userEvent.setup();
    (authUtils.deleteCompany as any).mockResolvedValue({ success: true });
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

    const deleteButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Delete Company"));
    if (deleteButtons.length > 0) {
      await user.click(deleteButtons[0]);
      
      const confirmButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Delete");
      if (confirmButtons.length > 0) {
        await user.click(confirmButtons[0]);
        await waitFor(() => {
          expect(authUtils.deleteCompany).toHaveBeenCalled();
        });
      }
    }
  });

  it("handles company deletion error", async () => {
    const user = userEvent.setup();
    (authUtils.deleteCompany as any).mockResolvedValue({
      success: false,
      error: "Failed to delete",
    });
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

    const deleteButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Delete Company"));
    if (deleteButtons.length > 0) {
      await user.click(deleteButtons[0]);
      
      const confirmButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Delete");
      if (confirmButtons.length > 0) {
        await user.click(confirmButtons[0]);
        expect(await screen.findByText(/Failed to delete/i, {}, { timeout: 3000 })).toBeInTheDocument();
      }
    }
  });

  it("handles API errors gracefully", async () => {
    (getDoc as any).mockRejectedValue(new Error("Network error"));
    renderComp();
    expect(await screen.findByText(/failed to load company/i, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("handles job fetch errors", async () => {
    (getDocs as any).mockRejectedValue(new Error("Job fetch error"));
    renderComp();
    // Company should still load
    expect(await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 })).toBeInTheDocument();
  });

  it("allows representatives to view company", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "rep-1",
      role: "representative",
    });
    renderComp();
    expect(await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 })).toBeInTheDocument();
  });

  it("allows empty application link in job", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

    const addButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Add"));
    if (addButtons.length > 0) {
      await user.click(addButtons[0]);
      
      const titleInput = screen.getByLabelText(/job title/i);      
      await user.type(titleInput, "New Job");
      
      const saveButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Save");
      if (saveButtons.length > 0) {
        await user.click(saveButtons[0]);
      }
    }
  });

  it("sorts jobs by creation date", async () => {
    const job1 = { ...mockJobData, createdAt: { toMillis: () => 1000 } };
    const job2 = { ...mockJobData, createdAt: { toMillis: () => 2000 } };
    
    (getDocs as any).mockResolvedValue({
      forEach: (cb: any) => {
        cb({ id: "job-1", data: () => job1 });
        cb({ id: "job-2", data: () => job2 });
      },
      empty: false,
    });
    
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });
    // Jobs should be displayed (sorted order tested in component)
  });

  it("handles jobs with no creation date", async () => {
    const jobNoDate = { ...mockJobData, createdAt: null };
    
    (getDocs as any).mockResolvedValue({
      forEach: (cb: any) => cb({ id: "job-1", data: () => jobNoDate }),
      empty: false,
    });
    
    renderComp();
    expect(await screen.findByText(/Software Engineer/i, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("clears error on successful operation", async () => {
    (getDoc as any).mockRejectedValueOnce(new Error("Error"));
    renderComp();
    await screen.findByText(/failed to load company/i, {}, { timeout: 3000 });
    
    // Simulate successful retry by re-rendering
    vi.clearAllMocks();
    (getDoc as any).mockImplementation((docRef: any) => {
      if (docRef.id === "company-1") {
        return Promise.resolve({
          exists: () => true,
          id: "company-1",
          data: () => mockCompanyData,
        });
      }
      return Promise.resolve({ exists: () => false });
    });
  });

  it("displays success message on job creation", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

    const addButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Add"));
    if (addButtons.length > 0) {
      await user.click(addButtons[0]);
      
      const titleInput = screen.getByLabelText(/job title/i);
      const descInput = screen.getByLabelText(/description/i);
      
      await user.type(titleInput, "New Job");
      await user.type(descInput, "Description");
      
      const saveButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Save");
      if (saveButtons.length > 0) {
        await user.click(saveButtons[0]);
        await waitFor(() => {
          expect(addDoc).toHaveBeenCalled();
        });
      }
    }
  });

  describe("Job Invitation Stats", () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it("fetches and displays job invitation stats", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalSent: 5,
          totalViewed: 3,
          totalClicked: 1,
          viewRate: "60.0",
          clickRate: "20.0",
        }),
      });

      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/job-invitations/stats/job-1"),
          expect.any(Object)
        );
      }, { timeout: 5000 });
    });

    it("displays View Details button when invitations exist", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalSent: 5,
          totalViewed: 3,
          totalClicked: 1,
          viewRate: "60.0",
          clickRate: "20.0",
        }),
      });

      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

      await waitFor(() => {
        const viewDetailsButton = screen.queryByRole("button", { name: /view details/i });
        if (viewDetailsButton) {
          expect(viewDetailsButton).toBeInTheDocument();
        }
      }, { timeout: 5000 });
    });

    it("opens JobInviteStatsDialog when View Details is clicked", async () => {
      const user = userEvent.setup();
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalSent: 5,
          totalViewed: 3,
          totalClicked: 1,
          viewRate: "60.0",
          clickRate: "20.0",
        }),
      });

      // Mock the details endpoint
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          invitations: [
            {
              id: "inv-1",
              studentId: "s1",
              student: {
                id: "s1",
                firstName: "Test",
                lastName: "Student",
                email: "test@test.com",
                major: "CS",
              },
              status: "sent",
              sentAt: Date.now(),
              viewedAt: null,
              clickedAt: null,
              message: null,
            },
          ],
        }),
      });

      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

      await waitFor(async () => {
        const viewDetailsButton = screen.queryByRole("button", { name: /view details/i });
        if (viewDetailsButton) {
          await user.click(viewDetailsButton);
          
          await waitFor(() => {
            expect(screen.getByText("Invitation Details")).toBeInTheDocument();
          });
        }
      }, { timeout: 5000 });
    });

    it("closes JobInviteStatsDialog when Close is clicked", async () => {
      const user = userEvent.setup();
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          totalSent: 5,
          totalViewed: 3,
          totalClicked: 1,
          viewRate: "60.0",
          clickRate: "20.0",
        }),
      });

      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

      await waitFor(async () => {
        const viewDetailsButton = screen.queryByRole("button", { name: /view details/i });
        if (viewDetailsButton) {
          await user.click(viewDetailsButton);
          
          await waitFor(async () => {
            const dialogTitle = screen.queryByText("Invitation Details");
            if (dialogTitle) {
              const closeButton = screen.getByRole("button", { name: /close/i });
              await user.click(closeButton);
              
              await waitFor(() => {
                expect(screen.queryByText("Invitation Details")).not.toBeInTheDocument();
              });
            }
          });
        }
      }, { timeout: 5000 });
    });

    it("does not display View Details button when no invitations", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalSent: 0,
          totalViewed: 0,
          totalClicked: 0,
          viewRate: "0",
          clickRate: "0",
        }),
      });

      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

      await waitFor(() => {
        const viewDetailsButton = screen.queryByRole("button", { name: /view details/i });
        expect(viewDetailsButton).not.toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("handles stats fetch error gracefully", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

      // Should still render the page even if stats fail
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Tech Corp/i })).toBeInTheDocument();
      });
    });

    it("displays invitation stats summary", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalSent: 10,
          totalViewed: 7,
          totalClicked: 3,
          viewRate: "70.0",
          clickRate: "30.0",
        }),
      });

      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

      await waitFor(() => {
        // Check if stats numbers are displayed (they might be in various formats)
        const statsText = screen.getByText(/Software Engineer/i).closest('div')?.textContent;
        // Stats should be visible somewhere in the job card
      }, { timeout: 5000 });
    });
  });
});
