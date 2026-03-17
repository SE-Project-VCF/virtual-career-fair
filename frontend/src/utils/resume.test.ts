import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateTailorPatches,
  saveTailoredResume,
  getTailoredResume,
  listTailoredResumes,
} from './resume'
import type {
  TailorRequest,
  TailorResponse,
  SaveTailoredRequest,
} from './resume'
import { authUtils } from './auth'

vi.mock('./auth', () => ({
  authUtils: {
    getIdToken: vi.fn(),
  },
}))

describe('Resume API Utilities', () => {
  const mockToken = 'mock-token-123'
  const mockInvitationId = 'invitation-123'
  const mockJobId = 'job-123'

  beforeEach(() => {
    vi.clearAllMocks()
    ;(authUtils.getIdToken as any).mockResolvedValue(mockToken)
  })

  describe('generateTailorPatches', () => {
    it('should successfully generate patches with valid request', async () => {
      const mockRequest: TailorRequest = {
        invitationId: mockInvitationId,
        jobId: mockJobId,
        jobTitle: 'Senior Frontend Engineer',
        jobDescription: 'Build scalable React applications',
        requiredSkills: 'React, TypeScript, Node.js',
      }

      const mockResponse: TailorResponse = {
        ok: true,
        patches: [
          {
            id: 'patch-1',
            type: 'edit',
            section: 'experience',
            original: 'Old text',
            replacement: 'New text',
            reason: 'Better match',
          },
        ],
        provider: 'gemini',
        model: 'gemini-2.0-flash',
      }

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await generateTailorPatches(mockRequest)

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/resume/tailor/v2'),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mockRequest),
        }
      )
    })

    it('should throw error when not authenticated', async () => {
      ;(authUtils.getIdToken as any).mockResolvedValueOnce(null)

      const mockRequest: TailorRequest = {
        invitationId: mockInvitationId,
        jobTitle: 'Senior Frontend Engineer',
        jobDescription: 'Build scalable React applications',
      }

      await expect(generateTailorPatches(mockRequest)).rejects.toThrow(
        'Not authenticated'
      )
    })

    it('should handle API errors gracefully', async () => {
      const mockRequest: TailorRequest = {
        invitationId: mockInvitationId,
        jobTitle: 'Senior Frontend Engineer',
        jobDescription: 'Build scalable React applications',
      }

      const errorMessage = 'Invalid job description'
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: errorMessage }),
      })

      await expect(generateTailorPatches(mockRequest)).rejects.toThrow(
        errorMessage
      )
    })

    it('should handle network errors', async () => {
      const mockRequest: TailorRequest = {
        invitationId: mockInvitationId,
        jobTitle: 'Senior Frontend Engineer',
        jobDescription: 'Build scalable React applications',
      }

      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))

      await expect(generateTailorPatches(mockRequest)).rejects.toThrow(
        'Network error'
      )
    })

    it('should include skill suggestions in response', async () => {
      const mockRequest: TailorRequest = {
        invitationId: mockInvitationId,
        jobTitle: 'Senior Frontend Engineer',
        jobDescription: 'Build scalable React applications',
        requiredSkills: 'React, TypeScript, Node.js',
      }

      const mockResponse: TailorResponse = {
        ok: true,
        patches: [],
        skill_suggestions: [
          {
            skill: 'Next.js',
            presentInResume: false,
            reason: 'Mentioned in job description',
            addIfYouHave: true,
          },
        ],
      }

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await generateTailorPatches(mockRequest)

      expect(result.skill_suggestions).toHaveLength(1)
      expect(result.skill_suggestions?.[0].skill).toBe('Next.js')
    })
  })

  describe('saveTailoredResume', () => {
    it('should successfully save tailored resume', async () => {
      const mockRequest: SaveTailoredRequest = {
        invitationId: mockInvitationId,
        acceptedPatchIds: ['patch-1', 'patch-2'],
        studentNotes: 'Applied changes for this role',
      }

      const mockResponse = {
        ok: true,
        tailoredResumeId: 'resume-123',
        message: 'Resume saved successfully',
        appliedCount: 2,
        totalPatches: 3,
      }

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await saveTailoredResume(mockRequest)

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/resume/tailored/save'),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mockRequest),
        }
      )
    })

    it('should throw error when not authenticated', async () => {
      ;(authUtils.getIdToken as any).mockResolvedValueOnce(null)

      const mockRequest: SaveTailoredRequest = {
        invitationId: mockInvitationId,
        acceptedPatchIds: [],
      }

      await expect(saveTailoredResume(mockRequest)).rejects.toThrow(
        'Not authenticated'
      )
    })

    it('should handle save errors from API', async () => {
      const mockRequest: SaveTailoredRequest = {
        invitationId: mockInvitationId,
        acceptedPatchIds: ['patch-1'],
      }

      const errorMessage = 'Invalid patches'
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: errorMessage }),
      })

      await expect(saveTailoredResume(mockRequest)).rejects.toThrow(
        errorMessage
      )
    })

    it('should work without optional studentNotes', async () => {
      const mockRequest: SaveTailoredRequest = {
        invitationId: mockInvitationId,
        acceptedPatchIds: ['patch-1'],
      }

      const mockResponse = {
        ok: true,
        tailoredResumeId: 'resume-123',
        message: 'Resume saved',
        appliedCount: 1,
        totalPatches: 1,
      }

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await saveTailoredResume(mockRequest)

      expect(result.tailoredResumeId).toBe('resume-123')
    })
  })

  describe('getTailoredResume', () => {
    it('should successfully retrieve a tailored resume', async () => {
      const resumeId = 'resume-123'
      const mockResponse = {
        id: resumeId,
        invitationId: mockInvitationId,
        originalText: 'Original resume text',
        tailoredText: 'Tailored resume text',
        status: 'active',
        createdAt: new Date().toISOString(),
      }

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await getTailoredResume(resumeId)

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/resume/tailored/${resumeId}`),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          },
        }
      )
    })

    it('should throw error when not authenticated', async () => {
      ;(authUtils.getIdToken as any).mockResolvedValueOnce(null)

      await expect(getTailoredResume('resume-123')).rejects.toThrow(
        'Not authenticated'
      )
    })

    it('should handle 404 errors when resume not found', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Resume not found' }),
      })

      await expect(getTailoredResume('invalid-id')).rejects.toThrow(
        'Resume not found'
      )
    })

    it('should handle network errors during retrieval', async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Connection timeout'))

      await expect(getTailoredResume('resume-123')).rejects.toThrow(
        'Connection timeout'
      )
    })
  })

  describe('listTailoredResumes', () => {
    it('should successfully list all tailored resumes', async () => {
      const mockResponse = {
        resumes: [
          {
            id: 'resume-1',
            invitationId: 'inv-1',
            jobTitle: 'Frontend Engineer',
            status: 'active',
          },
          {
            id: 'resume-2',
            invitationId: 'inv-2',
            jobTitle: 'Backend Engineer',
            status: 'draft',
          },
        ],
      }

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await listTailoredResumes()

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/resume/tailored'),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          },
        }
      )
    })

    it('should throw error when not authenticated', async () => {
      ;(authUtils.getIdToken as any).mockResolvedValueOnce(null)

      await expect(listTailoredResumes()).rejects.toThrow('Not authenticated')
    })

    it('should handle empty list', async () => {
      const mockResponse = { resumes: [] }

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await listTailoredResumes()

      expect(result.resumes).toHaveLength(0)
    })

    it('should handle API errors during list fetch', async () => {
      const errorMessage = 'Database error'
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: errorMessage }),
      })

      await expect(listTailoredResumes()).rejects.toThrow(errorMessage)
    })

    it('should handle network errors during list fetch', async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network unavailable'))

      await expect(listTailoredResumes()).rejects.toThrow('Network unavailable')
    })
  })
})
