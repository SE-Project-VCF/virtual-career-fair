import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import FairBooths from "../FairBooths"

function FairLandingProbe() {
  return <div data-testid="fair-landing-route">Fair landing</div>
}

describe("FairBooths", () => {
  it("redirects /fair/:fairId/booths to /fair/:fairId", () => {
    render(
      <MemoryRouter initialEntries={["/fair/xyz/booths"]}>
        <Routes>
          <Route path="/fair/:fairId/booths" element={<FairBooths />} />
          <Route path="/fair/:fairId" element={<FairLandingProbe />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId("fair-landing-route")).toBeInTheDocument()
  })
})
