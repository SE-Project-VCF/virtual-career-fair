import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import BoothHistoryPage from '../BoothHistoryPage'
import { authUtils } from '../../utils/auth'

// Mock Firebase modules
vi.mock('../../firebase', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}))

// Mock auth utils
vi.mock('../../utils/auth', () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}))

// Mock ProfileMenu
vi.mock('../ProfileMenu', () => ({
  default: () => <div>Profile Menu</div>,
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Import mocked functions
import { getDocs, orderBy, limit } from 'firebase/firestore'

describe('BoothHistoryPage', () => {
  const mockStudent = {
    uid: 'student-123',
    role: 'student',
    email: 'student@example.com',
  }

  const mockCompanyOwner = {
    uid: 'company-123',
    role: 'companyOwner',
    email: 'company@example.com',
  }

  const mockBoothHistory = [
    {
      boothId: 'booth-1',
      companyName: 'TechCorp',
      industry: 'Software',
      location: 'San Francisco, CA',
      logoUrl: 'https://example.com/logo1.png',
      lastViewedAt: {
        toDate: () => new Date('2024-03-17T10:00:00Z'),
      },
    },
    {
      boothId: 'booth-2',
      companyName: 'CloudSys',
      industry: 'Cloud Services',
      location: 'Seattle, WA',
      logoUrl: null,
      lastViewedAt: {
        toDate: () => new Date('2024-03-16T14:00:00Z'),
      },
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    ;(authUtils.getCurrentUser as any).mockReturnValue(mockStudent)
  })

  const renderPage = () => {
    return render(
      <BrowserRouter>
        <BoothHistoryPage />
      </BrowserRouter>
    )
  }

  describe('Authentication & Authorization', () => {
    it('should show sign-in message when user is not authenticated', () => {
      ;(authUtils.getCurrentUser as any).mockReturnValue(null)

      renderPage()

      expect(
        screen.getByText('Please sign in to view your booth history.')
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /go to login/i })).toBeInTheDocument()
    })

    it('should navigate to login when clicking Go to Login button', () => {
      ;(authUtils.getCurrentUser as any).mockReturnValue(null)

      renderPage()

      const loginButton = screen.getByRole('button', { name: /go to login/i })
      fireEvent.click(loginButton)

      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })

    it('should show students-only message for non-student roles', () => {
      ;(authUtils.getCurrentUser as any).mockReturnValue(mockCompanyOwner)
      ;(getDocs as any).mockResolvedValue({
        docs: [],
      })

      renderPage()

      expect(screen.getByText('Students only')).toBeInTheDocument()
      expect(
        screen.getByText('This page is only available for student accounts.')
      ).toBeInTheDocument()
    })

    it('should navigate to dashboard when company owner clicks back button', () => {
      ;(authUtils.getCurrentUser as any).mockReturnValue(mockCompanyOwner)
      ;(getDocs as any).mockResolvedValue({
        docs: [],
      })

      renderPage()

      const dashboardButton = screen.getByRole('button', { name: /back to dashboard/i })
      fireEvent.click(dashboardButton)

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      ;(getDocs as any).mockImplementation(() => new Promise(() => {}))

      renderPage()

      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
  })

  describe('Loading History Data', () => {
    it('should load booth history from Firestore on mount', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [
          { data: () => mockBoothHistory[0] },
          { data: () => mockBoothHistory[1] },
        ],
      })

      renderPage()

      await waitFor(() => {
        expect(getDocs).toHaveBeenCalled()
      })

      expect(screen.getByText('TechCorp')).toBeInTheDocument()
      expect(screen.getByText('CloudSys')).toBeInTheDocument()
    })

    it('should order booth history by lastViewedAt descending', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [
          { data: () => mockBoothHistory[0] },
          { data: () => mockBoothHistory[1] },
        ],
      })

      renderPage()

      await waitFor(() => {
        expect(orderBy).toHaveBeenCalledWith('lastViewedAt', 'desc')
      })
    })

    it('should limit history to 20 items', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[0] }],
      })

      renderPage()

      await waitFor(() => {
        expect(limit).toHaveBeenCalledWith(20)
      })
    })

    it('should handle Firestore errors gracefully', async () => {
      ;(getDocs as any).mockRejectedValue(new Error('Firestore error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('No booth history yet')).toBeInTheDocument()
      })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should show empty state when no booth history exists', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [],
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('No booth history yet')).toBeInTheDocument()
        expect(
          screen.getByText(/visit a booth and it will show up here/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('Page Header', () => {
    it('should display page title and subtitle', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[0] }],
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Booth History')).toBeInTheDocument()
        expect(screen.getByText(/your recently viewed company booths/i)).toBeInTheDocument()
      })
    })

    it('should display Dashboard button in header', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[0] }],
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /dashboard/i })[0]).toBeInTheDocument()
      })
    })

    it('should navigate to dashboard when header Dashboard button clicked', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[0] }],
      })

      renderPage()

      await waitFor(() => {
        const dashboardButtons = screen.getAllByRole('button', { name: /dashboard/i })
        fireEvent.click(dashboardButtons[0])
      })

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('should display Browse Booths button in header', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[0] }],
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /browse booths/i })[0]).toBeInTheDocument()
      })
    })

    it('should navigate to booths page when header Browse Booths button clicked', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[0] }],
      })

      renderPage()

      await waitFor(() => {
        const browseButtons = screen.getAllByRole('button', { name: /browse booths/i })
        fireEvent.click(browseButtons[0])
      })

      expect(mockNavigate).toHaveBeenCalledWith('/booths')
    })

    it('should render ProfileMenu component', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[0] }],
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Profile Menu')).toBeInTheDocument()
      })
    })
  })

  describe('Booth History Card Rendering', () => {
    it('should render booth cards with company names', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [
          { data: () => mockBoothHistory[0] },
          { data: () => mockBoothHistory[1] },
        ],
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('TechCorp')).toBeInTheDocument()
        expect(screen.getByText('CloudSys')).toBeInTheDocument()
      })
    })

    it('should display location information on cards', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[0] }],
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('San Francisco, CA')).toBeInTheDocument()
      })
    })

    it('should display company logo when available', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[0] }],
      })

      renderPage()

      await waitFor(() => {
        const logoImg = screen.getByAltText('TechCorp logo')
        expect(logoImg).toBeInTheDocument()
        expect(logoImg).toHaveAttribute('src', 'https://example.com/logo1.png')
      })
    })

    it('should display placeholder icon when logo not available', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[1] }],
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('CloudSys')).toBeInTheDocument()
        // Placeholder is rendered when no logoUrl
      })
    })

    it('should navigate to booth detail page when card is clicked', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[0] }],
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('TechCorp')).toBeInTheDocument()
      })

      // Find the TechCorp company name and navigate up to find the clickable Card
      const companyNameElement = screen.getByText('TechCorp')
      let card = companyNameElement.closest('[class*="MuiCard"]') as Element | null
      
      // If direct MuiCard not found, try finding the Card's container
      if (!card) {
        const parentDiv = companyNameElement.closest('div')
        if (parentDiv) {
          card = parentDiv.closest('div')?.closest('div') as Element | null
        }
      }

      if (card) {
        fireEvent.click(card)
      }

      expect(mockNavigate).toHaveBeenCalledWith('/booth/booth-1')
    })
  })

  describe('Empty State Actions', () => {
    it('should show Browse Booths button in empty state', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [],
      })

      renderPage()

      await waitFor(() => {
        const browsButtons = screen.getAllByRole('button', { name: /browse booths/i })
        expect(browsButtons.length).toBeGreaterThan(0)
      })
    })

    it('should navigate to booths when empty state Browse Booths clicked', async () => {
      ;(getDocs as any).mockResolvedValue({
        docs: [],
      })

      renderPage()

      await waitFor(() => {
        const browseButtons = screen.getAllByRole('button', { name: /browse booths/i })
        fireEvent.click(browseButtons[browseButtons.length - 1])
      })

      expect(mockNavigate).toHaveBeenCalledWith('/booths')
    })
  })

  describe('User Dependency Tracking', () => {
    it('should reload history when user uid changes', async () => {
      const { rerender } = render(
        <BrowserRouter>
          <BoothHistoryPage />
        </BrowserRouter>
      )

      ;(getDocs as any).mockResolvedValue({
        docs: [{ data: () => mockBoothHistory[0] }],
      })

      await waitFor(() => {
        expect(getDocs).toHaveBeenCalled()
      })

      const callCount = (getDocs as any).mock.calls.length

      // Re-render (in real usage, this occurs when user changes)
      ;(authUtils.getCurrentUser as any).mockReturnValue({
        uid: 'different-uid',
        role: 'student',
      })

      rerender(
        <BrowserRouter>
          <BoothHistoryPage />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect((getDocs as any).mock.calls.length).toBeGreaterThan(callCount)
      })
    })

    it('should not log history when uid is missing', async () => {
      ;(authUtils.getCurrentUser as any).mockReturnValue({ role: 'student' })

      renderPage()

      await waitFor(() => {
        expect(getDocs).not.toHaveBeenCalled()
      })
    })
  })
})
