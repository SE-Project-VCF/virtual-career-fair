/// <reference types="vitest/globals" />
import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"

const { longPkToken } = vi.hoisted(() => ({
  longPkToken: `pk.${"a".repeat(25)}`,
}))

vi.mock("../../config", () => ({
  MAPBOX_ACCESS_TOKEN: longPkToken,
  MAPBOX_TOKEN_LOOKS_PUBLIC: true,
}))

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})

const mapSpies = vi.hoisted(() => ({
  easeTo: vi.fn(),
  fitBounds: vi.fn(),
}))

vi.mock("react-map-gl/mapbox", () => ({
  __esModule: true,
  default: React.forwardRef(function MockMap(
    { children, onLoad, onError }: { children?: React.ReactNode; onLoad?: () => void; onError?: (e: { error: unknown }) => void },
    ref: React.Ref<{ getMap: () => typeof mapSpies }>,
  ) {
    React.useImperativeHandle(ref, () => ({
      getMap: () => mapSpies,
    }))
    React.useEffect(() => {
      onLoad?.()
    }, [onLoad])
    return <div data-testid="mock-map">{children}</div>
  }),
  Marker: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode
    onClick?: (e: { originalEvent: { stopPropagation: () => void } }) => void
  }) => (
    <button
      type="button"
      data-testid="map-marker"
      onClick={() =>
        onClick?.({
          originalEvent: { stopPropagation: vi.fn() },
        })
      }
    >
      {children}
    </button>
  ),
  NavigationControl: () => null,
  Popup: ({
    children,
    onClose,
  }: {
    children?: React.ReactNode
    onClose?: () => void
  }) => (
    <div data-testid="map-popup">
      {children}
      <button type="button" onClick={onClose}>
        close popup
      </button>
    </div>
  ),
}))

vi.mock("mapbox-gl", () => ({
  __esModule: true,
  default: {
    accessToken: "",
    LngLatBounds: class {
      extend(..._coords: unknown[]) {
        /* test double: bounds accumulation not asserted */
      }
    },
  },
}))

import FairsMapView from "../FairsMapView"

describe("FairsMapView with valid token and mocked Map", () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    mapSpies.easeTo.mockClear()
    mapSpies.fitBounds.mockClear()
  })

  it("shows empty state when no mappable fairs", () => {
    render(
      <BrowserRouter>
        <FairsMapView fairs={[]} />
      </BrowserRouter>,
    )
    expect(
      screen.getByText(/No live or upcoming fairs with a saved location to show on the map yet/i),
    ).toBeInTheDocument()
  })

  it("uses easeTo for a single mappable fair", async () => {
    const futureEnd = Date.now() + 86400000
    render(
      <BrowserRouter>
        <FairsMapView
          fairs={[
            {
              id: "one",
              name: "Single",
              startTime: null,
              endTime: futureEnd,
              venueGeo: { latitude: 40, longitude: -74 },
            },
          ]}
        />
      </BrowserRouter>,
    )
    await waitFor(() => {
      expect(mapSpies.easeTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [-74, 40], zoom: 8 }),
      )
    })
    expect(mapSpies.fitBounds).not.toHaveBeenCalled()
  })

  it("uses fitBounds for multiple mappable fairs", async () => {
    const futureEnd = Date.now() + 86400000
    render(
      <BrowserRouter>
        <FairsMapView
          fairs={[
            {
              id: "a",
              name: "A",
              startTime: null,
              endTime: futureEnd,
              venueGeo: { latitude: 40, longitude: -74 },
            },
            {
              id: "b",
              name: "B",
              startTime: null,
              endTime: futureEnd,
              venueGeo: { latitude: 42, longitude: -71 },
            },
          ]}
        />
      </BrowserRouter>,
    )
    await waitFor(() => {
      expect(mapSpies.fitBounds).toHaveBeenCalled()
    })
    expect(mapSpies.easeTo).not.toHaveBeenCalled()
  })

  it("opens popup and navigates from View fair", async () => {
    const start = Date.now()
    const futureEnd = Date.now() + 86400000
    const user = userEvent.setup()
    render(
      <BrowserRouter>
        <FairsMapView
          fairs={[
            {
              id: "fair-99",
              name: "Pinned Fair",
              startTime: start,
              endTime: futureEnd,
              venueGeo: { latitude: 41.9, longitude: -87.6 },
            },
          ]}
        />
      </BrowserRouter>,
    )
    await waitFor(() => expect(screen.getByTestId("mock-map")).toBeInTheDocument())
    await user.click(screen.getByTestId("map-marker"))
    const popup = screen.getByTestId("map-popup")
    expect(popup.textContent).toMatch(/–/)
    await user.click(screen.getByRole("button", { name: /view fair/i }))
    expect(mockNavigate).toHaveBeenCalledWith("/fair/fair-99")
  })

  it("closes popup via Popup onClose", async () => {
    const futureEnd = Date.now() + 86400000
    const user = userEvent.setup()
    render(
      <BrowserRouter>
        <FairsMapView
          fairs={[
            {
              id: "f2",
              name: "Other",
              startTime: null,
              endTime: futureEnd,
              venueGeo: { latitude: 39, longitude: -104 },
            },
          ]}
        />
      </BrowserRouter>,
    )
    await waitFor(() => expect(screen.getByTestId("mock-map")).toBeInTheDocument())
    await user.click(screen.getByTestId("map-marker"))
    expect(screen.getByTestId("map-popup")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /close popup/i }))
    expect(screen.queryByTestId("map-popup")).not.toBeInTheDocument()
  })
})
