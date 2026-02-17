import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import StudentProfilePage from "../StudentProfilePage";

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
    isAuthenticated: vi.fn(),
  },
}));

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  db: {},
  storage: {},
}));

// Import after mocking
import { authUtils } from "../../utils/auth";
import * as firestore from "firebase/firestore";


const renderStudentProfile = () => {
  return render(
    <BrowserRouter>
      <StudentProfilePage />
    </BrowserRouter>
  );
};

describe("StudentProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "student-1",
      role: "student",
      email: "student@example.com",
      firstName: "John",
      lastName: "Doe",
    });
    (authUtils.isAuthenticated as any).mockReturnValue(true);
    (firestore.getDoc as any).mockResolvedValue({ exists: () => false });
  });

  // Authentication Tests
  it("requires authentication and redirects to login when not authenticated", () => {
    (authUtils.isAuthenticated as any).mockReturnValue(false);
    renderStudentProfile();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("calls isAuthenticated on mount", async () => {
    renderStudentProfile();
    await waitFor(() => {
      expect(authUtils.isAuthenticated).toHaveBeenCalled();
    });
  });

  it("calls getCurrentUser on mount", async () => {
    renderStudentProfile();
    await waitFor(() => {
      expect(authUtils.getCurrentUser).toHaveBeenCalled();
    });
  });

  it("returns null and does not render when user is null", () => {
    (authUtils.getCurrentUser as any).mockReturnValue(null);
    const { container } = renderStudentProfile();
    expect(container.firstChild).toBeNull();
  });

  // Rendering Tests
  it("renders student profile page with correct title", async () => {
    renderStudentProfile();
    await waitFor(() => {
      expect(screen.getByText("Customize Profile")).toBeInTheDocument();
    });
  });

  it("renders page header with correct text", () => {
    renderStudentProfile();
    expect(screen.getByText("Job Goblin - Virtual Career Fair")).toBeInTheDocument();
  });

  it("renders ProfileMenu component", () => {
    renderStudentProfile();
    expect(screen.getByTestId("profile-menu")).toBeInTheDocument();
  });

  // Form Fields Tests
  it("displays major input field with correct label", async () => {
    renderStudentProfile();
    await waitFor(() => {
      expect(screen.getByLabelText(/Major/)).toBeInTheDocument();
    });
  });

  it("displays graduation year input field", async () => {
    renderStudentProfile();
    await waitFor(() => {
      expect(screen.getByLabelText(/Expected Graduation Year/)).toBeInTheDocument();
    });
  });

  it("displays skills input field", async () => {
    renderStudentProfile();
    await waitFor(() => {
      expect(screen.getByLabelText(/Skills/)).toBeInTheDocument();
    });
  });

  it("displays upload resume button", () => {
    renderStudentProfile();
    expect(screen.getByText(/Upload Resume/)).toBeInTheDocument();
  });

  it("displays back button", () => {
    renderStudentProfile();
    expect(screen.getByRole("button", { name: /Back/ })).toBeInTheDocument();
  });

  it("displays save profile button", () => {
    renderStudentProfile();
    expect(screen.getByRole("button", { name: /Save Profile/ })).toBeInTheDocument();
  });

  // Form Interaction Tests
  it("allows user to type in major field", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const majorInput = await screen.findByLabelText(/Major/);
    await user.type(majorInput, "Computer Science");

    expect((majorInput as HTMLInputElement).value).toBe("Computer Science");
  });

  it("allows user to type in graduation year field", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const yearInput = await screen.findByLabelText(/Expected Graduation Year/);
    await user.type(yearInput, "2025");

    expect((yearInput as HTMLInputElement).value).toBe("2025");
  });

  it("allows user to type in skills field", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const skillsInput = await screen.findByLabelText(/Skills/);
    await user.type(skillsInput, "Python, JavaScript, React");

    expect((skillsInput as HTMLInputElement).value).toBe("Python, JavaScript, React");
  });

  // Navigation Tests
  it("navigates to dashboard when back button is clicked", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const backButton = screen.getByRole("button", { name: /Back/ });
    await user.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  // Form Submission Validation Tests
  it("shows error when major is missing on save", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const yearInput = await screen.findByLabelText(/Expected Graduation Year/);
    await user.type(yearInput, "2025");

    const form = screen.getByRole("button", { name: /Save Profile/ }).closest("form");
    if (form) {
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.queryByText(/Major and Expected Graduation Year are required/)).toBeInTheDocument();
      });
    }
  });

  it("shows error when graduation year is missing on save", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const majorInput = await screen.findByLabelText(/Major/);
    await user.type(majorInput, "Computer Science");

    const form = screen.getByRole("button", { name: /Save Profile/ }).closest("form");
    if (form) {
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.queryByText(/Major and Expected Graduation Year are required/)).toBeInTheDocument();
      });
    }
  });

  it("shows error for graduation year outside valid range", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const majorInput = await screen.findByLabelText(/Major/);
    const yearInput = await screen.findByLabelText(/Expected Graduation Year/);

    await user.type(majorInput, "Computer Science");
    await user.type(yearInput, "2020");

    const saveButton = screen.getByRole("button", { name: /Save Profile/ });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Enter a realistic graduation year/)).toBeInTheDocument();
    });
  });

  it("displays loading state while saving", async () => {
    const user = userEvent.setup();
    (firestore.setDoc as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    renderStudentProfile();

    const majorInput = await screen.findByLabelText(/Major/);
    const yearInput = await screen.findByLabelText(/Expected Graduation Year/);

    await user.type(majorInput, "Computer Science");
    await user.type(yearInput, "2025");

    const saveButton = screen.getByRole("button", { name: /Save Profile/ });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });
  });

  // Resume Upload Tests
  it("handles PDF file upload", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const file = new File(["resume content"], "resume.pdf", { type: "application/pdf" });
    const uploadInput = screen.getByRole("button", { name: /Upload Resume/ }).querySelector('input[type="file"]') as HTMLInputElement;

    if (uploadInput) {
      await user.upload(uploadInput, file);
      await waitFor(() => {
        expect(screen.getByText("resume.pdf")).toBeInTheDocument();
      });
    }
  });

  it("shows error for non-PDF file upload", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const file = new File(["resume content"], "resume.txt", { type: "text/plain" });
    const uploadButton = screen.getByRole("button", { name: /Upload Resume/ });
    const uploadInput = uploadButton.querySelector('input[type="file"]') as HTMLInputElement;

    if (uploadInput) {
      await user.upload(uploadInput, file);
      await waitFor(() => {
        expect(screen.getByText(/Only PDF files are allowed/)).toBeInTheDocument();
      });
    }
  });

  it("shows error for oversized file upload", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const largeContent = new Array(6 * 1024 * 1024).fill("a").join("");
    const file = new File([largeContent], "large.pdf", { type: "application/pdf" });
    const uploadButton = screen.getByRole("button", { name: /Upload Resume/ });
    const uploadInput = uploadButton.querySelector('input[type="file"]') as HTMLInputElement;

    if (uploadInput) {
      await user.upload(uploadInput, file);
      await waitFor(() => {
        expect(screen.getByText(/File size must be under 5MB/)).toBeInTheDocument();
      });
    }
  });

  // Existing Resume Display Tests
  it("displays existing resume link when resume URL is available", async () => {
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        major: "Computer Science",
        expectedGradYear: "2025",
        skills: "Python, React",
        resumeUrl: "https://example.com/resume.pdf",
      }),
    });

    renderStudentProfile();

    await waitFor(() => {
      expect(screen.getByText(/View Existing Resume/)).toBeInTheDocument();
    });
  });

  it("loads existing profile data on mount", async () => {
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        major: "Computer Science",
        expectedGradYear: "2025",
        skills: "Python, React",
      }),
    });

    renderStudentProfile();

    await waitFor(() => {
      expect((screen.getByLabelText(/Major/) as HTMLInputElement).value).toBe(
        "Computer Science"
      );
    });
  });
});
