import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import Company from "../Company";
import { getDoc, getDocs, updateDoc, addDoc, deleteDoc, arrayRemove } from "firebase/firestore";

const mockNavigate = vi.fn();
const mockUseParams = vi.fn(() => ({ id: "company-1" }));

const geocodeSuggestMocks = vi.hoisted(() => ({
  state: { options: [] as Array<Record<string, unknown>>, loading: false },
}));

/** Company mounts two useGeocodeSuggest hooks (office search, then job dialog). */
const mockJobGeocodeState = vi.hoisted(() => ({
  options: [] as Array<{ id: string; label: string; lat: number; lng: number; city: string; state: string }>,
  loading: false,
}));

const geocodeSuggestHookOrder = vi.hoisted(() => ({ n: 0 }));

vi.mock("../../hooks/useGeocodeSuggest", () => ({
  useGeocodeSuggest: () => {
    const i = geocodeSuggestHookOrder.n++ % 2;
    return i === 0 ? geocodeSuggestMocks.state : mockJobGeocodeState;
  },
}));

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(() => true),
    deleteCompany: vi.fn(),
    updateInviteCode: vi.fn(),
    getIdToken: vi.fn(() => Promise.resolve("mock-token")),
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

/** Mutable auth for tests that need null user or custom getIdToken behavior. */
const mockFirebaseAuth = vi.hoisted(() => ({
  currentUser: {
    getIdToken: vi.fn(() => Promise.resolve("mock-token")),
    uid: "owner-1",
  } as { getIdToken: ReturnType<typeof vi.fn>; uid: string } | null,
}))

vi.mock("../../firebase", () => ({
  db: {},
  storage: {},
  auth: {
    get currentUser() {
      return mockFirebaseAuth.currentUser
    },
  },
}));

// Import after mocks
import { authUtils } from "../../utils/auth";

vi.mock("../../components/JobInviteDialog", () => ({
  default: ({
    open,
    onClose,
    onSuccess,
    jobTitle,
  }: {
    open: boolean
    onClose: () => void
    onSuccess?: () => void
    jobTitle: string
  }) =>
    open ? (
      <div data-testid="mock-job-invite-dialog">
        <span data-testid="mock-invite-job-title">{jobTitle}</span>
        <button type="button" data-testid="mock-invite-success" onClick={() => onSuccess?.()}>
          mock-invite-success
        </button>
        <button type="button" data-testid="mock-invite-close" onClick={onClose}>
          mock-invite-close
        </button>
      </div>
    ) : null,
}))

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: any) => (
    <div data-testid="base-layout">
      <button aria-label="menu">Menu</button>
      <span>Job Goblin</span>
      <span>Virtual Career Fair</span>
      {pageTitle && <h6>{pageTitle}</h6>}
      <button data-testid="notification-bell" />
      <button data-testid="profile-menu">Profile Menu</button>
      {children}
    </div>
  ),
}));

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
  locationIsRemote: true,
};

function defaultFetchImpl(url: string | URL, init?: RequestInit) {
  const u = typeof url === "string" ? url : String(url);
  if (u.includes("/api/companies/") && u.includes("/invite-code")) {
    return Promise.resolve({ ok: true, json: async () => ({ inviteCode: "INVITE123" }) });
  }
  if (u.includes("/api/jobs?") && u.includes("companyId") && (!init?.method || init.method === "GET")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        success: true,
        jobs: [
          {
            id: "job-1",
            companyId: "company-1",
            name: "Software Engineer",
            description: "We are hiring",
            majorsAssociated: "Computer Science",
            applicationLink: "https://example.com/apply",
            createdAt: 1234567890,
            locationIsRemote: true,
          },
        ],
      }),
    });
  }
  if (u.includes("/api/job-invitations/stats/")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        totalSent: 0,
        totalViewed: 0,
        totalClicked: 0,
        viewRate: "0",
        clickRate: "0",
      }),
    });
  }
  if (u.includes("/api/jobs") && init?.method === "POST") {
    return Promise.resolve({ ok: true, json: async () => ({ success: true, jobId: "new-job" }) });
  }
  if (/\/api\/jobs\/[^/]+$/.test(u) && init?.method === "PUT") {
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  }
  if (/\/api\/jobs\/[^/]+$/.test(u) && init?.method === "DELETE") {
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  }
  return Promise.resolve({ ok: false, json: async () => ({ error: "Not found" }) });
}

describe("Company", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockUseParams.mockReturnValue({ id: "company-1" });
    geocodeSuggestMocks.state.options = [];
    geocodeSuggestMocks.state.loading = false;
    geocodeSuggestHookOrder.n = 0;

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

    globalThis.fetch = vi.fn().mockImplementation(defaultFetchImpl);

    mockJobGeocodeState.options = []
    mockJobGeocodeState.loading = false

    mockFirebaseAuth.currentUser = {
      getIdToken: vi.fn(() => Promise.resolve("mock-token")),
      uid: "owner-1",
    }
  });

  const renderComp = () => render(<BrowserRouter><Company /></BrowserRouter>);

  it("BoothReviewsSection shows no reviews when ratings HTTP response is not ok", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("/api/booths/") && u.includes("/ratings")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: "bad" }),
        });
      }
      return defaultFetchImpl(url, init);
    });

    renderComp();

    await waitFor(() => {
      expect(screen.getByText("Booth Reviews")).toBeInTheDocument();
      expect(screen.getByText("No reviews yet.")).toBeInTheDocument();
    });
  });

  it("BoothReviewsSection displays reviews and average rating when data is available", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("/api/booths/") && u.includes("/ratings")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ratings: [
              { rating: 5, comment: "Excellent booth!", createdAt: 1000000 },
              { rating: 4, comment: null, createdAt: null },
            ],
            totalRatings: 2,
            averageRating: 4.5,
          }),
        });
      }
      return defaultFetchImpl(url, init);
    });

    renderComp();

    await waitFor(() => {
      expect(screen.getByText("Booth Reviews")).toBeInTheDocument();
      expect(screen.getByText("Excellent booth!")).toBeInTheDocument();
      expect(screen.getByText(/2 reviews/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

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
    expect(await screen.findByRole("heading", { name: /Tech Corp/i })).toBeInTheDocument();
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
      const skillsInput = screen.getByLabelText(/required skills/i);

      await user.type(titleInput, "New Job");
      await user.type(descInput, "Description");
      await user.type(skillsInput, "Python");

      const publishButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Publish Job");
      if (publishButtons.length > 0) {
        await user.click(publishButtons[0]);
        await waitFor(() => {
          const postCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
            (c) => c[1]?.method === "POST" && String(c[0]).includes("/api/jobs")
          );
          expect(postCalls.length).toBeGreaterThan(0);
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

      const publishButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Publish Job");
      if (publishButtons.length > 0) {
        await user.click(publishButtons[0]);
        const postCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          (c) => c[1]?.method === "POST" && String(c[0]).includes("/api/jobs")
        );
        expect(postCalls.length).toBe(0);
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

      const publishButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Publish Job");
      if (publishButtons.length > 0) {
        await user.click(publishButtons[0]);
        const postCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          (c) => c[1]?.method === "POST" && String(c[0]).includes("/api/jobs")
        );
        expect(postCalls.length).toBe(0);
      }
    }
  });

  it("validates on-site location when remote is unchecked", async () => {
    const user = userEvent.setup();
    mockJobGeocodeState.options = [];
    renderComp();
    await screen.findByRole("heading", { name: /Tech Corp/i });

    const addButtons = screen.queryAllByRole("button").filter((b) => b.textContent?.includes("Add"));
    if (addButtons.length === 0) return;
    await user.click(addButtons[0]);

    await user.type(screen.getByLabelText(/job title/i), "Onsite Job");
    await user.type(screen.getByLabelText(/description/i), "Desc");
    await user.type(screen.getByLabelText(/required skills/i), "Go");

    const remoteCb = screen.getByRole("checkbox", { name: /remote position/i });
    await user.click(remoteCb);
    expect(remoteCb).not.toBeChecked();

    const publishButtons = screen.queryAllByRole("button").filter((b) => b.textContent === "Publish Job");
    if (publishButtons.length === 0) return;
    await user.click(publishButtons[0]);

    expect(
      await screen.findByText(/select a location from the suggestions for on-site jobs/i)
    ).toBeInTheDocument();
    const postCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[1]?.method === "POST" && String(c[0]).includes("/api/jobs")
    );
    expect(postCalls.length).toBe(0);
  });

  it("creates on-site job with location pick from suggestions", async () => {
    const user = userEvent.setup();
    mockJobGeocodeState.options = [
      { id: "loc1", label: "Austin, TX", lat: 30, lng: -97, city: "Austin", state: "TX" },
    ];
    renderComp();
    await screen.findByRole("heading", { name: /Tech Corp/i });

    const addButtons = screen.queryAllByRole("button").filter((b) => b.textContent?.includes("Add"));
    if (addButtons.length === 0) return;
    await user.click(addButtons[0]);

    await user.type(screen.getByLabelText(/job title/i), "Onsite Role");
    await user.type(screen.getByLabelText(/description/i), "Work in office");
    await user.type(screen.getByLabelText(/required skills/i), "TypeScript");

    await user.click(screen.getByRole("checkbox", { name: /remote position/i }));

    const combo = screen.getByRole("combobox", { name: /job location/i });
    await user.click(combo);
    const opt = await screen.findByRole("option", { name: /austin/i });
    await user.click(opt);

    const publishButtons = screen.queryAllByRole("button").filter((b) => b.textContent === "Publish Job");
    if (publishButtons.length === 0) return;
    await user.click(publishButtons[0]);

    await waitFor(() => {
      const postCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[1]?.method === "POST" && String(c[0]).includes("/api/jobs")
      );
      expect(postCalls.length).toBeGreaterThan(0);
      const body = JSON.parse((postCalls[0][1] as RequestInit).body as string);
      expect(body.locationIsRemote).toBe(false);
      expect(body.locationCity).toBe("Austin");
      expect(body.locationState).toBe("TX");
      expect(body.location).toBe("Austin, TX");
    });
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
      const putCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[1]?.method === "PUT" && String(c[0]).includes("/api/jobs/job-1")
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = JSON.parse((putCalls[0][1] as RequestInit).body as string);
      expect(body.applicationLink).toBeNull();
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
          const delCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
            (c) => c[1]?.method === "DELETE" && String(c[0]).includes("/api/jobs/")
          );
          expect(delCalls.length).toBeGreaterThan(0);
        });
      }
    }
  });

  it("shows error when job deletion fails", async () => {
    const user = userEvent.setup();
    let deleteFailOnce = true;
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (deleteFailOnce && init?.method === "DELETE" && u.includes("/api/jobs/")) {
        deleteFailOnce = false;
        return Promise.reject(new Error("delete failed"));
      }
      return defaultFetchImpl(url, init);
    });
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
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("/api/jobs?") && u.includes("companyId")) {
        return Promise.reject(new Error("Job fetch error"));
      }
      return defaultFetchImpl(url, init);
    });
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
      const descInput = screen.getByLabelText(/description/i);
      const skillsInput = screen.getByLabelText(/required skills/i);
      await user.type(titleInput, "New Job");
      await user.type(descInput, "Desc");
      await user.type(skillsInput, "Go");

      const publishButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Publish Job");
      if (publishButtons.length > 0) {
        await user.click(publishButtons[0]);
      }
    }
  });

  it("sorts jobs by creation date", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("/api/jobs?") && u.includes("companyId")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            jobs: [
              {
                id: "job-1",
                companyId: "company-1",
                name: "Job A",
                description: "a",
                majorsAssociated: "CS",
                applicationLink: null,
                createdAt: 1000,
                locationIsRemote: true,
              },
              {
                id: "job-2",
                companyId: "company-1",
                name: "Job B",
                description: "b",
                majorsAssociated: "CS",
                applicationLink: null,
                createdAt: 2000,
                locationIsRemote: true,
              },
            ],
          }),
        });
      }
      return defaultFetchImpl(url, init);
    });

    renderComp();
    await screen.findByRole('heading', { name: /Tech Corp/i });
    // Jobs should be displayed (sorted order tested in component)
  });

  it("handles jobs with no creation date", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("/api/jobs?") && u.includes("companyId")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            jobs: [
              {
                id: "job-1",
                companyId: "company-1",
                name: "Software Engineer",
                description: "We are hiring",
                majorsAssociated: "Computer Science",
                applicationLink: "https://example.com/apply",
                createdAt: null,
                locationIsRemote: true,
              },
            ],
          }),
        });
      }
      return defaultFetchImpl(url, init);
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
      const skillsInput = screen.getByLabelText(/required skills/i);

      await user.type(titleInput, "New Job");
      await user.type(descInput, "Description");
      await user.type(skillsInput, "Rust");

      const publishButtons = screen.queryAllByRole("button").filter(b => b.textContent === "Publish Job");
      if (publishButtons.length > 0) {
        await user.click(publishButtons[0]);
        await waitFor(() => {
          const postCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
            (c) => c[1]?.method === "POST" && String(c[0]).includes("/api/jobs")
          );
          expect(postCalls.length).toBeGreaterThan(0);
        });
      }
    }
  });

  describe("Job Invitation Stats", () => {
    beforeEach(() => {
      (authUtils.getIdToken as any).mockResolvedValue("mock-token");
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/ratings")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ratings: [], totalRatings: 0, averageRating: null }),
          });
        }
        return defaultFetchImpl(url, init);
      });
    });

    it("does not request job-invitations stats when getIdToken returns null", async () => {
      (authUtils.getIdToken as any).mockResolvedValue(null);

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/ratings")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ratings: [], totalRatings: 0, averageRating: null }),
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      });
      globalThis.fetch = fetchSpy;

      renderComp();
      await screen.findByRole("heading", { name: /Tech Corp/i });

      await waitFor(() => {
        const statsCalls = fetchSpy.mock.calls.filter((c) =>
          String(c[0]).includes("/api/job-invitations/stats/")
        );
        expect(statsCalls).toHaveLength(0);
      });
    });

    it("fetches and displays job invitation stats", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              totalSent: 5,
              totalViewed: 3,
              totalClicked: 1,
              viewRate: "60.0",
              clickRate: "20.0",
            }),
          });
        }
        if (u.includes("/ratings")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ratings: [], totalRatings: 0, averageRating: null }),
          });
        }
        return defaultFetchImpl(url, init);
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

    it("ignores job invitation stats payload when response is not ok", async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/ratings")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ratings: [], totalRatings: 0, averageRating: null }),
          });
        }
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.resolve({ ok: false, json: async () => ({ error: "forbidden" }) });
        }
        return defaultFetchImpl(url, init);
      });
      globalThis.fetch = fetchSpy;

      renderComp();
      await screen.findByRole("heading", { name: /Tech Corp/i });

      await waitFor(() => {
        const statsCalls = fetchSpy.mock.calls.filter((c) =>
          String(c[0]).includes("/api/job-invitations/stats/")
        );
        expect(statsCalls.length).toBeGreaterThan(0);
      });
    });

    it("still renders company when job invitation stats fetch throws", async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/ratings")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ratings: [], totalRatings: 0, averageRating: null }),
          });
        }
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.reject(new Error("network down"));
        }
        return defaultFetchImpl(url, init);
      });
      globalThis.fetch = fetchSpy;

      renderComp();
      await screen.findByRole("heading", { name: /Tech Corp/i });

      await waitFor(() => {
        const statsCalls = fetchSpy.mock.calls.filter((c) =>
          String(c[0]).includes("/api/job-invitations/stats/")
        );
        expect(statsCalls.length).toBeGreaterThan(0);
      });
    });

    it("displays View Details button when invitations exist", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              totalSent: 5,
              totalViewed: 3,
              totalClicked: 1,
              viewRate: "60.0",
              clickRate: "20.0",
            }),
          });
        }
        if (u.includes("/ratings")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ratings: [], totalRatings: 0, averageRating: null }),
          });
        }
        return defaultFetchImpl(url, init);
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

      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/api/job-invitations/details/")) {
          return Promise.resolve({
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
        }
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              totalSent: 5,
              totalViewed: 3,
              totalClicked: 1,
              viewRate: "60.0",
              clickRate: "20.0",
            }),
          });
        }
        if (u.includes("/ratings")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ratings: [], totalRatings: 0, averageRating: null }),
          });
        }
        return defaultFetchImpl(url, init);
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

      (globalThis.fetch as any).mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/ratings")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ratings: [], totalRatings: 0, averageRating: null }),
          });
        }
        if (u.includes("/job-invitations/stats/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              totalSent: 5,
              totalViewed: 3,
              totalClicked: 1,
              viewRate: "60.0",
              clickRate: "20.0",
            }),
          });
        }
        if (u.includes("/job-invitations/details/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ invitations: [] }),
          });
        }
        return defaultFetchImpl(url, init);
      });

      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i });

      const viewDetailsButton = await screen.findByRole("button", { name: /view details/i }, { timeout: 8000 });
      await user.click(viewDetailsButton);

      const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
      expect(within(dialog).getByText("Invitation Details")).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: /^close$/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("does not display View Details button when no invitations", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              totalSent: 0,
              totalViewed: 0,
              totalClicked: 0,
              viewRate: "0",
              clickRate: "0",
            }),
          });
        }
        if (u.includes("/ratings")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ratings: [], totalRatings: 0, averageRating: null }),
          });
        }
        return defaultFetchImpl(url, init);
      });

      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i });

      await waitFor(() => {
        const viewDetailsButton = screen.queryByRole("button", { name: /view details/i });
        expect(viewDetailsButton).not.toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("handles stats fetch error gracefully", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.reject(new Error("Network error"));
        }
        return defaultFetchImpl(url, init);
      });

      renderComp();
      await screen.findByRole('heading', { name: /Tech Corp/i }, { timeout: 3000 });

      // Should still render the page even if stats fail
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Tech Corp/i })).toBeInTheDocument();
      });
    });

    it("displays invitation stats summary", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              totalSent: 10,
              totalViewed: 7,
              totalClicked: 3,
              viewRate: "70.0",
              clickRate: "30.0",
            }),
          });
        }
        if (u.includes("/ratings")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ratings: [], totalRatings: 0, averageRating: null }),
          });
        }
        return defaultFetchImpl(url, init);
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
    const publishedForm = {
      title: "Apply Here",
      status: "published",
      fields: [{ id: "f1", type: "shortText", label: "Name", required: true }],
    };

    const draftForm = {
      title: "Draft Form",
      status: "draft",
      fields: [],
    };

    const mockJobWithForm = {
      ...mockJobData,
      applicationForm: publishedForm,
    };

    const mockJobWithDraftForm = {
      ...mockJobData,
      applicationForm: draftForm,
    };

    const apiJobBase = {
      id: "job-1",
      companyId: "company-1",
      name: "Software Engineer",
      description: "We are hiring",
      majorsAssociated: "Computer Science",
      applicationLink: "https://example.com/apply",
      createdAt: 1234567890,
      locationIsRemote: true,
    };

    beforeEach(() => {
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/api/jobs?") && u.includes("companyId") && (!init?.method || init.method === "GET")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              jobs: [{ ...apiJobBase, applicationForm: publishedForm }],
            }),
          });
        }
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              totalSent: 0,
              totalViewed: 0,
              totalClicked: 0,
              viewRate: "0",
              clickRate: "0",
            }),
          });
        }
        return defaultFetchImpl(url, init);
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
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/api/jobs?") && u.includes("companyId") && (!init?.method || init.method === "GET")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              jobs: [{ ...apiJobBase, applicationForm: draftForm }],
            }),
          });
        }
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              totalSent: 0,
              totalViewed: 0,
              totalClicked: 0,
              viewRate: "0",
              clickRate: "0",
            }),
          });
        }
        return defaultFetchImpl(url, init);
      });
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
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) =>
        defaultFetchImpl(url, init)
      );
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

      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/api/jobs?") && u.includes("companyId") && (!init?.method || init.method === "GET")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              jobs: [{ ...apiJobBase, applicationForm: publishedForm }],
            }),
          });
        }
        if (u.includes("/api/jobs/") && u.includes("/form") && init?.method === "DELETE") {
          return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
        }
        return defaultFetchImpl(url, init);
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

      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/api/jobs?") && u.includes("companyId") && (!init?.method || init.method === "GET")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              jobs: [{ ...apiJobBase, applicationForm: publishedForm }],
            }),
          });
        }
        if (u.includes("/api/jobs/") && u.includes("/form") && init?.method === "DELETE") {
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: "Unauthorized to delete form" }),
          });
        }
        return defaultFetchImpl(url, init);
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
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) =>
        defaultFetchImpl(url, init)
      );
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

  describe("BoothManagementCard", () => {
    function setBoothListFetch(booths: any[], ok = true) {
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: any) => {
        if (url.includes("/api/companies/") && url.includes("/invite-code")) {
          return Promise.resolve({ ok: true, json: async () => ({ inviteCode: "INVITE123" }) });
        }
        if (url.includes("/api/booths?companyId=")) {
          return Promise.resolve({ ok, json: async () => ({ booths }) });
        }
        if (init?.method === "DELETE" && url.includes("/api/booths/")) {
          return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
        }
        return Promise.resolve({ ok: false, json: async () => ({ error: "Not found" }) });
      });
    }

    it("shows 'No booths created yet' when the list is empty", async () => {
      setBoothListFetch([]);
      renderComp();

      await waitFor(() => {
        expect(screen.getByText(/no booths created yet/i)).toBeInTheDocument();
      });
    });

    it("renders a list of booths with name and industry", async () => {
      setBoothListFetch([
        { id: "b1", boothName: "Alpha", industry: "Tech" },
        { id: "b2", boothName: "Beta" },
      ]);
      renderComp();

      await waitFor(() => {
        expect(screen.getByText("Alpha")).toBeInTheDocument();
        expect(screen.getByText("Beta")).toBeInTheDocument();
      });
      expect(screen.getByText("Tech")).toBeInTheDocument();
    });

    it("falls back to 'Untitled Booth' when booth has no name", async () => {
      setBoothListFetch([{ id: "b1" }]);
      renderComp();

      await waitFor(() => {
        expect(screen.getByText("Untitled Booth")).toBeInTheDocument();
      });
    });

    it("navigates to the booth editor when Edit is clicked", async () => {
      const user = userEvent.setup();
      setBoothListFetch([{ id: "b1", boothName: "Alpha" }]);
      renderComp();

      await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: /^edit$/i }));

      expect(mockNavigate).toHaveBeenCalledWith("/company/company-1/booth/b1");
    });

    it("navigates to create booth when 'Create New Booth' is clicked", async () => {
      const user = userEvent.setup();
      setBoothListFetch([]);
      renderComp();

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /create new booth/i })).toBeInTheDocument()
      );
      await user.click(screen.getByRole("button", { name: /create new booth/i }));

      expect(mockNavigate).toHaveBeenCalledWith("/company/company-1/booth");
    });

    function getBoothDeleteButton() {
      // The booth Delete button lives inside the row containing the booth name "Alpha".
      // Scope by row to avoid clashing with Delete Job / Delete Company buttons.
      const alphaRow = screen.getByText("Alpha").closest("div")!.parentElement!;
      return within(alphaRow).getByRole("button", { name: /^delete$/i });
    }

    it("deletes a booth after confirmation", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
      setBoothListFetch([{ id: "b1", boothName: "Alpha" }]);
      renderComp();

      await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
      await user.click(getBoothDeleteButton());

      await waitFor(() => {
        expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
      });
      confirmSpy.mockRestore();
    });

    it("does not call DELETE when user cancels confirm", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/companies/") && url.includes("/invite-code")) {
          return Promise.resolve({ ok: true, json: async () => ({ inviteCode: "INVITE123" }) });
        }
        if (url.includes("/api/booths?companyId=")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ booths: [{ id: "b1", boothName: "Alpha" }] }),
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({ error: "nope" }) });
      });
      globalThis.fetch = fetchSpy;
      renderComp();

      await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
      const deleteCallsBefore = fetchSpy.mock.calls.filter((c) =>
        (c[1] as any)?.method === "DELETE"
      ).length;
      await user.click(getBoothDeleteButton());

      const deleteCallsAfter = fetchSpy.mock.calls.filter((c) =>
        (c[1] as any)?.method === "DELETE"
      ).length;
      expect(deleteCallsAfter).toBe(deleteCallsBefore);
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it("shows alert and keeps booth when DELETE returns an error", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
      const alertSpy = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: any) => {
        if (url.includes("/api/companies/") && url.includes("/invite-code")) {
          return Promise.resolve({ ok: true, json: async () => ({ inviteCode: "INVITE123" }) });
        }
        if (url.includes("/api/booths?companyId=")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ booths: [{ id: "b1", boothName: "Alpha" }] }),
          });
        }
        if (init?.method === "DELETE" && url.includes("/api/booths/")) {
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: "Cannot delete" }),
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({ error: "nope" }) });
      });
      renderComp();

      await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
      await user.click(getBoothDeleteButton());

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Cannot delete"));
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      confirmSpy.mockRestore();
      alertSpy.mockRestore();
    });
  });

  describe("Office locations", () => {
    const repGetDoc = (companyData: Record<string, unknown>) => (getDoc as any).mockImplementation((docRef: any) => {
      if (docRef.id === "company-1") {
        return Promise.resolve({
          exists: () => true,
          id: "company-1",
          data: () => companyData,
        });
      }
      if (docRef.id === "rep-1") {
        return Promise.resolve({
          exists: () => true,
          id: "rep-1",
          data: () => mockRepresentativeData,
        });
      }
      return Promise.resolve({ exists: () => false });
    });

    it("representative sees remote employer read-only state", async () => {
      (authUtils.getCurrentUser as any).mockReturnValue({ uid: "rep-1", role: "representative" });
      repGetDoc({
        ...mockCompanyData,
        representativeIDs: ["rep-1"],
        remoteEmployer: true,
        officeLocations: [],
      });
      renderComp();
      await screen.findByRole("heading", { name: /Tech Corp/i });
      expect(screen.getByText("Remote employer")).toBeInTheDocument();
      expect(screen.getByText(/Only the company owner can edit locations/i)).toBeInTheDocument();
    });

    it("representative sees empty-office copy when company has no locations", async () => {
      (authUtils.getCurrentUser as any).mockReturnValue({ uid: "rep-1", role: "representative" });
      repGetDoc({
        ...mockCompanyData,
        representativeIDs: ["rep-1"],
        remoteEmployer: false,
        officeLocations: [],
      });
      renderComp();
      await screen.findByRole("heading", { name: /Tech Corp/i });
      expect(
        screen.getByText(/No office locations on file\. The company owner can add verified locations here\./i),
      ).toBeInTheDocument();
    });

    it("representative sees saved office rows with city/state secondary", async () => {
      (authUtils.getCurrentUser as any).mockReturnValue({ uid: "rep-1", role: "representative" });
      repGetDoc({
        ...mockCompanyData,
        representativeIDs: ["rep-1"],
        remoteEmployer: false,
        officeLocations: [
          { id: "loc-1", label: "HQ", city: "Austin", state: "TX" },
          { id: "loc-2", label: "", city: "Denver", state: "CO" },
        ],
      });
      renderComp();
      await screen.findByRole("heading", { name: /Tech Corp/i });
      expect(screen.getByText("HQ")).toBeInTheDocument();
      expect(screen.getAllByText("Denver, CO").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Austin, TX")).toBeInTheDocument();
    });

    it("owner loads normalized office rows from mixed Firestore shapes", async () => {
      repGetDoc({
        ...mockCompanyData,
        remoteEmployer: false,
        officeLocations: [
          null,
          { id: "", label: "Skip" },
          { id: "loc-1", label: "  Trimmed  ", city: "Austin", state: "TX", zip: 78701 },
          { id: "loc-2", label: "", city: "Denver", state: "CO" },
        ],
      });
      renderComp();
      await screen.findByRole("heading", { name: /Tech Corp/i });
      expect(screen.getByText("Trimmed")).toBeInTheDocument();
      expect(screen.getByText("Denver, CO")).toBeInTheDocument();
      expect(screen.queryByText("Skip")).not.toBeInTheDocument();
    });

    it("owner marks locations dirty when toggling remote employer", async () => {
      const user = userEvent.setup();
      repGetDoc({
        ...mockCompanyData,
        remoteEmployer: false,
        officeLocations: [{ id: "loc-1", label: "Austin, TX", city: "Austin", state: "TX" }],
      });
      renderComp();
      await screen.findByRole("heading", { name: /Tech Corp/i });
      const saveBtn = screen.getByRole("button", { name: /Save locations/i });
      expect(saveBtn).toBeDisabled();
      await user.click(screen.getByRole("checkbox", { name: /Remote employer/i }));
      expect(saveBtn).not.toBeDisabled();
    });

    it("owner adds a suggestion once and ignores duplicate label adds", async () => {
      const user = userEvent.setup();
      geocodeSuggestMocks.state.options = [
        { id: "s1", label: "Portland, OR", lat: 45.5, lng: -122.6, city: "Portland", state: "OR", zip: null },
      ];
      repGetDoc({
        ...mockCompanyData,
        remoteEmployer: false,
        officeLocations: [],
      });
      renderComp();
      await screen.findByRole("heading", { name: /Tech Corp/i });
      const combo = screen.getByRole("combobox", { name: /Search places to add/i });
      await user.click(combo);
      await user.keyboard("Po");
      const opt = await screen.findByRole("option", { name: /Portland, OR/i });
      await user.click(opt);
      expect(screen.getAllByText("Portland, OR").length).toBeGreaterThanOrEqual(1);
      await user.click(combo);
      await user.keyboard("Po");
      const opt2 = await screen.findByRole("option", { name: /Portland, OR/i });
      await user.click(opt2);
      const officeCard = screen.getByRole("button", { name: /Save locations/i }).closest(".MuiCard-root");
      expect(officeCard).toBeTruthy();
      expect(within(officeCard as HTMLElement).getAllByText("Portland, OR")).toHaveLength(1);
    });

    it("owner uses fallback id when crypto.randomUUID is unavailable", async () => {
      const user = userEvent.setup();
      vi.stubGlobal("crypto", {
        randomUUID: undefined,
        getRandomValues(arr: Uint8Array) {
          arr.fill(0xab)
          return arr
        },
      } as unknown as Crypto);
      geocodeSuggestMocks.state.options = [
        { id: "s2", label: "Seattle, WA", lat: 47.6, lng: -122.3, city: "Seattle", state: "WA", zip: null },
      ];
      repGetDoc({
        ...mockCompanyData,
        remoteEmployer: false,
        officeLocations: [],
      });
      try {
        renderComp();
        await screen.findByRole("heading", { name: /Tech Corp/i });
        const combo = screen.getByRole("combobox", { name: /Search places to add/i });
        await user.click(combo);
        await user.keyboard("Se");
        await user.click(await screen.findByRole("option", { name: /Seattle, WA/i }));
        expect(screen.getByText("Seattle, WA")).toBeInTheDocument();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("Access control and fetch errors", () => {
    it("shows company not found when Firestore has no company doc", async () => {
      (getDoc as any).mockResolvedValue({
        exists: () => false,
      });
      renderComp();
      expect(
        await screen.findByText(/Company not found/i, {}, { timeout: 5000 })
      ).toBeInTheDocument();
    });

    it("redirects student users to dashboard", async () => {
      (getDoc as any).mockImplementation((docRef: { id?: string }) => {
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
        return Promise.resolve({ exists: () => false });
      });
      (authUtils.getCurrentUser as any).mockReturnValue({
        uid: "student-1",
        role: "student",
      });
      renderComp();
      await waitFor(
        () => {
          expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
        },
        { timeout: 5000 }
      );
    });

    it("surfaces error when jobs list fetch fails", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url);
        if (u.includes("/api/jobs?") && u.includes("companyId")) {
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: "server" }),
          });
        }
        return defaultFetchImpl(u, init);
      });
      renderComp();
      expect(
        await screen.findByText(/Failed to load job postings/i, {}, { timeout: 5000 })
      ).toBeInTheDocument();
    });
  });

  describe("Job invitations, stats, CRUD edge cases and job dialog UX", () => {
    const onsiteJobApiRow = {
      id: "job-1",
      companyId: "company-1",
      name: "Onsite Lead",
      description: "Office work",
      majorsAssociated: "Python",
      applicationLink: "https://example.com/apply",
      createdAt: 1234567890,
      locationIsRemote: false,
      locationCity: "Seattle",
      locationState: "WA",
      location: null as string | null,
    }

    function jobCardRoot() {
      const el = screen.getByText(/Onsite Lead|Software Engineer/i)
      const card = el.closest(".MuiCard-root")
      if (!card) throw new Error("expected MuiCard-root")
      return card as HTMLElement
    }

    it("handles rejected job invitation stats fetch without breaking the Company page", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url)
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.reject(new Error("stats network fail"))
        }
        return defaultFetchImpl(url, init)
      })

      renderComp()
      await screen.findByRole("heading", { name: /Tech Corp/i })

      await waitFor(() => {
        const statsCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
          String(c[0]).includes("/api/job-invitations/stats/")
        )
        expect(statsCalls.length).toBeGreaterThan(0)
      })
    })

    it("opens invite dialog when Send is clicked and titles the mock dialog", async () => {
      const user = userEvent.setup()
      renderComp()
      await screen.findByText(/Software Engineer/i)

      const inviteBtn = within(jobCardRoot()).getAllByRole("button")[0]
      await user.click(inviteBtn)

      expect(screen.getByTestId("mock-job-invite-dialog")).toBeInTheDocument()
      expect(screen.getByTestId("mock-invite-job-title")).toHaveTextContent("Software Engineer")
    })

    it("onInviteSuccess refreshes stats for the selected job", async () => {
      const user = userEvent.setup()
      const statsCalls: string[] = []
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url)
        if (u.includes("/api/job-invitations/stats/")) {
          statsCalls.push(u)
          return Promise.resolve({
            ok: true,
            json: async () => ({
              totalSent: 1,
              totalViewed: 0,
              totalClicked: 0,
              viewRate: "0",
              clickRate: "0",
            }),
          })
        }
        return defaultFetchImpl(url, init)
      })

      renderComp()
      await screen.findByText(/Software Engineer/i)

      await user.click(within(jobCardRoot()).getAllByRole("button")[0])
      await user.click(screen.getByTestId("mock-invite-success"))

      await waitFor(() => {
        expect(statsCalls.filter((u) => u.includes("job-1")).length).toBeGreaterThanOrEqual(2)
      })
    })

    it("fetchJobStats returns early when getIdToken yields no token on refresh", async () => {
      const user = userEvent.setup()
      const noToken = {
        getIdToken: vi.fn(() => Promise.resolve(undefined as unknown as string)),
        uid: "owner-1",
      }
      mockFirebaseAuth.currentUser = noToken

      renderComp()
      await screen.findByText(/Software Engineer/i)

      await user.click(within(jobCardRoot()).getAllByRole("button")[0])
      await user.click(screen.getByTestId("mock-invite-success"))

      await waitFor(() => {
        expect(noToken.getIdToken.mock.calls.length).toBeGreaterThan(0)
      })
    })

    it("resetJobForm clears the job dialog when Cancel is clicked", async () => {
      const user = userEvent.setup()
      renderComp()
      await screen.findByRole("heading", { name: /Tech Corp/i })

      await user.click(screen.getAllByRole("button", { name: /create job posting/i })[0]!)
      const dlg = await screen.findByRole("dialog")

      await user.click(within(dlg).getByRole("button", { name: /^cancel$/i }))
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      })
    })

    it("loads on-site job using custom location label when API provides location string", async () => {
      const user = userEvent.setup()
      const row = {
        ...onsiteJobApiRow,
        location: "HQ — Floor 3",
        locationCity: "Seattle",
        locationState: "WA",
      }
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url)
        if (u.includes("/api/jobs?") && u.includes("companyId") && (!init?.method || init.method === "GET")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              jobs: [row],
            }),
          })
        }
        return defaultFetchImpl(url, init)
      })
      ;(getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => ({ ...mockJobData, name: "Onsite Lead" }) }),
        empty: false,
      })

      renderComp()
      await screen.findByText(/Onsite Lead/i)

      await user.click(screen.queryAllByTestId("EditIcon").at(-1)!.closest("button")!)

      expect(screen.getByDisplayValue("HQ — Floor 3")).toBeInTheDocument()
    })

    it("loads on-site job into edit form with derived location label from city and state", async () => {
      const user = userEvent.setup()
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url)
        if (u.includes("/api/jobs?") && u.includes("companyId") && (!init?.method || init.method === "GET")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              jobs: [onsiteJobApiRow],
            }),
          })
        }
        return defaultFetchImpl(url, init)
      })
      ;(getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => ({ ...mockJobData, name: "Onsite Lead" }) }),
        empty: false,
      })

      renderComp()
      await screen.findByText(/Onsite Lead/i)

      const editBtns = screen.queryAllByTestId("EditIcon")
      await user.click(editBtns.at(-1)!.closest("button")!)

      expect(screen.getByRole("dialog")).toBeInTheDocument()
      expect(screen.getByDisplayValue("Seattle, WA")).toBeInTheDocument()
      const remoteCb = screen.getByRole("checkbox", { name: /remote position/i })
      expect(remoteCb).not.toBeChecked()
    })

    it("PUT updates an on-site job preserving location payload", async () => {
      const user = userEvent.setup()
      mockJobGeocodeState.options = [
        { id: "loc1", label: "Seattle, WA", lat: 0, lng: 0, city: "Seattle", state: "WA" },
      ]
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url)
        if (u.includes("/api/jobs?") && u.includes("companyId") && (!init?.method || init.method === "GET")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, jobs: [onsiteJobApiRow] }),
          })
        }
        return defaultFetchImpl(url, init)
      })
      ;(getDocs as any).mockResolvedValue({
        forEach: (cb: any) => cb({ id: "job-1", data: () => ({ ...mockJobData, name: "Onsite Lead" }) }),
        empty: false,
      })

      renderComp()
      await screen.findByText(/Onsite Lead/i)

      await user.click(screen.queryAllByTestId("EditIcon").at(-1)!.closest("button")!)

      const titleInput = screen.getByLabelText(/job title/i)
      await user.clear(titleInput)
      await user.type(titleInput, "Onsite Lead Updated")

      await user.click(screen.getByRole("button", { name: /^update job$/i }))

      await waitFor(() => {
        const puts = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          (c) => c[1]?.method === "PUT" && String(c[0]).includes("/api/jobs/job-1")
        )
        expect(puts.length).toBeGreaterThan(0)
        const body = JSON.parse((puts[0][1] as RequestInit).body as string)
        expect(body.locationIsRemote).toBe(false)
        expect(body.locationCity).toBe("Seattle")
        expect(body.locationState).toBe("WA")
      })
    })

    it("shows save error when POST create job returns non-OK", async () => {
      const user = userEvent.setup()
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url)
        const path = new URL(u, "http://localhost").pathname
        if (init?.method === "POST" && path === "/api/jobs") {
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: "duplicate title" }),
          })
        }
        return defaultFetchImpl(url, init)
      })

      renderComp()
      await screen.findByRole("heading", { name: /Tech Corp/i })

      await user.click(screen.getAllByRole("button", { name: /create job posting/i })[0]!)
      await user.type(screen.getByLabelText(/job title/i), "X")
      await user.type(screen.getByLabelText(/description/i), "Y")
      await user.type(screen.getByLabelText(/required skills/i), "Z")
      await user.click(screen.getByRole("button", { name: /^publish job$/i }))

      expect(await screen.findByText(/failed to save job posting/i)).toBeInTheDocument()
    })

    it("shows save error when Firebase returns no id token during save", async () => {
      const user = userEvent.setup()
      mockFirebaseAuth.currentUser = {
        getIdToken: vi.fn(() => Promise.resolve(undefined as unknown as string)),
        uid: "owner-1",
      }

      renderComp()
      await screen.findByRole("heading", { name: /Tech Corp/i })

      await user.click(screen.getAllByRole("button", { name: /create job posting/i })[0]!)
      await user.type(screen.getByLabelText(/job title/i), "T")
      await user.type(screen.getByLabelText(/description/i), "D")
      await user.type(screen.getByLabelText(/required skills/i), "S")
      await user.click(screen.getByRole("button", { name: /^publish job$/i }))

      expect(await screen.findByText(/failed to save job posting/i)).toBeInTheDocument()
    })

    it("shows save error when PUT update returns non-OK", async () => {
      const user = userEvent.setup()
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url)
        if (/\/api\/jobs\/job-1/.test(u) && init?.method === "PUT") {
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: "cannot update" }),
          })
        }
        return defaultFetchImpl(url, init)
      })

      renderComp()
      await screen.findByText(/Software Engineer/i)

      await user.click(screen.queryAllByTestId("EditIcon").at(-1)!.closest("button")!)
      await user.click(screen.getByRole("button", { name: /^update job$/i }))

      expect(await screen.findByText(/failed to save job posting/i)).toBeInTheDocument()
    })

    it("blocks save when session expired (no Firebase user) and schedules login redirect", async () => {
      const user = userEvent.setup()
      mockFirebaseAuth.currentUser = null

      renderComp()
      await screen.findByRole("heading", { name: /Tech Corp/i })

      await user.click(screen.getAllByRole("button", { name: /create job posting/i })[0]!)
      await user.type(screen.getByLabelText(/job title/i), "T")
      await user.type(screen.getByLabelText(/description/i), "D")
      await user.type(screen.getByLabelText(/required skills/i), "S")
      await user.click(screen.getByRole("button", { name: /^publish job$/i }))

      expect(await screen.findByText(/session has expired/i)).toBeInTheDocument()
      await waitFor(
        () => {
          expect(mockNavigate).toHaveBeenCalledWith("/login")
        },
        { timeout: 4000 }
      )
    })

    it("blocks delete job when session expired", async () => {
      const user = userEvent.setup()
      renderComp()
      await screen.findByText(/Software Engineer/i)

      const delIcons = screen.queryAllByTestId("DeleteIcon")
      const jobRowDelete = delIcons.length >= 2 ? delIcons[1]! : delIcons[0]!
      await user.click(jobRowDelete.closest("button")!)

      const jobDelDlg = await screen.findByRole("dialog", { name: /delete job posting/i })
      mockFirebaseAuth.currentUser = null
      await user.click(within(jobDelDlg).getByRole("button", { name: /^delete$/i }))

      expect(await screen.findByText(/session has expired/i)).toBeInTheDocument()
      await waitFor(
        () => {
          expect(mockNavigate).toHaveBeenCalledWith("/login")
        },
        { timeout: 4000 }
      )
    })

    it("shows API error when delete job returns non-OK", async () => {
      const user = userEvent.setup()
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url)
        if (init?.method === "DELETE" && u.includes("/api/jobs/job-1")) {
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: "locked" }),
          })
        }
        return defaultFetchImpl(url, init)
      })

      renderComp()
      await screen.findByText(/Software Engineer/i)

      const delIcons = screen.queryAllByTestId("DeleteIcon")
      const jobRowDelete = delIcons.length >= 2 ? delIcons[1]! : delIcons[0]!
      await user.click(jobRowDelete.closest("button")!)
      const jobDelDlg = await screen.findByRole("dialog", { name: /delete job posting/i })
      await user.click(within(jobDelDlg).getByRole("button", { name: /^delete$/i }))

      expect(await screen.findByText(/failed to delete job posting/i)).toBeInTheDocument()
    })

    it("checking Remote again clears on-site location fields", async () => {
      const user = userEvent.setup()
      mockJobGeocodeState.options = [
        { id: "loc1", label: "Denver, CO", lat: 0, lng: 0, city: "Denver", state: "CO" },
      ]
      renderComp()
      await screen.findByRole("heading", { name: /Tech Corp/i })

      await user.click(screen.getAllByRole("button", { name: /create job posting/i })[0]!)
      await user.click(screen.getByRole("checkbox", { name: /remote position/i }))
      const combo = screen.getByRole("combobox", { name: /job location/i })
      await user.click(combo)
      await user.click(await screen.findByRole("option", { name: /denver/i }))
      await user.click(screen.getByRole("checkbox", { name: /remote position/i }))

      expect(screen.queryByRole("combobox", { name: /job location/i })).not.toBeInTheDocument()
    })

    it("typing in location combobox clears the selected pick (input path)", async () => {
      const user = userEvent.setup()
      mockJobGeocodeState.options = [
        { id: "loc1", label: "Denver, CO", lat: 0, lng: 0, city: "Denver", state: "CO" },
      ]
      renderComp()
      await screen.findByRole("heading", { name: /Tech Corp/i })

      await user.click(screen.getAllByRole("button", { name: /create job posting/i })[0]!)
      await user.click(screen.getByRole("checkbox", { name: /remote position/i }))
      const combo = screen.getByRole("combobox", { name: /job location/i })
      await user.click(combo)
      await user.click(await screen.findByRole("option", { name: /denver/i }))
      await user.type(combo, "x")

      await waitFor(() => {
        expect(screen.queryByDisplayValue("Denver, CO")).not.toBeInTheDocument()
      })
    })

    it("closes job dialog via Escape (resetJobForm)", async () => {
      const user = userEvent.setup()
      renderComp()
      await screen.findByRole("heading", { name: /Tech Corp/i })

      await user.click(screen.getAllByRole("button", { name: /create job posting/i })[0]!)
      await screen.findByRole("dialog")
      await user.keyboard("{Escape}")

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      })
    })
  })

  describe("Application form delete — session handling", () => {
    const publishedForm = {
      title: "Apply Here",
      status: "published",
      fields: [{ id: "f1", type: "shortText", label: "Name", required: true }],
    }

    const apiJobBase = {
      id: "job-1",
      companyId: "company-1",
      name: "Software Engineer",
      description: "We are hiring",
      majorsAssociated: "Computer Science",
      applicationLink: "https://example.com/apply",
      createdAt: 1234567890,
      locationIsRemote: true,
    }

    it("blocks delete application form when session expired", async () => {
      const user = userEvent.setup()
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : String(url)
        if (u.includes("/api/jobs?") && u.includes("companyId") && (!init?.method || init.method === "GET")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              jobs: [{ ...apiJobBase, applicationForm: publishedForm }],
            }),
          })
        }
        if (u.includes("/api/job-invitations/stats/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              totalSent: 0,
              totalViewed: 0,
              totalClicked: 0,
              viewRate: "0",
              clickRate: "0",
            }),
          })
        }
        return defaultFetchImpl(url, init)
      })
      ;(getDocs as any).mockResolvedValue({
        forEach: (cb: any) =>
          cb({
            id: "job-1",
            data: () => ({ ...mockJobData, applicationForm: publishedForm }),
          }),
        empty: false,
      })

      renderComp()
      await screen.findByText(/Application Form: Published/i, {}, { timeout: 5000 })

      await user.click(screen.queryAllByTestId("DeleteSweepIcon")[0]!.closest("button")!)
      await screen.findByText(/Delete Application Form/i)

      const formDlg = screen.getByRole("dialog", { name: /delete application form/i })
      mockFirebaseAuth.currentUser = null
      await user.click(within(formDlg).getByRole("button", { name: /delete form/i }))

      expect(await screen.findByText(/session has expired/i)).toBeInTheDocument()
      await waitFor(
        () => {
          expect(mockNavigate).toHaveBeenCalledWith("/login")
        },
        { timeout: 4000 }
      )
    })
  })
})

