import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ApplicationFormBuilderDialog from "../ApplicationFormBuilderDialog"
import type { ApplicationForm } from "../../types/applicationForm"

/* ---- Firebase mocks ---- */
vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    currentUser: { getIdToken: vi.fn().mockResolvedValue("mock-token") },
  },
}))

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ forEach: vi.fn() }),
}))

/* ---- Config mock ---- */
vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

/* ---- fetch mock ---- */
global.fetch = vi.fn()

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  jobId: "job-1",
  jobName: "Software Engineer",
  onSaved: vi.fn(),
}

const existingForm: ApplicationForm = {
  title: "My Form",
  description: "Fill this in",
  status: "draft",
  fields: [
    { id: "f1", type: "shortText", label: "Your name", required: true },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(global.fetch as any).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  })
})

describe("ApplicationFormBuilderDialog", () => {
  describe("Rendering", () => {
    it("renders dialog with Application Form title", () => {
      render(<ApplicationFormBuilderDialog {...defaultProps} />)
      expect(screen.getByText("Application Form")).toBeInTheDocument()
    })

    it("renders job name as subtitle", () => {
      render(<ApplicationFormBuilderDialog {...defaultProps} />)
      expect(screen.getByText("Software Engineer")).toBeInTheDocument()
    })

    it("renders form title input pre-filled with job name for new form", () => {
      render(<ApplicationFormBuilderDialog {...defaultProps} />)
      const titleInput = screen.getByDisplayValue("Application for Software Engineer")
      expect(titleInput).toBeInTheDocument()
    })

    it("pre-fills title and description when editing an existing form", () => {
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={existingForm} />)
      expect(screen.getByDisplayValue("My Form")).toBeInTheDocument()
      expect(screen.getByDisplayValue("Fill this in")).toBeInTheDocument()
    })

    it("renders draft/published toggle switch", () => {
      render(<ApplicationFormBuilderDialog {...defaultProps} />)
      expect(screen.getByRole("checkbox")).toBeInTheDocument()
      expect(screen.getByText("Draft")).toBeInTheDocument()
    })

    it("shows Published label when form status is published", () => {
      const publishedForm: ApplicationForm = { ...existingForm, status: "published" }
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={publishedForm} />)
      expect(screen.getByText("Published")).toBeInTheDocument()
    })

    it("does NOT render a fair schedule dropdown", () => {
      render(<ApplicationFormBuilderDialog {...defaultProps} />)
      // "No fair selected" was the placeholder option in the removed dropdown
      expect(screen.queryByText("No fair selected")).not.toBeInTheDocument()
      // There should be no Select labelled "Fair"
      expect(screen.queryByLabelText(/^fair$/i)).not.toBeInTheDocument()
    })

    it("renders Add field button", () => {
      render(<ApplicationFormBuilderDialog {...defaultProps} />)
      expect(screen.getByRole("button", { name: /add field/i })).toBeInTheDocument()
    })

    it("renders Save and Cancel buttons", () => {
      render(<ApplicationFormBuilderDialog {...defaultProps} />)
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
    })
  })

  describe("Field management", () => {
    it("adds a new field when Add field is clicked", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} />)

      const before = screen.queryAllByLabelText(/field label/i).length
      await user.click(screen.getByRole("button", { name: /add field/i }))
      const after = screen.queryAllByLabelText(/field label/i).length

      expect(after).toBeGreaterThan(before)
    })

    it("loads existing fields when editing a form", () => {
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={existingForm} />)
      expect(screen.getByDisplayValue("Your name")).toBeInTheDocument()
    })
  })

  describe("Validation", () => {
    it("shows error when trying to save with a field that has no label", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} />)

      // Add a blank field (pre-filled with blank label)
      await user.click(screen.getByRole("button", { name: /add field/i }))
      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument()
      })
    })

    it("shows error when form title is empty", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} />)

      const titleInput = screen.getByDisplayValue("Application for Software Engineer")
      await user.clear(titleInput)
      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument()
      })
    })
  })

  describe("Save API call", () => {
    it("calls PUT /api/jobs/:id/form with Bearer token on successful save", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={existingForm} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "http://localhost:5000/api/jobs/job-1/form",
          expect.objectContaining({
            method: "PUT",
            headers: expect.objectContaining({
              Authorization: "Bearer mock-token",
              "Content-Type": "application/json",
            }),
          })
        )
      })
    })

    it("calls onSaved callback with the form after successful save", async () => {
      const user = userEvent.setup()
      const onSaved = vi.fn()
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={existingForm} onSaved={onSaved} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(onSaved).toHaveBeenCalledWith(
          expect.objectContaining({ title: "My Form" })
        )
      })
    })

    it("shows error alert when API returns an error", async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "Not authorized for this company" }),
      })

      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={existingForm} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByText("Not authorized for this company")).toBeInTheDocument()
      })
    })

    it("shows error alert when network request fails", async () => {
      ;(global.fetch as any).mockRejectedValue(new Error("Network error"))

      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={existingForm} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument()
      })
    })

    it("sends status=published when form is initialised as published", async () => {
      const user = userEvent.setup()
      const publishedForm: ApplicationForm = { ...existingForm, status: "published" }
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={publishedForm} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
        const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
        expect(body.status).toBe("published")
      })
    })

    it("sends status=draft when toggle is off", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={existingForm} />)

      // Ensure toggle is off (form starts as draft)
      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
        expect(body.status).toBe("draft")
      })
    })
  })

  describe("Cancel / close", () => {
    it("calls onClose when Cancel is clicked", async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ApplicationFormBuilderDialog {...defaultProps} onClose={onClose} />)

      await user.click(screen.getByRole("button", { name: /cancel/i }))
      expect(onClose).toHaveBeenCalled()
    })
  })
})
