import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import TailoredResumesPage from "../TailoredResumesPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
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
  formatResumeAsText: vi.fn(() => "formatted resume text"),
}));

import { authUtils } from "../../utils/auth";

const mockUser = { uid: "user1", email: "student@test.com" };

const makeResume = (id: string, jobTitle: string) => ({
  id,
  jobContext: {
    jobTitle,
    jobDescription: "A job description that is fairly long and descriptive.",
  },
  structured: { summary: { text: "Summary" } },
  studentNotes: "",
  createdAt: { toMillis: () => new Date("2024-01-15").getTime() },
  status: "active",
  expiresAt: null,
  acceptedPatches: [{ opId: "p1" }, { opId: "p2" }],
});

const renderPage = () =>
  render(
    <BrowserRouter>
      <TailoredResumesPage />
    </BrowserRouter>
  );

describe("TailoredResumesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authUtils.getCurrentUser).mockReturnValue(mockUser as any);
    vi.mocked(authUtils.getIdToken).mockResolvedValue("mock-token");
  });

  it("redirects to login when no user", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue(null);
    // Component returns null when !user, no fetch is made
    globalThis.fetch = vi.fn();
    renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login"));
  });

  it("shows loading spinner initially", () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByRole("progressbar")).toBeDefined();
  });

  it("shows empty state when no resumes", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resumes: [] }),
    });
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText(/you haven't created any tailored resumes yet/i)
      ).toBeDefined()
    );
  });

  it("renders resume cards when resumes are loaded", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resumes: [makeResume("r1", "Frontend Engineer"), makeResume("r2", "Backend Dev")],
      }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("Frontend Engineer")).toBeDefined());
    expect(screen.getByText("Backend Dev")).toBeDefined();
  });

  it("shows patches applied count", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resumes: [makeResume("r1", "SWE")] }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("2 Patches Applied")).toBeDefined());
  });

  it("shows error alert when fetch fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Failed to fetch tailored resumes")).toBeDefined()
    );
  });

  it("navigates to tailored resume view when view icon clicked", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resumes: [makeResume("r1", "SWE")] }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByTitle("View Resume")).toBeDefined());
    fireEvent.click(screen.getByTitle("View Resume"));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/tailored-resume/r1");
  });

  it("opens delete confirmation dialog when delete icon clicked", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resumes: [makeResume("r1", "SWE")] }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByTitle("Delete Resume")).toBeDefined());
    fireEvent.click(screen.getByTitle("Delete Resume"));
    expect(screen.getByText("Delete Tailored Resume?")).toBeDefined();
  });

  it("cancels delete dialog without deleting", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resumes: [makeResume("r1", "SWE")] }),
    });
    renderPage();
    await waitFor(() => fireEvent.click(screen.getByTitle("Delete Resume")));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() =>
      expect(screen.queryByText("Delete Tailored Resume?")).toBeNull()
    );
  });

  it("deletes resume and removes it from list", async () => {
    let deleteCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      if (opts?.method === "DELETE") {
        deleteCount++;
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ resumes: [makeResume("r1", "SWE")] }),
      });
    });
    renderPage();
    await waitFor(() => fireEvent.click(screen.getByTitle("Delete Resume")));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(deleteCount).toBe(1));
    await waitFor(() => expect(screen.queryByText("SWE")).toBeNull());
  });

  it("shows error when delete fails", async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts: any) => {
      if (opts?.method === "DELETE") {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ resumes: [makeResume("r1", "SWE")] }),
      });
    });
    renderPage();
    await waitFor(() => fireEvent.click(screen.getByTitle("Delete Resume")));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(screen.getByText("Failed to delete resume")).toBeDefined());
  });

  it("navigates to job invitations when Back is clicked", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resumes: [] }),
    });
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /back/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/job-invitations");
  });

  it("triggers download when download icon clicked", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resumes: [makeResume("r1", "SWE")] }),
    });

    // Mock URL.createObjectURL and anchor click
    const createObjectURL = vi.fn(() => "blob:fake-url");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis, "URL", {
      value: { createObjectURL, revokeObjectURL },
      writable: true,
    });

    const clickSpy = vi.fn();
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((el: any) => {
      el.click = clickSpy;
      return el;
    });
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation(() => ({} as any));

    renderPage();
    await waitFor(() => expect(screen.getByTitle("Download Resume")).toBeDefined());
    fireEvent.click(screen.getByTitle("Download Resume"));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();

    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("shows notes preview when studentNotes present", async () => {
    const resumeWithNotes = {
      ...makeResume("r1", "SWE"),
      studentNotes: "These are my custom notes.",
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resumes: [resumeWithNotes] }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("These are my custom notes.")).toBeDefined());
  });

  it("shows expiry chip when expiresAt is present", async () => {
    const resumeExpiring = {
      ...makeResume("r1", "SWE"),
      expiresAt: { toMillis: () => new Date("2099-12-31").getTime() },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resumes: [resumeExpiring] }),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/expires:/i)).toBeDefined()
    );
  });
});
