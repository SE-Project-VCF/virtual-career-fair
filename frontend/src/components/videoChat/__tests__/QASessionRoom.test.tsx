import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, waitFor } from "@testing-library/react"
import React from "react"
import { QASessionRoom } from "../QASessionRoom"

vi.mock("../VideoRoom", () => ({
  VideoRoom: ({
    onError,
  }: {
    onError?: (err: Error) => void
  }) => {
    React.useEffect(() => {
      onError?.(new Error("simulated video failure"))
    }, [onError])
    return <div data-testid="mock-video-room" />
  },
}))

describe("QASessionRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("forwards VideoRoom errors to onError and logs", async () => {
    const onError = vi.fn()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    render(<QASessionRoom jitsiRoom="room-qa" userName="Alice" onError={onError} />)

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "simulated video failure" }))
    })
    expect(consoleError).toHaveBeenCalledWith(
      "[QA Session] Video error:",
      expect.objectContaining({ message: "simulated video failure" })
    )

    consoleError.mockRestore()
  })

})
