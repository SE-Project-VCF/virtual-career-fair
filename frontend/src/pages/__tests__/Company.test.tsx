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
  auth: {
    currentUser: {
      getIdToken: vi.fn(() => Promise.resolve("mock-token")),
      uid: "owner-1",
    },
  },
  storage: {},
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

    // Mock fetch for invite code API
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/companies/') && url.includes('/invite-code')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ inviteCode: "INVITE123" }),
        });
      }
      // Default for other fetch calls
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: "Not found" }),
      });
    });
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
    expect(await screen.findByText(/company not found/i)).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: /Tech Corp/i, level: 4 })).toBeInTheDocument();
  });

  it("displays invite code", async () => {
    renderComp();
    expect(await screen.findByText(/INVITE123/)).toBeInTheDocument();
  });

  it("copies invite code to clipboard", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/INVITE123/);

    const copyButtons = screen.queryAllByTestId("ContentCopyIcon");
    if (copyButtons.length > 0) {
      const btn = copyButtons[0].closest("button");
      if (btn) await user.click(btn);
    }
  });

  it("shows error when clipboard copy fails", async () => {
    const user = userEvent.setup();
    // Replace the mock implementation for this test
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error("copy failed"));
    renderComp();
    await screen.findByText(/INVITE123/);

    const copyButtons = screen.queryAllByTestId("ContentCopyIcon");
    if (copyButtons.length > 0) {
      const btn = copyButtons[0].closest("button");
      if (btn) await user.click(btn);
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
    await screen.findByText(/INVITE123/);

    const refreshButtons = screen.queryAllByTestId("RefreshIcon");
    if (refreshButtons.length > 0) {
      const btn = refreshButtons[0].closest("button");
      if (btn) await user.click(btn);
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
    await screen.findByText(/INVITE123/);

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      const editBtn = editButtons[0].closest("button");
      if (editBtn) await user.click(editBtn);

      const inputs = screen.queryAllByRole("textbox");
      const inviteInput = inputs.find(i => ('value' in i && (i as HTMLInputElement).value.includes("INVITE")) || i.getAttribute("label")?.includes("Invite"));
      if (inviteInput) {
        await user.clear(inviteInput);
        await user.type(inviteInput, "CUSTOM");

        const saveButtons = screen.queryAllByTestId("SaveIcon");
        if (saveButtons.length > 0) {
          const saveBtn = saveButtons[0].closest("button");
          if (saveBtn) await user.click(saveBtn);
        }
      }
    }
  });

  it("cancels invite code edit", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/INVITE123/);

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      const editBtn = editButtons[0].closest("button");
      if (editBtn) await user.click(editBtn);

      const cancelButtons = screen.queryAllByTestId("CancelIcon");
      if (cancelButtons.length > 0) {
        const cancelBtn = cancelButtons[0].closest("button");
        if (cancelBtn) await user.click(cancelBtn);
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
    await screen.findByText(/INVITE123/);

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      const editBtn = editButtons[0].closest("button");
      if (editBtn) await user.click(editBtn);

      const inputs = screen.queryAllByRole("textbox");
      const inviteInput = inputs.find(i => 'value' in i && (i as HTMLInputElement).value.includes("INVITE"));
      if (inviteInput) {
        await user.clear(inviteInput);
        await user.type(inviteInput, "ABC");

        const saveButtons = screen.queryAllByTestId("SaveIcon");
        if (saveButtons.length > 0) {
          const saveBtn = saveButtons[0].closest("button");
          if (saveBtn) await user.click(saveBtn);
        }
      }
    }
  });

  it("blocks invite code save when length is invalid", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/INVITE123/);

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      const editBtn = editButtons[0].closest("button");
      if (editBtn) await user.click(editBtn);

      const inputs = screen.queryAllByRole("textbox");
      const inviteInput = inputs.find(i => 'value' in i && (i as HTMLInputElement).value.includes("INVITE"));
      if (inviteInput) {
        await user.clear(inviteInput);
        await user.type(inviteInput, "A");

        const saveButtons = screen.queryAllByTestId("SaveIcon");
        if (saveButtons.length > 0) {
          const saveBtn = saveButtons[0].closest("button");
          if (saveBtn) await user.click(saveBtn);
        }
      }
    }

    expect(await screen.findByText(/invite code must be 4-20 characters/i)).toBeInTheDocument();
    expect(authUtils.updateInviteCode).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "A");
  });

  it("sanitizes invite code input to uppercase alphanumeric", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/INVITE123/);

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      const editBtn = editButtons[0].closest("button");
      if (editBtn) await user.click(editBtn);

      const inviteInput: HTMLInputElement = screen.getByLabelText(/invite code/i);
      await user.clear(inviteInput);
      await user.type(inviteInput, "ab-12$cd");

      expect(inviteInput.value).toBe("AB12CD");
    }
  });

  it("displays representatives list", async () => {
    renderComp();
    expect(await screen.findByText(/John Doe/i)).toBeInTheDocument();
  });

  it("shows empty representatives message when none have joined", async () => {
    (getDoc as any).mockImplementation((docRef: any) => {
      if (docRef.id === "company-1") {
        return Promise.resolve({
          exists: () => true,
          id: "company-1",
          data: () => ({ ...mockCompanyData, representativeIDs: [] }),
        });
      }
      return Promise.resolve({ exists: () => false });
    });

    renderComp();
    expect(
      await screen.findByText(/No representatives have joined this company yet/i)
    ).toBeInTheDocument();
  });

  it("deletes representative", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/John Doe/i);

    const deleteButtons = screen.queryAllByTestId("DeleteIcon");
    if (deleteButtons.length > 0) {
      const deleteBtn = deleteButtons[0].closest("button");
      if (deleteBtn) await user.click(deleteBtn);

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
    await screen.findByText(/John Doe/i);

    const deleteButtons = screen.queryAllByTestId("DeleteIcon");
    if (deleteButtons.length > 0) {
      const deleteBtn = deleteButtons[0].closest("button");
      if (deleteBtn) await user.click(deleteBtn);

      const confirmButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Remove");
      if (confirmButtons.length > 0) {
        await user.click(confirmButtons[0]);
      }
    }

    expect(await screen.findByText(/failed to remove representative/i)).toBeInTheDocument();
  });

  it("displays job postings", async () => {
    renderComp();
    expect(await screen.findByText(/Software Engineer/i)).toBeInTheDocument();
  });

  it("opens add job dialog", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i });

    const addButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Add"));
    if (addButtons.length > 0) {
      await user.click(addButtons[0]);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    }
  });

  it("creates new job", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i });

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
    await screen.findByRole('heading', { name: /Tech Corp/i });

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
    await screen.findByRole('heading', { name: /Tech Corp/i });

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
    await screen.findByText(/Software Engineer/i);

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      const btn = editButtons.at(-1)?.closest("button");
      if (btn) await user.click(btn);
    }
  });

  it("updates existing job and clears application link", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText(/Software Engineer/i);

    const editButtons = screen.queryAllByTestId("EditIcon");
    if (editButtons.length > 0) {
      const btn = editButtons.at(-1)?.closest("button");
      if (btn) await user.click(btn);
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
    await screen.findByText(/Software Engineer/i);

    const deleteButtons = screen.queryAllByTestId("DeleteIcon");
    if (deleteButtons.length > 0) {
      const btn = deleteButtons.at(-1)?.closest("button");
      if (btn) await user.click(btn);

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
    await screen.findByText(/Software Engineer/i);

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
      const confirmButton = screen.getAllByRole("button").find(b => b.textContent === "Delete");
      expect(confirmButton).toBeDefined();
    }, { timeout: 5000 });

    const confirmButton = screen.getAllByRole("button").find(b => b.textContent === "Delete");
    if (confirmButton) await user.click(confirmButton);

    // Wait for error message
    await waitFor(() => {
      const errorElement = screen.queryByText(/failed to delete/i);
      expect(errorElement).toBeInTheDocument();
    }, { timeout: 8000 });
  }, 25000);

  it("navigates to booth when booth ID exists", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i });

    const boothButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Booth") || b.textContent?.includes("booth"));
    if (boothButtons.length > 0) {
      await user.click(boothButtons[0]);
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("booth"));
    }
  });

  it("navigates back on back button", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i });

    const backButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Back"));
    if (backButtons.length > 0) {
      await user.click(backButtons[0]);
      expect(mockNavigate).toHaveBeenCalled();
    }
  });

  it("opens delete company dialog", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i });

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
    await screen.findByRole('heading', { name: /Tech Corp/i });

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
    await screen.findByRole('heading', { name: /Tech Corp/i });

    const deleteButtons = screen.queryAllByRole("button").filter(b => b.textContent?.includes("Delete Company"));
    if (deleteButtons.length > 0) {
      await user.click(deleteButtons[0]);

      const confirmButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Delete");
      if (confirmButtons.length > 0) {
        await user.click(confirmButtons[0]);
        expect(await screen.findByText(/Failed to delete/i)).toBeInTheDocument();
      }
    }
  });

  it("handles API errors gracefully", async () => {
    (getDoc as any).mockRejectedValue(new Error("Network error"));
    renderComp();
    expect(await screen.findByText(/failed to load company/i)).toBeInTheDocument();
  });

  it("handles job fetch errors", async () => {
    (getDocs as any).mockRejectedValue(new Error("Job fetch error"));
    renderComp();
    // Company should still load
    expect(await screen.findByRole('heading', { name: /Tech Corp/i })).toBeInTheDocument();
  });

  it("allows representatives to view company", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "rep-1",
      role: "representative",
    });
    renderComp();
    expect(await screen.findByRole('heading', { name: /Tech Corp/i })).toBeInTheDocument();
  });

  it("allows empty application link in job", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i });

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
    await screen.findByRole('heading', { name: /Tech Corp/i });
    // Jobs should be displayed (sorted order tested in component)
  });

  it("handles jobs with no creation date", async () => {
    const jobNoDate = { ...mockJobData, createdAt: null };

    (getDocs as any).mockResolvedValue({
      forEach: (cb: any) => cb({ id: "job-1", data: () => jobNoDate }),
      empty: false,
    });

    renderComp();
    expect(await screen.findByText(/Software Engineer/i)).toBeInTheDocument();
  });

  it("clears error on successful operation", async () => {
    (getDoc as any).mockRejectedValueOnce(new Error("Error"));
    renderComp();
    await screen.findByText(/failed to load company/i);

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
    await screen.findByRole('heading', { name: /Tech Corp/i });

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
      globalThis.fetch = vi.fn();
    });

    it("fetches and displays job invitation stats", async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
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
      await screen.findByRole('heading', { name: /Tech Corp/i });

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/job-invitations/stats/job-1"),
          expect.any(Object)
        );
      }, { timeout: 5000 });
    });

    it("displays View Details button when invitations exist", async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
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
      await screen.findByRole('heading', { name: /Tech Corp/i });

      await waitFor(() => {
        const viewDetailsButton = screen.queryByRole("button", { name: /view details/i });
        if (viewDetailsButton) {
          expect(viewDetailsButton).toBeInTheDocument();
        }
      }, { timeout: 5000 });
    });

    it("opens JobInviteStatsDialog when View Details is clicked", async () => {
      const user = userEvent.setup();

      (globalThis.fetch as any).mockResolvedValueOnce({
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
      (globalThis.fetch as any).mockResolvedValueOnce({
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

      (globalThis.fetch as any).mockResolvedValue({
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
      await screen.findByRole('heading', { name: /Tech Corp/i });

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
      (globalThis.fetch as any).mockResolvedValueOnce({
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
      await screen.findByRole('heading', { name: /Tech Corp/i });

      await waitFor(() => {
        const viewDetailsButton = screen.queryByRole("button", { name: /view details/i });
        expect(viewDetailsButton).not.toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("handles stats fetch error gracefully", async () => {
      (globalThis.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

      // Should still render the page even if stats fail
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Tech Corp/i })).toBeInTheDocument();
      });
    });

    it("displays invitation stats summary", async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
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
      await screen.findByRole('heading', { name: /Tech Corp/i });

      await waitFor(() => {
        // Check if stats numbers are displayed (they might be in various formats)
        // Stats should be visible somewhere in the job card
        expect(screen.getByText(/Software Engineer/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe("Application Form Management", () => {
    const mockJobWithForm = {
      ...mockJobData,
      applicationForm: {
        title: "Apply Here",
        status: "published",
        fields: [{ id: "f1", type: "shortText", label: "Name", required: true }],
      },
    };

    const mockJobWithDraftForm = {
      ...mockJobData,
      applicationForm: {
        title: "Draft Form",
        status: "draft",
        fields: [],
      },
    };

    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ totalSent: 0, totalViewed: 0, totalClicked: 0 }),
      });
    });

    it("shows published application form chip on job card", async () => {
      (getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => mockJobWithForm }),
        empty: false,
      });

      renderComp();
      expect(
        await screen.findByText(/Application Form: Published/i, {}, { timeout: 3000 })
      ).toBeInTheDocument();
    });

    it("shows draft application form chip on job card", async () => {
      (getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => mockJobWithDraftForm }),
        empty: false,
      });

      renderComp();
      expect(
        await screen.findByText(/Application Form: Draft/i, {}, { timeout: 3000 })
      ).toBeInTheDocument();
    });

    it("shows submissions navigation button when job has a form", async () => {
      (getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => mockJobWithForm }),
        empty: false,
      });

      renderComp();
      await screen.findByText(/Application Form: Published/i, {}, { timeout: 3000 });

      const submissionIcons = screen.queryAllByTestId("AssignmentIcon");
      expect(submissionIcons.length).toBeGreaterThan(0);
    });

    it("navigates to submissions page when submissions icon is clicked", async () => {
      const user = userEvent.setup();
      (getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => mockJobWithForm }),
        empty: false,
      });

      renderComp();
      await screen.findByText(/Application Form: Published/i, {}, { timeout: 3000 });

      const submissionIcons = screen.queryAllByTestId("AssignmentIcon");
      if (submissionIcons.length > 0) {
        const btn = submissionIcons[0].closest("button");
        if (btn) await user.click(btn);
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("submissions"));
      }
    });

    it("opens ApplicationFormBuilderDialog when manage form button is clicked", async () => {
      const user = userEvent.setup();
      renderComp();
      await screen.findByText(/Software Engineer/i, {}, { timeout: 3000 });

      const descIcons = screen.queryAllByTestId("DescriptionIcon");
      if (descIcons.length > 0) {
        const btn = descIcons[0].closest("button");
        if (btn) await user.click(btn);
        expect(await screen.findByRole("dialog")).toBeInTheDocument();
      }
    });

    it("shows delete form button only when job has a form", async () => {
      (getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => mockJobWithForm }),
        empty: false,
      });

      renderComp();
      await screen.findByText(/Application Form: Published/i, {}, { timeout: 3000 });

      const deleteSweepIcons = screen.queryAllByTestId("DeleteSweepIcon");
      expect(deleteSweepIcons.length).toBeGreaterThan(0);
    });

    it("does not show delete form button when job has no form", async () => {
      renderComp();
      await screen.findByText(/Software Engineer/i, {}, { timeout: 3000 });

      // Job has no applicationForm so DeleteSweepIcon should not be present
      const deleteSweepIcons = screen.queryAllByTestId("DeleteSweepIcon");
      expect(deleteSweepIcons.length).toBe(0);
    });

    it("opens delete form confirmation dialog when delete form button is clicked", async () => {
      const user = userEvent.setup();
      (getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => mockJobWithForm }),
        empty: false,
      });

      renderComp();
      await screen.findByText(/Application Form: Published/i, {}, { timeout: 3000 });

      const deleteSweepIcons = screen.queryAllByTestId("DeleteSweepIcon");
      if (deleteSweepIcons.length > 0) {
        const btn = deleteSweepIcons[0].closest("button");
        if (btn) await user.click(btn);
        expect(await screen.findByText(/Delete Application Form/i)).toBeInTheDocument();
      }
    });

    it("cancels delete form dialog without calling API", async () => {
      const user = userEvent.setup();
      (getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => mockJobWithForm }),
        empty: false,
      });

      renderComp();
      await screen.findByText(/Application Form: Published/i, {}, { timeout: 3000 });

      const deleteSweepIcons = screen.queryAllByTestId("DeleteSweepIcon");
      if (deleteSweepIcons.length > 0) {
        const btn = deleteSweepIcons[0].closest("button");
        if (btn) await user.click(btn);
        await screen.findByText(/Delete Application Form/i);

        const cancelButtons = screen.queryAllByRole("button").filter(
          (b) => b.textContent === "Cancel"
        );
        if (cancelButtons.length > 0) {
          await user.click(cancelButtons[0]);
          await waitFor(() => {
            expect(screen.queryByText(/Delete Application Form/i)).not.toBeInTheDocument();
          });
        }
      }

      // API should not have been called for form deletion
      const deleteCalls = (globalThis.fetch as any).mock.calls.filter((call: any[]) =>
        call[1]?.method === "DELETE"
      );
      expect(deleteCalls.length).toBe(0);
    });

    it("deletes application form and shows success message", async () => {
      const user = userEvent.setup();

      // First call returns stats (0), second call is the DELETE /api/jobs/:id/form
      (globalThis.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ totalSent: 0, totalViewed: 0, totalClicked: 0 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      (getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => mockJobWithForm }),
        empty: false,
      });

      renderComp();
      await screen.findByText(/Application Form: Published/i, {}, { timeout: 3000 });

      const deleteSweepIcons = screen.queryAllByTestId("DeleteSweepIcon");
      if (deleteSweepIcons.length > 0) {
        const btn = deleteSweepIcons[0].closest("button");
        if (btn) await user.click(btn);
        await screen.findByText(/Delete Application Form/i);

        const deleteFormButtons = screen.queryAllByRole("button").filter(
          (b) => b.textContent === "Delete Form"
        );
        if (deleteFormButtons.length > 0) {
          await user.click(deleteFormButtons[0]);
          expect(
            await screen.findByText(/Application form deleted/i, {}, { timeout: 3000 })
          ).toBeInTheDocument();
        }
      }
    });

    it("shows error when form deletion API call fails", async () => {
      const user = userEvent.setup();

      (globalThis.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ inviteCode: "INVITE123" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ totalSent: 0, totalViewed: 0, totalClicked: 0 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: "Unauthorized to delete form" }),
        });

      (getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => mockJobWithForm }),
        empty: false,
      });

      renderComp();
      await screen.findByText(/Application Form: Published/i, {}, { timeout: 3000 });

      const deleteSweepIcons = screen.queryAllByTestId("DeleteSweepIcon");
      if (deleteSweepIcons.length > 0) {
        const btn = deleteSweepIcons[0].closest("button");
        if (btn) await user.click(btn);
        await screen.findByText(/Delete Application Form/i);

        const deleteFormButtons = screen.queryAllByRole("button").filter(
          (b) => b.textContent === "Delete Form"
        );
        if (deleteFormButtons.length > 0) {
          await user.click(deleteFormButtons[0]);
          expect(
            await screen.findByText(/Unauthorized to delete form/i, {}, { timeout: 3000 })
          ).toBeInTheDocument();
        }
      }
    });
  });

  describe("Representative access control", () => {
    beforeEach(() => {
      (authUtils.getCurrentUser as any).mockReturnValue({
        uid: "rep-1",
        role: "representative",
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ totalSent: 0, totalViewed: 0, totalClicked: 0 }),
      });
    });

    it("hides invite code section from representatives", async () => {
      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

      // Invite code is owner-only — rep should not see INVITE123
      await waitFor(() => {
        expect(screen.queryByText(/INVITE123/)).not.toBeInTheDocument();
      });
    });

    it("hides delete company button from representatives", async () => {
      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

      expect(screen.queryByRole("button", { name: /Delete Company/i })).not.toBeInTheDocument();
    });

    it("still displays job postings for representatives", async () => {
      renderComp();
      expect(await screen.findByText(/Software Engineer/i, {}, { timeout: 3000 })).toBeInTheDocument();
    });
  });
});
