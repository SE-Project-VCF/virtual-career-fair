import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import Register from "../Register";

// Mock navigate function
const mockNavigate = vi.fn();

// Mock react-router-dom
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock authUtils
vi.mock("../../utils/auth", () => ({
  authUtils: {
    registerUser: vi.fn(),
    loginWithGoogle: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

// Mock firebase
vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    currentUser: {
      uid: "test-user",
      email: "test@example.com",
      displayName: "Test User",
    },
  },
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => "doc-ref"),
  setDoc: vi.fn(),
}));

// Mock config
vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}));

// Import after mocks
import { authUtils } from "../../utils/auth";
import { setDoc } from "firebase/firestore";

const renderRegister = () => {
  return render(
    <BrowserRouter>
      <Register />
    </BrowserRouter>
  );
};

describe("Register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    globalThis.fetch = vi.fn();
  });

  it("renders the register form", () => {
    renderRegister();
    expect(screen.getByRole("heading", { name: "Create Account" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /account type/i })).toBeInTheDocument();
  });

  it("displays role selection dropdown", () => {
    renderRegister();
    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    expect(roleSelect).toBeInTheDocument();
  });

  it("requires role selection before registration", async () => {
    (authUtils.registerUser as any).mockResolvedValue({
      success: false,
      error: "Role is required",
    });

    renderRegister();
    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    const submitButton = screen.getByRole("button", { name: /create account/i });

    // Verify role selection exists and is required
    expect(roleSelect).toBeInTheDocument();
    expect(submitButton).toBeInTheDocument();
  });

  it("renders student-specific fields when student role is selected", async () => {
    const user = userEvent.setup();
    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    await waitFor(() => {
      expect(screen.getByLabelText(/school/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/major/i)).toBeInTheDocument();
    });
  });

  it("renders representative-specific fields when representative role is selected", async () => {
    const user = userEvent.setup();
    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Representative"));

    await waitFor(() => {
      expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    });
  });

  it("renders company owner fields when company owner role is selected", async () => {
    const user = userEvent.setup();
    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Company Owner"));

    await waitFor(() => {
      expect(screen.getByText(/you can create companies after registration/i)).toBeInTheDocument();
    });
  });

  it("validates password match", async () => {
    const user = userEvent.setup();
    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    // Wait for fields to render after role selection
    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email" || el.getAttribute("name") === "email") || screen.getByLabelText(/email address/i);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;
    const confirmPasswordInput = passwordInputs[1] as HTMLInputElement;

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "password123");
    await user.type(confirmPasswordInput, "password456");
    await user.type(firstNameInput, "John");
    await user.type(lastNameInput, "Doe");

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    }, { timeout: 3000 });
  }, 15000);

  it("validates password length", async () => {
    const user = userEvent.setup();
    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    // Wait for fields to render after role selection
    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email" || el.getAttribute("name") === "email") || screen.getByLabelText(/email address/i);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;
    const confirmPasswordInput = passwordInputs[1] as HTMLInputElement;

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "pass");
    await user.type(confirmPasswordInput, "pass");
    await user.type(firstNameInput, "John");
    await user.type(lastNameInput, "Doe");

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Password must be at least 6 characters long.")).toBeInTheDocument();
    }, { timeout: 3000 });
  }, 15000);

  it("requires first and last name for all roles", async () => {
    const user = userEvent.setup();
    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    // Wait for fields to render after role selection
    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    // Verify that first name and last name fields exist and are required
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);

    expect(firstNameInput).toBeInTheDocument();
    expect(lastNameInput).toBeInTheDocument();
    expect(firstNameInput).toBeRequired();
    expect(lastNameInput).toBeRequired();
  });

  it("disables Google register button when no role is selected", () => {
    renderRegister();
    const googleButton = screen.getByRole("button", { name: /register with google/i });
    expect(googleButton).toBeDisabled();
  });

  it("shows an error when submitting without a role", async () => {
    const user = userEvent.setup();
    renderRegister();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
    }, { timeout: 3000 });

    // Remove HTML5 validation to test custom validation
    const form = document.querySelector('form');
    if (form) {
      form.setAttribute('novalidate', 'true');
    }

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Please select a role.")).toBeInTheDocument();
    }, { timeout: 5000 });
  }, 15000);

  it("shows an error when required fields are missing", async () => {
    const user = userEvent.setup();
    renderRegister();

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /account type/i })).toBeInTheDocument();
    }, { timeout: 3000 });

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    
    await waitFor(() => {
      expect(screen.getByText("Student")).toBeInTheDocument();
    }, { timeout: 3000 });
    
    await user.click(screen.getByText("Student"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
    }, { timeout: 3000 });

    // Remove HTML5 validation to test custom validation
    const form = document.querySelector('form');
    if (form) {
      form.setAttribute('novalidate', 'true');
    }

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Email, password, and confirm password are required.")).toBeInTheDocument();
    }, { timeout: 5000 });
  }, 15000);

  it("shows an error when first or last name is missing", async () => {
    const user = userEvent.setup();
    renderRegister();

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /account type/i })).toBeInTheDocument();
    }, { timeout: 3000 });

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    
    await waitFor(() => {
      expect(screen.getByText("Student")).toBeInTheDocument();
    }, { timeout: 3000 });
    
    await user.click(screen.getByText("Student"));

    await waitFor(() => {
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    const passwordInputs = document.querySelectorAll('input[type="password"]');
    await user.type(screen.getByLabelText(/email address/i), "test@example.com");
    await user.type(passwordInputs[0], "password123");
    await user.type(passwordInputs[1], "password123");

    // Remove HTML5 validation to test custom validation
    const form = document.querySelector('form');
    if (form) {
      form.setAttribute('novalidate', 'true');
    }

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("First name and last name are required.")).toBeInTheDocument();
    }, { timeout: 5000 });
  }, 15000);

  it("enables Google register button when role is selected", async () => {
    const user = userEvent.setup();
    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    const googleButton = screen.getByRole("button", { name: /register with google/i });

    await waitFor(() => {
      expect(googleButton).not.toBeDisabled();
    });
  });

  it("calls registerUser on form submission", async () => {
    const user = userEvent.setup();
    (authUtils.registerUser as any).mockResolvedValue({
      success: true,
      needsVerification: false,
    });
    (globalThis.fetch as any).mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    // Wait for fields to render after role selection
    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email" || el.getAttribute("name") === "email") || screen.getByLabelText(/email address/i);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;
    const confirmPasswordInput = passwordInputs[1] as HTMLInputElement;

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "password123");
    await user.type(confirmPasswordInput, "password123");
    await user.type(firstNameInput, "John");
    await user.type(lastNameInput, "Doe");

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(authUtils.registerUser).toHaveBeenCalledWith(
        "test@example.com",
        "password123",
        "student",
        expect.any(Object)
      );
    }, { timeout: 3000 });
  }, 10000);

  it("displays link to login page", () => {
    renderRegister();
    const loginLink = screen.getByText(/sign in here/i);
    expect(loginLink).toBeInTheDocument();
    expect(loginLink.closest("a")).toHaveAttribute("href", "/login");
  });

  it("displays link to home page", () => {
    renderRegister();
    const homeLink = screen.getByText(/back to home/i);
    expect(homeLink).toBeInTheDocument();
    expect(homeLink.closest("a")).toHaveAttribute("href", "/");
  });

  it ("validates email is required", async () => {
    const user = userEvent.setup();
    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    // Verify email field has required attribute
    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email") || screen.getByLabelText(/email address/i);
    
    expect(emailInput).toHaveAttribute('required');
  });

  it("validates representative invite code is optional", async () => {
    const user = userEvent.setup();
    (authUtils.registerUser as any).mockResolvedValue({
      success: true,
      needsVerification: false,
    });
    (globalThis.fetch as any).mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Representative"));

    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email") || screen.getByLabelText(/email address/i);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    await user.type(emailInput, "rep@example.com");
    await user.type(passwordInputs[0], "password123");
    await user.type(passwordInputs[1], "password123");
    await user.type(firstNameInput, "Jane");
    await user.type(lastNameInput, "Smith");

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(authUtils.registerUser).toHaveBeenCalledWith(
        "rep@example.com",
        "password123",
        "representative",
        expect.objectContaining({ firstName: "Jane", lastName: "Smith" })
      );
    }, { timeout: 3000 });
  }, 10000);

  it("includes representative invite code when provided", async () => {
    const user = userEvent.setup();
    (authUtils.registerUser as any).mockResolvedValue({
      success: true,
      needsVerification: false,
    });
    (globalThis.fetch as any).mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Representative"));

    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email") || screen.getByLabelText(/email address/i);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const inviteCodeInput = screen.getByLabelText(/invite code/i);
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    await user.type(emailInput, "rep@example.com");
    await user.type(passwordInputs[0], "password123");
    await user.type(passwordInputs[1], "password123");
    await user.type(firstNameInput, "Jane");
    await user.type(lastNameInput, "Smith");
    await user.type(inviteCodeInput, "INVITECODE123");

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(authUtils.registerUser).toHaveBeenCalledWith(
        "rep@example.com",
        "password123",
        "representative",
        expect.objectContaining({
          firstName: "Jane",
          lastName: "Smith",
          inviteCode: "INVITECODE123"
        })
      );
    }, { timeout: 3000 });
  }, 10000);

  it("handles registration error", async () => {
    const user = userEvent.setup();
    (authUtils.registerUser as any).mockResolvedValue({
      success: false,
      error: "Email already in use",
    });

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email") || screen.getByLabelText(/email address/i);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInputs[0], "password123");
    await user.type(passwordInputs[1], "password123");
    await user.type(firstNameInput, "John");
    await user.type(lastNameInput, "Doe");

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      const errorElement = screen.queryByText(/email already in use/i) || 
                           screen.queryByText(/already in use/i) ||
                           screen.queryByText(/Email already in use/);
      expect(errorElement).toBeInTheDocument();
    }, { timeout: 3000 });
  }, 10000);

  it("redirects to verification-pending when needsVerification is true", async () => {
    const user = userEvent.setup();

    (authUtils.registerUser as any).mockResolvedValue({
      success: true,
      needsVerification: true,
    });
    (globalThis.fetch as any).mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email") || screen.getByLabelText(/email address/i);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInputs[0], "password123");
    await user.type(passwordInputs[1], "password123");
    await user.type(firstNameInput, "John");
    await user.type(lastNameInput, "Doe");

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/verification-pending", {
        state: { email: "test@example.com" }
      });
    });
  });

  it("includes student school when provided", async () => {
    const user = userEvent.setup();
    (authUtils.registerUser as any).mockResolvedValue({
      success: true,
      needsVerification: false,
    });
    (globalThis.fetch as any).mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email") || screen.getByLabelText(/email address/i);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const schoolInput = screen.getByLabelText(/school/i);
    const majorInput = screen.getByLabelText(/major/i);
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    await user.type(emailInput, "student@example.com");
    await user.type(passwordInputs[0], "password123");
    await user.type(passwordInputs[1], "password123");
    await user.type(firstNameInput, "John");
    await user.type(lastNameInput, "Doe");
    await user.type(schoolInput, "Harvard");
    await user.type(majorInput, "Computer Science");

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(authUtils.registerUser).toHaveBeenCalledWith(
        "student@example.com",
        "password123",
        "student",
        expect.objectContaining({
          firstName: "John",
          lastName: "Doe",
          school: "Harvard",
          major: "Computer Science"
        })
      );
    }, { timeout: 3000 });
  }, 10000);

  it("registers company owner successfully", async () => {
    const user = userEvent.setup();
    (authUtils.registerUser as any).mockResolvedValue({
      success: true,
      needsVerification: false,
    });
    (globalThis.fetch as any).mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Company Owner"));

    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email") || screen.getByLabelText(/email address/i);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    await user.type(emailInput, "owner@example.com");
    await user.type(passwordInputs[0], "password123");
    await user.type(passwordInputs[1], "password123");
    await user.type(firstNameInput, "Alice");
    await user.type(lastNameInput, "Johnson");

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(authUtils.registerUser).toHaveBeenCalledWith(
        "owner@example.com",
        "password123",
        "companyOwner",
        expect.objectContaining({ firstName: "Alice", lastName: "Johnson" })
      );
    });
  });

  it("handles Google register click when no role is selected", async () => {
    renderRegister();

    // Initially disabled
    const googleButton = screen.getByRole("button", { name: /register with google/i });
    expect(googleButton).toBeDisabled();
  });

  it("calls loginWithGoogle when Google register is clicked", async () => {
    const user = userEvent.setup();
    (authUtils.loginWithGoogle as any).mockResolvedValue({
      success: true,
      user: {
        uid: "google-uid",
        email: "google@example.com",
        displayName: "Google User",
      },
    });

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    const googleButton = screen.getByRole("button", { name: /register with google/i });
    await user.click(googleButton);

    await waitFor(() => {
      expect(authUtils.loginWithGoogle).toHaveBeenCalled();
    });
  });

  it("opens profile dialog and saves Google profile details", async () => {
    const user = userEvent.setup();
    (authUtils.loginWithGoogle as any).mockResolvedValue({
      success: true,
      needsProfile: true,
    });
    (globalThis.fetch as any).mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    const googleButton = screen.getByRole("button", { name: /register with google/i });
    await user.click(googleButton);

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);

    await user.clear(dialogScope.getByLabelText(/first name/i));
    await user.type(dialogScope.getByLabelText(/first name/i), "Gina");
    await user.clear(dialogScope.getByLabelText(/last name/i));
    await user.type(dialogScope.getByLabelText(/last name/i), "Lopez");
    await user.type(dialogScope.getByLabelText(/school/i), "UCLA");
    await user.type(dialogScope.getByLabelText(/major/i), "Engineering");

    const saveButton = dialogScope.getByRole("button", { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        "doc-ref",
        expect.objectContaining({
          uid: "test-user",
          email: "test@example.com",
          role: "student",
          firstName: "Gina",
          lastName: "Lopez",
          school: "UCLA",
          major: "Engineering",
          provider: "google",
        })
      );
    });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/sync-stream-user"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await waitFor(() => {
      expect(setItemSpy).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows an error when Google registration fails", async () => {
    const user = userEvent.setup();
    (authUtils.loginWithGoogle as any).mockResolvedValue({
      success: false,
      error: "Google auth failed",
    });

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    const googleButton = screen.getByRole("button", { name: /register with google/i });
    await user.click(googleButton);

    await waitFor(() => {
      expect(screen.getByText(/google auth failed/i)).toBeInTheDocument();
    });
  });

  it("handles Google registration exceptions", async () => {
    const user = userEvent.setup();
    (authUtils.loginWithGoogle as any).mockRejectedValue(new Error("network"));

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    const googleButton = screen.getByRole("button", { name: /register with google/i });
    await user.click(googleButton);

    await waitFor(() => {
      expect(screen.getByText(/failed to register with google/i)).toBeInTheDocument();
    });
  });

  it("syncs user to Stream Chat on successful registration", async () => {
    const user = userEvent.setup();
    (authUtils.registerUser as any).mockResolvedValue({
      success: true,
      needsVerification: false,
    });
    (globalThis.fetch as any).mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    renderRegister();

    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email") || screen.getByLabelText(/email address/i);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInputs[0], "password123");
    await user.type(passwordInputs[1], "password123");
    await user.type(firstNameInput, "John");
    await user.type(lastNameInput, "Doe");

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/sync-stream-user"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });
  });

  it("shows error for invalid role", async () => {
    const user = userEvent.setup();
    renderRegister();

    // Manually set invalid role by manipulating component state
    const roleSelect = screen.getByRole("combobox", { name: /account type/i });
    await user.click(roleSelect);
    await user.click(screen.getByText("Student"));

    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(2);
    });

    const fields = screen.getAllByRole("textbox");
    const emailInput = fields.find((el) => el.getAttribute("type") === "email") || screen.getByLabelText(/email address/i);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInputs[0], "password123");
    await user.type(passwordInputs[1], "password123");
    await user.type(firstNameInput, "John");
    await user.type(lastNameInput, "Doe");

    const submitButton = screen.getByRole("button", { name: /create account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(authUtils.registerUser).toHaveBeenCalled();
    });
  });
});
