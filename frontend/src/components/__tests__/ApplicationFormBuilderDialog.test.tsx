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

    it("renders form title input pre-filled with job name for new form", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} />)
      await user.click(screen.getByRole("button", { name: /build from scratch/i }))
      const titleInput = screen.getByDisplayValue("Application for Software Engineer")
      expect(titleInput).toBeInTheDocument()
    })

    it("pre-fills title and description when editing an existing form", () => {
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={existingForm} />)
      expect(screen.getByDisplayValue("My Form")).toBeInTheDocument()
      expect(screen.getByDisplayValue("Fill this in")).toBeInTheDocument()
    })

    it("renders draft/published toggle switch", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} />)
      await user.click(screen.getByRole("button", { name: /build from scratch/i }))
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

    it("renders Add field button", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} />)
      await user.click(screen.getByRole("button", { name: /build from scratch/i }))
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

      await user.click(screen.getByRole("button", { name: /build from scratch/i }))
      const before = screen.queryAllByLabelText(/field label/i).length
      await user.click(screen.getByRole("button", { name: /add field/i }))
      const after = screen.queryAllByLabelText(/field label/i).length

      expect(after).toBeGreaterThan(before)
    })

    it("loads existing fields when editing a form", () => {
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={existingForm} />)
      expect(screen.getByDisplayValue("Your name")).toBeInTheDocument()
    })

    it("deletes a field when delete button is clicked and removes it from the form", async () => {
      const user = userEvent.setup()
      const formWithTwoFields: ApplicationForm = {
        ...existingForm,
        fields: [
          { id: "f1", type: "shortText", label: "First field", required: true },
          { id: "f2", type: "shortText", label: "Second field", required: false },
        ],
      }
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={formWithTwoFields} />)

      const firstFieldInput = screen.getByDisplayValue("First field")
      const fieldCard = firstFieldInput.closest(".MuiPaper-root") as HTMLElement
      const deleteBtn = fieldCard.querySelector('[data-testid="DeleteIcon"]')?.closest("button")!
      await user.click(deleteBtn)

      expect(screen.queryByDisplayValue("First field")).not.toBeInTheDocument()
      expect(screen.getByDisplayValue("Second field")).toBeInTheDocument()
    })

    it("shows correct field count after deleting a field", async () => {
      const user = userEvent.setup()
      const formWithTwoFields: ApplicationForm = {
        ...existingForm,
        fields: [
          { id: "f1", type: "shortText", label: "A", required: false },
          { id: "f2", type: "shortText", label: "B", required: false },
        ],
      }
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={formWithTwoFields} />)

      expect(screen.getByText("2 fields configured")).toBeInTheDocument()

      const firstFieldInput = screen.getByDisplayValue("A")
      const fieldCard = firstFieldInput.closest(".MuiPaper-root") as HTMLElement
      const deleteBtn = fieldCard.querySelector('[data-testid="DeleteIcon"]')?.closest("button")!
      await user.click(deleteBtn)

      expect(screen.getByText("1 field configured")).toBeInTheDocument()
    })
  })

  describe("Validation", () => {
    it("shows error when trying to save with a field that has no label", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /build from scratch/i }))
      // Build from scratch starts with one field with blank label
      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument()
      })
    })

    it("shows error when form title is empty", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /build from scratch/i }))
      const titleInput = screen.getByDisplayValue("Application for Software Engineer")
      await user.clear(titleInput)
      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument()
      })
    })

    it('shows error "Add at least one field" when saving with no fields', async () => {
      const user = userEvent.setup()
      const formWithOneField: ApplicationForm = {
        ...existingForm,
        fields: [{ id: "f1", type: "shortText", label: "Name", required: true }],
      }
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={formWithOneField} />)

      const fieldInput = screen.getByDisplayValue("Name")
      const fieldCard = fieldInput.closest(".MuiPaper-root") as HTMLElement
      const deleteBtn = fieldCard.querySelector('[data-testid="DeleteIcon"]')?.closest("button")!
      await user.click(deleteBtn)

      expect(screen.getByText("No fields yet.")).toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByText("Add at least one field to your application form.")).toBeInTheDocument()
      })
    })

    it("shows error when singleSelect field has no options", async () => {
      const user = userEvent.setup()
      const formWithSelect: ApplicationForm = {
        ...existingForm,
        fields: [
          { id: "f1", type: "singleSelect", label: "Choose one", required: false, options: [] },
        ],
      }
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={formWithSelect} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByText("Provide at least one option.")).toBeInTheDocument()
      })
    })

    it("shows error when multiSelect field has no options", async () => {
      const user = userEvent.setup()
      const formWithMultiSelect: ApplicationForm = {
        ...existingForm,
        fields: [
          { id: "f1", type: "multiSelect", label: "Choose many", required: false, options: [] },
        ],
      }
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={formWithMultiSelect} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByText("Provide at least one option.")).toBeInTheDocument()
      })
    })

    it("shows 'Please fix the highlighted fields' when multiple validation errors exist", async () => {
      const user = userEvent.setup()
      const invalidForm: ApplicationForm = {
        ...existingForm,
        fields: [
          { id: "f1", type: "shortText", label: "", required: false },
          { id: "f2", type: "singleSelect", label: "Pick", required: false, options: [] },
        ],
      }
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={invalidForm} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByText(/Please fix the highlighted fields before saving\./)).toBeInTheDocument()
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

    it("includes publishedAt when status is published", async () => {
      const user = userEvent.setup()
      const publishedForm: ApplicationForm = { ...existingForm, status: "published" }
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={publishedForm} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
        expect(body.publishedAt).toBeDefined()
        expect(typeof body.publishedAt).toBe("number")
      })
    })

    it("includes description in request body when non-empty", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={existingForm} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
        expect(body.description).toBe("Fill this in")
      })
    })

    it("omits description when empty", async () => {
      const user = userEvent.setup()
      const formWithoutDesc: ApplicationForm = { ...existingForm, description: undefined }
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={formWithoutDesc} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
        expect(body.description).toBeUndefined()
      })
    })

    it("trims and filters options for select fields when saving", async () => {
      const user = userEvent.setup()
      const formWithSelect: ApplicationForm = {
        ...existingForm,
        fields: [
          {
            id: "f1",
            type: "singleSelect",
            label: "Pick",
            required: false,
            options: ["  A  ", "B", "", "  C  "],
          },
        ],
      }
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={formWithSelect} />)

      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
        expect(body.fields[0].options).toEqual(["A", "B", "C"])
      })
    })

    it("does not make API call when save is blocked by validation", async () => {
      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /build from scratch/i }))
      await user.click(screen.getByRole("button", { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument()
      })
      expect(global.fetch).not.toHaveBeenCalled()
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

    it("disables Cancel and Save buttons while save is in progress (handleClose guard)", async () => {
      let resolveFetch: (value: any) => void
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
      ;(global.fetch as any).mockReturnValue(fetchPromise)

      const user = userEvent.setup()
      render(<ApplicationFormBuilderDialog {...defaultProps} initialForm={existingForm} />)

      const saveButton = screen.getByRole("button", { name: /save/i })
      await user.click(saveButton)

      const cancelButton = screen.getByRole("button", { name: /cancel/i })
      expect(cancelButton).toBeDisabled()
      expect(saveButton).toBeDisabled()
      expect(saveButton).toHaveTextContent("Saving...")

      resolveFetch!({ ok: true, json: () => Promise.resolve({ success: true }) })
      await waitFor(() => {
        expect(cancelButton).not.toBeDisabled()
      })
    })
  })
})
