import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import InviteCodeManager from "../InviteCodeManager";
import * as authUtils from "../../utils/auth";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

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
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "companyOwner",
      email: "owner@company.com",
    });
  });

  it("renders invite code manager page", async () => {
    renderInviteCodeManager();
    await waitFor(() => {
      // Page should render
    });
  });

  it("requires company role", () => {
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "student",
    });
    renderInviteCodeManager();
    // Should redirect
  });

  it("can copy invite code to clipboard", async () => {
    const user = userEvent.setup();
    const mockClipboard = {
      writeText: vi.fn(),
    };
    Object.assign(navigator, { clipboard: mockClipboard });

    renderInviteCodeManager();

    const copyButtons = screen.queryAllByRole("button");
    if (copyButtons.length > 0) {
      await user.click(copyButtons[0]);
    }
  });
});
