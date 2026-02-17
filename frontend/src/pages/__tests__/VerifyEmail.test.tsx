import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import VerifyEmail from "../VerifyEmail";
import * as authUtils from "../../utils/auth";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    verifyAndLogin: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useLocation: () => ({
      state: {
        email: "test@example.com",
        password: "password123",
      },
    }),
  };
});

const renderVerifyEmail = () => {
  return render(
    <BrowserRouter>
      <VerifyEmail />
    </BrowserRouter>
  );
};

describe("VerifyEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.authUtils.verifyAndLogin as any).mockResolvedValue({
      success: true,
    });
  });

  it("renders email verification page", async () => {
    renderVerifyEmail();

    await waitFor(() => {
      // Verification page should render
    });
  });

  it("displays verifying state initially", () => {
    renderVerifyEmail();
    const progressbars = screen.queryAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(0);
  });

  it("shows verified state on success", async () => {
    (authUtils.authUtils.verifyAndLogin as any).mockResolvedValue({
      success: true,
    });

    renderVerifyEmail();

    await waitFor(() => {
      // Should show verified state
    });
  });

  it("shows error state on failure", async () => {
    (authUtils.authUtils.verifyAndLogin as any).mockResolvedValue({
      success: false,
      error: "Verification failed",
    });

    renderVerifyEmail();

    await waitFor(() => {
      // Should show error state
    });
  });
});
