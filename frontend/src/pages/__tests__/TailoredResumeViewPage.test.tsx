import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import TailoredResumeViewPage from "../TailoredResumeViewPage";

const mockNavigate = vi.fn();
const mockParams: { tailoredResumeId?: string } = { tailoredResumeId: "resume123" };

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

vi.mock("../../utils/resumeFormatter", async () => {
  const actual = await vi.importActual("../../utils/resumeFormatter");
  return {
    ...actual,
    formatPlainTextResume: vi.fn((text: string) => text),
  };
});

import { authUtils } from "../../utils/auth";

const mockUser = { uid: "user1", email: "student@test.com" };

const makePlainTextResume = () => ({
  id: "resume123",
  jobContext: {
    jobTitle: "Frontend Engineer",
    jobDescription: "Build React apps at scale.",
    requiredSkills: "React, TypeScript",
  },
  tailoredText: "My tailored resume text.",
  structured: null,
  studentNotes: "Some notes",
  createdAt: { toMillis: () => new Date("2024-03-01").getTime() },
  status: "active",
  acceptedPatches: [{ opId: "p1" }],
  changesCount: 3,
  method: "change-approval",
});

const makeStructuredResume = () => ({
  id: "resume123",
  jobContext: {
    jobTitle: "Backend Engineer",
    jobDescription: "Build Node APIs.",
  },
  tailoredText: null,
  structured: {
    summary: { text: "Experienced dev." },
    skills: { items: ["Node.js"] },
    experience: [],
    projects: [],
  },
  studentNotes: "",
  createdAt: { toMillis: () => new Date("2024-03-01").getTime() },
  status: "active",
  acceptedPatches: [],
  method: null,
});

const renderPage = () =>
  render(
    <BrowserRouter>
      <TailoredResumeViewPage />
    </BrowserRouter>
  );

describe("TailoredResumeViewPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(authUtils.getCurrentUser).mockReturnValue(mockUser as any);
    vi.mocked(authUtils.getIdToken).mockResolvedValue("mock-token");
  });

  it("redirects to login when no user", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue(null);
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;
    renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login"));
  });

  it("shows loading spinner initially", () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;
    renderPage();
    expect(screen.getByRole("progressbar")).toBeDefined();
  });

  it("shows error state when fetch fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Failed to load tailored resume")).toBeDefined()
    );
    expect(screen.getByRole("button", { name: /back to resumes/i })).toBeDefined();
  });

  it("navigates back from error state", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /back to resumes/i }));
    fireEvent.click(screen.getByRole("button", { name: /back to resumes/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/tailored-resumes");
  });

  it("renders plain-text format resume", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: makePlainTextResume() }),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText("Frontend Engineer").length).toBeGreaterThan(0)
    );
    expect(screen.getByText("My tailored resume text.")).toBeDefined();
  });

  it("shows change-approval banner with count", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: makePlainTextResume() }),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/tailored with 3 approved changes/i)).toBeDefined()
    );
  });

  it("renders structured format resume", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: makeStructuredResume() }),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText("Backend Engineer").length).toBeGreaterThan(0)
    );
    // Should show formatted text for structured resume
    expect(screen.getByText(/experienced dev/i)).toBeDefined();
  });

  it("shows job context section", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: makePlainTextResume() }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("Job Context")).toBeDefined());
    expect(screen.getByText(/react, typescript/i)).toBeDefined();
  });

  it("shows notes in non-editing mode (disabled)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: makePlainTextResume() }),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/add any notes/i)).toBeDefined()
    );
    expect(screen.getByPlaceholderText(/add any notes/i).closest("textarea") ??
           screen.getByDisplayValue("Some notes")).toBeDefined();
  });

  it("enables editing when Edit button clicked (plain text)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: makePlainTextResume() }),
    });
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
  });

  it("cancels editing and returns to view mode", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: makePlainTextResume() }),
    });
    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /edit/i })));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /edit/i })).toBeDefined());
  });

  it("saves edits successfully and shows success message", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: makePlainTextResume() }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /edit/i })));

    // Change text
    const textarea = screen.getByPlaceholderText(/edit your resume text/i);
    fireEvent.change(textarea, { target: { value: "Updated resume content." } });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(screen.getByText("Resume updated successfully!")).toBeDefined()
    );
  });

  it("shows error when save fails", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: makePlainTextResume() }),
      })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    renderPage();
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /edit/i })));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(screen.getByText("Failed to save edits")).toBeDefined());
  });

  it("triggers download when Download button clicked", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: makePlainTextResume() }),
    });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /download/i }));

    // Mock URL and DOM methods AFTER rendering so React can mount
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi.fn();
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((el: any) => {
      el.click = clickSpy;
      return el;
    });
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation(() => ({} as any));

    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("navigates back to resumes list from header back button", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: makePlainTextResume() }),
    });
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /back to resumes/i }));
    fireEvent.click(screen.getByRole("button", { name: /back to resumes/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/tailored-resumes");
  });
});
