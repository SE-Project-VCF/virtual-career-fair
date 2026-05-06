import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Autocomplete, TextField, Box, Chip, Button, Dialog, DialogContent, DialogActions } from "@mui/material"
import { describe, it, expect, vi } from "vitest"
import React from "react"

// Mimic the exact fetch-based pattern used in FairAdminDashboard
function TestComponentWithFetch({ enrollments }: { enrollments: { id: string; companyName: string }[] }) {
  const [options, setOptions] = React.useState<{ id: string; companyName: string }[]>([])
  const [selected, setSelected] = React.useState<{ id: string; companyName: string } | null>(null)
  const [inputValue, setInputValue] = React.useState("")
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (!inputValue.trim() || !open) {
      setOptions([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/companies/search?q=${inputValue}`, { signal: controller.signal })
        if (res.ok) {
          const data = await res.json()
          setOptions(data)
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {}
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [inputValue, open])

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Add Company</Button>
      <Dialog open={open} onClose={() => { setOpen(false); setSelected(null); setInputValue("") }} transitionDuration={0}>
        <DialogContent>
          <Autocomplete
            options={options}
            getOptionLabel={(o) => o.companyName}
            inputValue={inputValue}
            onInputChange={(_e, val) => setInputValue(val)}
            value={selected}
            onChange={(_e, val) => setSelected(val)}
            filterOptions={(x) => x}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            disablePortal
            renderOption={(props, option) => {
              const isEnrolled = enrollments.some((e) => e.id === option.id)
              return (
                <li {...props} key={option.id}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                    <span>{option.companyName}</span>
                    {isEnrolled && <Chip label="Enrolled" size="small" variant="outlined" />}
                  </Box>
                </li>
              )
            }}
            renderInput={(params) => <TextField {...params} label="Search companies" />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); setSelected(null); setInputValue("") }}>Cancel</Button>
          <Button disabled={!selected}>
            {selected && enrollments.some((e) => e.id === selected.id) ? "Re-enroll" : "Add Company"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

describe("Autocomplete with fetch-based options inside Dialog", () => {
  it("clicking option selects it and shows Re-enroll", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/companies/search"))
        return Promise.resolve({ ok: true, json: async () => [{ id: "c1", companyName: "Acme Corp" }] })
      return Promise.resolve({ ok: true, json: async () => [] })
    })
    const user = userEvent.setup()
    render(<TestComponentWithFetch enrollments={[{ id: "c1", companyName: "Acme Corp" }]} />)
    await user.click(screen.getByRole("button", { name: /\+ add company/i }))
    const input = screen.getByRole("combobox")
    await user.type(input, "Acme")
    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument())
    await user.click(screen.getByText("Acme Corp"))
    await waitFor(() => expect(screen.getByRole("button", { name: /re-enroll/i })).toBeInTheDocument())
  })
})
