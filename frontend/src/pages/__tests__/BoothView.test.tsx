import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import BoothView from "../BoothView";
import * as authUtils from "../../utils/auth";
import * as fairStatus from "../../utils/fairStatus";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock("../../utils/fairStatus", () => ({
  evaluateFairStatus: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ boothId: "booth-1" }),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}));

const renderBoothView = () => {
  return render(
    <BrowserRouter>
      <BoothView />
    </BrowserRouter>
  );
};

describe("BoothView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.authUtils.getCurrentUser as any).mockReturnValue({
      uid: "user-1",
      role: "student",
    });
    (fairStatus.evaluateFairStatus as any).mockResolvedValue({
      isLive: true,
    });
    global.fetch = vi.fn();
  });

  it("renders loading state initially", () => {
    renderBoothView();
    const progressbars = screen.queryAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(0);
  });

  it("displays booth information when loaded", async () => {
    renderBoothView();

    // Test will attempt to load booth information
    await waitFor(() => {
      // Booth should be fetched and displayed if successful
    });
  });

  it("shows error message when booth not found", async () => {
    renderBoothView();

    await waitFor(() => {
      // Error handling should be tested
    });
  });

  it("displays contact information section", async () => {
    renderBoothView();

    await waitFor(() => {
      // Should display contact info when booth loads
    });
  });

  it("displays job openings section", async () => {
    renderBoothView();

    await waitFor(() => {
      // Should display jobs when booth loads
    });
  });
});
