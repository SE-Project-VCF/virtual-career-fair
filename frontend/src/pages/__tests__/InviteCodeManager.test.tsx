import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import InviteCodeManager from "../InviteCodeManager";

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
  },
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

// Import after mocking
import { authUtils } from "../../utils/auth";
import * as firestore from "firebase/firestore";

const renderInviteCodeManager = () => {
  return render(
    <BrowserRouter>
      <InviteCodeManager />
    </BrowserRouter>
  );
};

describe("InviteCodeManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "company-1",
      role: "company",
      email: "owner@company.com",
      companyName: "Tech Corp",
    });
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        inviteCode: "INVITE123",
        companyName: "Tech Corp",
      }),
    });
  });

  // Authentication and Authorization Tests
  it("redirects to dashboard when user is not a company", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "student-1",
      role: "student",
      email: "student@example.com",
    });
    renderInviteCodeManager();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("calls getCurrentUser on mount", async () => {
    renderInviteCodeManager();

    await waitFor(() => {
      expect(authUtils.getCurrentUser).toHaveBeenCalled();
    });
  });

  // Page Rendering Tests
  it("renders invite code manager page with title", async () => {
    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText("Invite Code Manager")).toBeInTheDocument();
    });
  });

  it("displays company name in page", async () => {
    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText(/Tech Corp - Invite Code/)).toBeInTheDocument();
    });
  });

  it("displays back button that navigates to dashboard", async () => {
    const user = userEvent.setup();
    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText("Invite Code Manager")).toBeInTheDocument();
    });

    // Find the back button by looking for it near the title
    const buttons = screen.getAllByRole("button");
    // The first button should be the back arrow button
    await user.click(buttons[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  // Invite Code Display Tests
  it("displays invite code in disabled text field", async () => {
    renderInviteCodeManager();

    await waitFor(() => {
      const input = screen.getByDisplayValue("INVITE123");
      expect(input).toBeInTheDocument();
      expect(input).toBeDisabled();
    });
  });

  it("displays invite code label", async () => {
    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByLabelText(/Your Invite Code/)).toBeInTheDocument();
    });
  });

  it("loads company data from firestore on mount", async () => {
    renderInviteCodeManager();

    await waitFor(() => {
      expect(firestore.getDoc).toHaveBeenCalled();
    });
  });

  // Clipboard Functionality Tests
  it("copies invite code to clipboard when copy button is clicked", async () => {
    const user = userEvent.setup();
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, "clipboard", {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });

    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText(/Tech Corp - Invite Code/)).toBeInTheDocument();
    });

    const copyButton = screen.getByRole("button", {
      name: /copy invite code/i,
    });
    await user.click(copyButton);

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalledWith("INVITE123");
    });
  });

  it("shows success message after copying invite code", async () => {
    const user = userEvent.setup();
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, "clipboard", {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });

    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText(/Tech Corp - Invite Code/)).toBeInTheDocument();
    });

    const copyButton = screen.getByRole("button", {
      name: /copy invite code/i,
    });
    await user.click(copyButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Invite code copied to clipboard/)
      ).toBeInTheDocument();
    });
  });

  it("shows error message when clipboard copy fails", async () => {
    const user = userEvent.setup();
    const mockClipboard = {
      writeText: vi.fn().mockRejectedValue(new Error("Clipboard error")),
    };
    Object.defineProperty(navigator, "clipboard", {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });

    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText(/Tech Corp - Invite Code/)).toBeInTheDocument();
    });

    const copyButton = screen.getByRole("button", {
      name: /copy invite code/i,
    });
    await user.click(copyButton);

    await waitFor(() => {
      expect(screen.getByText(/Failed to copy to clipboard/)).toBeInTheDocument();
    });
  });

  // Instructions Section Tests
  it("displays instructions section with title", async () => {
    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText(/How to Use Your Invite Code/)).toBeInTheDocument();
    });
  });

  it("displays all 5 steps in instructions", async () => {
    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText(/Step 1:/)).toBeInTheDocument();
      expect(screen.getByText(/Step 2:/)).toBeInTheDocument();
      expect(screen.getByText(/Step 3:/)).toBeInTheDocument();
      expect(screen.getByText(/Step 4:/)).toBeInTheDocument();
      expect(screen.getByText(/Step 5:/)).toBeInTheDocument();
    });
  });

  it("displays copy instructions button", async () => {
    renderInviteCodeManager();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Copy Instructions/ })
      ).toBeInTheDocument();
    });
  });

  // Copy Instructions Functionality Tests
  it("copies instructions to clipboard when copy instructions button is clicked", async () => {
    const user = userEvent.setup();
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, "clipboard", {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });

    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText(/How to Use Your Invite Code/)).toBeInTheDocument();
    });

    const copyInstructionsButton = screen.getByRole("button", {
      name: /Copy Instructions/,
    });
    await user.click(copyInstructionsButton);

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalled();
      const callArgs = (mockClipboard.writeText as any).mock.calls[0][0];
      expect(callArgs).toContain("Share this invite code");
      expect(callArgs).toContain("INVITE123");
    });
  });

  it("shows success message after copying instructions", async () => {
    const user = userEvent.setup();
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, "clipboard", {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });

    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText(/How to Use Your Invite Code/)).toBeInTheDocument();
    });

    const copyInstructionsButton = screen.getByRole("button", {
      name: /Copy Instructions/,
    });
    await user.click(copyInstructionsButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Instructions copied to clipboard/)
      ).toBeInTheDocument();
    });
  });

  // Security Note Tests
  it("displays security note about keeping invite code private", async () => {
    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText(/Security Note/)).toBeInTheDocument();
      expect(screen.getByText(/Keep your invite code private/)).toBeInTheDocument();
      expect(screen.getByText(/authorized representatives/)).toBeInTheDocument();
    });
  });

  // Error Handling Tests
  it("displays error message when company profile not found", async () => {
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    });

    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText(/Company profile not found/)).toBeInTheDocument();
    });
  });

  it("displays error message when firestore fetch fails", async () => {
    (firestore.getDoc as any).mockRejectedValue(
      new Error("Firestore error")
    );

    renderInviteCodeManager();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load invite code/)).toBeInTheDocument();
    });
  });
});
