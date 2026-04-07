/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { BrowserRouter } from "react-router-dom"

vi.mock("../../config", () => ({
  MAPBOX_ACCESS_TOKEN: "",
  MAPBOX_TOKEN_LOOKS_PUBLIC: false,
}))

import FairsMapView from "../FairsMapView"

describe("FairsMapView without Mapbox token", () => {
  it("shows token missing warning", () => {
    render(
      <BrowserRouter>
        <FairsMapView fairs={[]} />
      </BrowserRouter>,
    )
    expect(screen.getByText(/Map view needs a Mapbox token/i)).toBeInTheDocument()
  })
})
