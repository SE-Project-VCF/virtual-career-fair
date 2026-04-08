/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { BrowserRouter } from "react-router-dom"

vi.mock("../../config", () => ({
  MAPBOX_ACCESS_TOKEN: "sk.secretvaluefortestsxxxxxxxx",
  MAPBOX_TOKEN_LOOKS_PUBLIC: false,
}))

import FairsMapView from "../FairsMapView"

describe("FairsMapView with non-public Mapbox token", () => {
  it("shows secret token guidance", () => {
    render(
      <BrowserRouter>
        <FairsMapView fairs={[]} />
      </BrowserRouter>,
    )
    expect(screen.getByText(/Mapbox returned 401/i)).toBeInTheDocument()
  })
})
