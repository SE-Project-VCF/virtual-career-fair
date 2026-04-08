/// <reference types="vitest/globals" />
import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { BrowserRouter } from "react-router-dom"

const { longPkToken } = vi.hoisted(() => ({
  longPkToken: `pk.${"b".repeat(25)}`,
}))

vi.mock("../../config", () => ({
  MAPBOX_ACCESS_TOKEN: longPkToken,
  MAPBOX_TOKEN_LOOKS_PUBLIC: true,
}))

vi.mock("react-map-gl/mapbox", () => ({
  __esModule: true,
  default: function MockMapBad({
    onError,
  }: {
    onError?: (e: { error: unknown }) => void
  }) {
    React.useEffect(() => {
      onError?.({ error: new Error("tile failed") })
    }, [onError])
    return <div data-testid="bad-map" />
  },
  Marker: () => null,
  NavigationControl: () => null,
  Popup: () => null,
}))

vi.mock("mapbox-gl", () => ({
  __esModule: true,
  default: {
    accessToken: "",
    LngLatBounds: class {
      extend(..._coords: unknown[]) {
        /* test double */
      }
    },
  },
}))

import FairsMapView from "../FairsMapView"

describe("FairsMapView map load error", () => {
  it("shows Mapbox error alert when onError fires", async () => {
    const futureEnd = Date.now() + 86400000
    render(
      <BrowserRouter>
        <FairsMapView
          fairs={[
            {
              id: "f1",
              name: "Geo Fair",
              startTime: Date.now(),
              endTime: futureEnd,
              venueGeo: { latitude: 40, longitude: -74 },
            },
          ]}
        />
      </BrowserRouter>,
    )
    await waitFor(() => {
      expect(screen.getByText(/Mapbox could not load the map/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/tile failed/i)).toBeInTheDocument()
  })
})
