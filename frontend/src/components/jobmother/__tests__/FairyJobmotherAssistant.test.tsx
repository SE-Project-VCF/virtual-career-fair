/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import FairyJobmotherAssistant from "../FairyJobmotherAssistant"
import { JOBMOTHER_TEASER_DISMISSED_KEY } from "../../../constants/jobmother"

const PLACEHOLDER_REPLY = "Thanks! Full AI answers will arrive in a future update."

describe("FairyJobmotherAssistant", () => {
  beforeEach(() => {
    globalThis.localStorage?.removeItem(JOBMOTHER_TEASER_DISMISSED_KEY)
  })

  it("opens the panel and focuses input when the launcher is clicked", async () => {
    const user = userEvent.setup()
    render(<FairyJobmotherAssistant />)

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument()
  })

  it("closes on Escape", async () => {
    const user = userEvent.setup()
    render(<FairyJobmotherAssistant />)

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("appends user message and placeholder assistant reply after send", async () => {
    const user = userEvent.setup()
    render(<FairyJobmotherAssistant />)

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    const field = screen.getByPlaceholderText(/Type a message/i)
    await user.type(field, "Hello fairy")
    await user.click(screen.getByRole("button", { name: /Send message/i }))

    expect(screen.getByText("Hello fairy")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(PLACEHOLDER_REPLY)).toBeInTheDocument()
    })
  })

  it("sends on Enter without Shift", async () => {
    const user = userEvent.setup()
    render(<FairyJobmotherAssistant />)

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother help/i }))
    const field = screen.getByPlaceholderText(/Type a message/i)
    await user.type(field, "Hi")
    await user.keyboard("{Enter}")

    await waitFor(() => {
      expect(screen.getByText(PLACEHOLDER_REPLY)).toBeInTheDocument()
    })
  })

  it("dismissing the welcome shows the small circular launcher", async () => {
    const user = userEvent.setup()
    render(<FairyJobmotherAssistant />)

    expect(screen.getByText(/Hi! I'm your Fairy Jobmother!/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Dismiss welcome message/i }))

    expect(screen.queryByText(/Hi! I'm your Fairy Jobmother!/i)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Open Fairy Jobmother help/i })).toBeInTheDocument()
  })

  it("opens chat from the speech bubble", async () => {
    const user = userEvent.setup()
    render(<FairyJobmotherAssistant />)

    await user.click(screen.getByRole("button", { name: /Open Fairy Jobmother assistant/i }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })
})
