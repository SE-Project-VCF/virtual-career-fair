import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import JobApplicationFormDialog from "../JobApplicationFormDialog"
import type { ApplicationForm } from "../../types/applicationForm"

/* ---- Firebase mocks ---- */
vi.mock("../../firebase", () => ({
  db: {},
  storage: {},
}))

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: "new-app-id" }),
}))

vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
}))

/* ---- helpers ---- */
function makeForm(overrides?: Partial<ApplicationForm>): ApplicationForm {
  return {
    title: "Test Application Form",
    description: "Please fill this out",
    status: "published",
    fields: [],
    ...overrides,
  }
}

const mockJob = {
  id: "job-1",
  companyId: "company-1",
  name: "Software Engineer",
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  job: { ...mockJob, applicationForm: makeForm() },
  studentId: "student-1",
}

beforeEach(() => vi.clearAllMocks())

describe("JobApplicationFormDialog", () => {
  describe("Guard conditions", () => {
    it("renders nothing when form is null", () => {
      const { container } = render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{ ...mockJob, applicationForm: null }}
        />
      )
      expect(container).toBeEmptyDOMElement()
    })

    it("renders nothing when form status is draft", () => {
      const { container } = render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{ ...mockJob, applicationForm: makeForm({ status: "draft" }) }}
        />
      )
      expect(container).toBeEmptyDOMElement()
    })

    it("renders nothing when open is false", () => {
      const { container } = render(
        <JobApplicationFormDialog {...defaultProps} open={false} />
      )
      expect(container).toBeEmptyDOMElement()
    })
  })

  describe("Rendering", () => {
    it("renders the form title in dialog header", () => {
      render(<JobApplicationFormDialog {...defaultProps} />)
      expect(screen.getByText("Test Application Form")).toBeInTheDocument()
    })

    it("renders the form description", () => {
      render(<JobApplicationFormDialog {...defaultProps} />)
      expect(screen.getByText("Please fill this out")).toBeInTheDocument()
    })

    it("renders Submit Application button", () => {
      render(<JobApplicationFormDialog {...defaultProps} />)
      expect(screen.getByRole("button", { name: /submit application/i })).toBeInTheDocument()
    })

    it("renders Close button", () => {
      render(<JobApplicationFormDialog {...defaultProps} />)
      expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument()
    })
  })

  describe("Field label rendering", () => {
    it("renders shortText field label as text above the input, not inside it", () => {
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [{ id: "f1", type: "shortText", label: "Your name", required: false }],
            }),
          }}
        />
      )
      // Label must appear as a Typography element separate from the input
      expect(screen.getByText("Your name")).toBeInTheDocument()
      // The input itself should NOT have a label prop (no floating MUI label)
      const input = screen.getByRole("textbox")
      expect(input).not.toHaveAttribute("id", expect.stringContaining("label"))
    })

    it("renders longText field label as text above the textarea", () => {
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [{ id: "f1", type: "longText", label: "Describe yourself", required: false }],
            }),
          }}
        />
      )
      expect(screen.getByText("Describe yourself")).toBeInTheDocument()
    })

    it("shows required asterisk for required fields", () => {
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [{ id: "f1", type: "shortText", label: "Full name", required: true }],
            }),
          }}
        />
      )
      expect(screen.getByText("Full name")).toBeInTheDocument()
      expect(screen.getByText("*")).toBeInTheDocument()
    })

    it("does not show asterisk for non-required fields", () => {
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [{ id: "f1", type: "shortText", label: "Optional note", required: false }],
            }),
          }}
        />
      )
      expect(screen.getByText("Optional note")).toBeInTheDocument()
      expect(screen.queryByText("*")).not.toBeInTheDocument()
    })

    it("renders singleSelect field label above the select control", () => {
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [
                { id: "f1", type: "singleSelect", label: "Experience level", required: false, options: ["Junior", "Senior"] },
              ],
            }),
          }}
        />
      )
      expect(screen.getByText("Experience level")).toBeInTheDocument()
    })

    it("renders multiSelect field label above the select control", () => {
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [
                { id: "f1", type: "multiSelect", label: "Skills", required: false, options: ["React", "Node"] },
              ],
            }),
          }}
        />
      )
      expect(screen.getByText("Skills")).toBeInTheDocument()
    })

    it("renders checkbox field label above the checkbox", () => {
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [{ id: "f1", type: "checkbox", label: "Agree to terms", required: false }],
            }),
          }}
        />
      )
      expect(screen.getByText("Agree to terms")).toBeInTheDocument()
    })

    it("renders file field label above the file input", () => {
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [{ id: "f1", type: "file", label: "Upload resume", required: false }],
            }),
          }}
        />
      )
      expect(screen.getByText("Upload resume")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /choose file/i })).toBeInTheDocument()
    })
  })

  describe("Field interaction", () => {
    it("updates shortText field value on input", async () => {
      const user = userEvent.setup()
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [{ id: "f1", type: "shortText", label: "Name", required: false }],
            }),
          }}
        />
      )

      const input = screen.getByRole("textbox")
      await user.type(input, "Alice")
      expect(input).toHaveValue("Alice")
    })

    it("updates longText field value on input", async () => {
      const user = userEvent.setup()
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [{ id: "f1", type: "longText", label: "Bio", required: false }],
            }),
          }}
        />
      )

      const textarea = screen.getByRole("textbox")
      await user.type(textarea, "Hello world")
      expect(textarea).toHaveValue("Hello world")
    })

    it("toggles checkbox field on click", async () => {
      const user = userEvent.setup()
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [{ id: "f1", type: "checkbox", label: "I agree", required: false }],
            }),
          }}
        />
      )

      const checkbox = screen.getByRole("checkbox")
      expect(checkbox).not.toBeChecked()
      await user.click(checkbox)
      expect(checkbox).toBeChecked()
    })
  })

  describe("Submit button state", () => {
    it("disables Submit button when a required field is empty", () => {
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [{ id: "f1", type: "shortText", label: "Name", required: true }],
            }),
          }}
        />
      )
      expect(screen.getByRole("button", { name: /submit application/i })).toBeDisabled()
    })

    it("enables Submit button when all required fields are filled", async () => {
      const user = userEvent.setup()
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{
            ...mockJob,
            applicationForm: makeForm({
              fields: [{ id: "f1", type: "shortText", label: "Name", required: true }],
            }),
          }}
        />
      )

      const input = screen.getByRole("textbox")
      await user.type(input, "Alice")

      expect(screen.getByRole("button", { name: /submit application/i })).toBeEnabled()
    })

    it("enables Submit button when there are no fields", () => {
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{ ...mockJob, applicationForm: makeForm({ fields: [] }) }}
        />
      )
      expect(screen.getByRole("button", { name: /submit application/i })).toBeEnabled()
    })
  })

  describe("Submission flow", () => {
    it("shows success message after successful submission", async () => {
      const user = userEvent.setup()
      render(
        <JobApplicationFormDialog
          {...defaultProps}
          job={{ ...mockJob, applicationForm: makeForm({ fields: [] }) }}
        />
      )

      await user.click(screen.getByRole("button", { name: /submit application/i }))

      await waitFor(() => {
        expect(screen.getByText(/application submitted successfully/i)).toBeInTheDocument()
      })
    })

    it("calls onClose when Close is clicked", async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<JobApplicationFormDialog {...defaultProps} onClose={onClose} />)

      await user.click(screen.getByRole("button", { name: /close/i }))
      expect(onClose).toHaveBeenCalled()
    })
  })
})
