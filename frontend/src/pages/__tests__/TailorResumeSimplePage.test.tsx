import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import TailorResumeSimplePage from "../TailorResumeSimplePage";

const mockNavigate = vi.fn();
const mockParams: { invitationId?: string } = { invitationId: "inv123" };

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  };
});

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    getIdToken: vi.fn(),
  },
}));

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">ProfileMenu</div>,
}));

vi.mock("../../utils/resumeFormatter", () => ({
  formatPlainTextResume: vi.fn((text: string) => text),
}));

import { authUtils } from "../../utils/auth";

const mockUser = { uid: "user1", email: "student@test.com" };

const mockInvitationResponse = {
  data: {
    job: { name: "Software Engineer", description: "Build great software." },
  },
};

const mockChangesResponse = {
  originalText: "My original resume text.",
  changes: [
    { type: "edit", section: "experience", original: "Old bullet", replacement: "New bullet", reason: "More relevant" },
    { type: "add", section: "skills", original: null, replacement: "TypeScript", reason: "Required skill" },
    { type: "remove", section: "experience", original: "Unrelated bullet", replacement: null, reason: "Not relevant" },
  ],
};

const renderPage = () =>
  render(
    <BrowserRouter>
      <TailorResumeSimplePage />
    </BrowserRouter>
  );

describe("TailorResumeSimplePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authUtils.getCurrentUser).mockReturnValue(mockUser as any);
    vi.mocked(authUtils.getIdToken).mockResolvedValue("mock-token");
  });

  it("redirects to login when no user", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue(null);
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login"));
  });

  it("shows loading spinner while fetching invitation", () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("progressbar")).toBeDefined();
  });

  it("shows error when invitation fetch fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Failed to load invitation")).toBeDefined()
    );
  });

  it("shows step 1 UI after invitation loads", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockInvitationResponse,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Step 1: Generate Changes")).toBeDefined()
    );
    expect(screen.getByRole("button", { name: /generate changes/i })).toBeDefined();
  });

  it("displays job title in page header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockInvitationResponse,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/tailor resume for software engineer/i)).toBeDefined()
    );
  });

  it("navigates back when Back button clicked", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockInvitationResponse,
    });
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /back/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/job-invitations");
  });

  it("shows generating spinner when Generate Changes is clicked", async () => {
    // First fetch returns invitation; second never resolves (simulating generation in progress)
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, json: async () => mockInvitationResponse });
      }
      return new Promise(() => {}); // never resolves
    });
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /generate changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate changes/i }));
    // Spinner appears inside the button while generating
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeDefined());
  });

  it("shows changes list after generating", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockChangesResponse });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /generate changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate changes/i }));

    await waitFor(() => expect(screen.getByText(/review individual changes/i)).toBeDefined());
    expect(screen.getByText("Old bullet")).toBeDefined();
    expect(screen.getByText("New bullet")).toBeDefined();
    expect(screen.getByText("TypeScript")).toBeDefined();
    expect(screen.getByText("Unrelated bullet")).toBeDefined();
  });

  it("shows changes summary with counts", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockChangesResponse });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /generate changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate changes/i }));

    await waitFor(() => expect(screen.getByText(/changes summary/i)).toBeDefined());
    // All 3 changes auto-approved
    expect(screen.getByText(/approved: 3/i)).toBeDefined();
    expect(screen.getByText(/edits: 1/i)).toBeDefined();
    expect(screen.getByText(/additions: 1/i)).toBeDefined();
    expect(screen.getByText(/removals: 1/i)).toBeDefined();
  });

  it("toggles approval state of a change", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockChangesResponse });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /generate changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate changes/i }));

    await waitFor(() => expect(screen.getAllByRole("button", { name: /approved/i }).length).toBeGreaterThan(0));

    // Click first "Approved" button to reject
    const approvedBtns = screen.getAllByRole("button", { name: /approved/i });
    fireEvent.click(approvedBtns[0]);

    // Should now show "Reject" for that change
    expect(screen.getAllByRole("button", { name: /reject/i }).length).toBeGreaterThan(0);
  });

  it("shows error when no changes approved on save attempt", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          originalText: "text",
          changes: [{ type: "edit", section: "exp", original: "old", replacement: "new", reason: "r" }],
        }),
      });

    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /generate changes/i })));
    await waitFor(() => screen.getByRole("button", { name: /approved/i }));

    // Reject the only change
    fireEvent.click(screen.getByRole("button", { name: /approved/i }));
    await waitFor(() => screen.getByRole("button", { name: /reject/i }));

    // Try to save (button should be disabled since 0 approved)
    const saveBtn = screen.getByRole("button", { name: /save tailored resume/i });
    expect(saveBtn.hasAttribute("disabled")).toBe(true);
  });

  it("opens confirmation dialog when save button clicked", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockChangesResponse });

    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /generate changes/i })));
    await waitFor(() => screen.getByRole("button", { name: /save tailored resume/i }));

    fireEvent.click(screen.getByRole("button", { name: /save tailored resume/i }));
    expect(screen.getByText("Confirm Save")).toBeDefined();
    expect(screen.getByText(/3 approved changes/i)).toBeDefined();
  });

  it("closes confirmation dialog on cancel", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockChangesResponse });

    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /generate changes/i })));
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /save tailored resume/i })));
    await waitFor(() => screen.getByText("Confirm Save"));

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByText("Confirm Save")).toBeNull());
  });

  it("saves resume and navigates to new resume page", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockChangesResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Saved!", tailoredResumeId: "new-resume-456" }),
      });

    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /generate changes/i })));
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /save tailored resume/i })));
    await waitFor(() => screen.getByText("Confirm Save"));
    fireEvent.click(screen.getByRole("button", { name: /confirm save/i }));

    await waitFor(() => expect(screen.getByText("Saved!")).toBeDefined());
  });

  it("shows error when save API call fails", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockChangesResponse })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Server error saving resume" }),
      });

    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /generate changes/i })));
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /save tailored resume/i })));
    await waitFor(() => screen.getByText("Confirm Save"));
    fireEvent.click(screen.getByRole("button", { name: /confirm save/i }));

    await waitFor(() =>
      expect(screen.getByText("Server error saving resume")).toBeDefined()
    );
  });

  it("shows error when generate changes API returns no changes array", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ originalText: "text" }), // missing changes
      });

    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /generate changes/i })));

    await waitFor(() =>
      expect(screen.getByText(/backend response missing changes array/i)).toBeDefined()
    );
  });

  it("shows error when generate changes API call fails", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "AI service unavailable" }),
      });

    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /generate changes/i })));

    await waitFor(() =>
      expect(screen.getByText("AI service unavailable")).toBeDefined()
    );
  });

  it("renders each change with correct type chips", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockChangesResponse });

    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /generate changes/i })));
    await waitFor(() => screen.getByText("EDIT"));
    expect(screen.getByText("ADD")).toBeDefined();
    expect(screen.getByText("REMOVE")).toBeDefined();
  });

  it("shows original resume section after generating", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockInvitationResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockChangesResponse });

    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /generate changes/i })));
    await waitFor(() =>
      expect(screen.getByText(/original resume/i)).toBeDefined()
    );
    expect(screen.getByText("My original resume text.")).toBeDefined();
  });
});
