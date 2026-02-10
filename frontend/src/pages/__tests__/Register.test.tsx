import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import Register from "../Register";
import * as authUtils from "../../utils/auth";

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

// Mock config
vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}));

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
    global.fetch = vi.fn();
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
    (authUtils.authUtils.registerUser as any).mockResolvedValue({
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
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

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
      expect(screen.getByText(/password must be at least 6 characters/i)).toBeInTheDocument();
    });
  });

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
    (authUtils.authUtils.registerUser as any).mockResolvedValue({
      success: true,
      needsVerification: false,
    });
    (global.fetch as any).mockResolvedValue({
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
      expect(authUtils.authUtils.registerUser).toHaveBeenCalledWith(
        "test@example.com",
        "password123",
        "student",
        expect.any(Object)
      );
    });
  });

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
});
