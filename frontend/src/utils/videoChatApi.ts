/**
 * Video Chat API Utilities
 * Centralized functions for all video chat backend API calls
 */

import { getAuth } from 'firebase/auth';

const API_BASE = '/api';

// Helper to get Firebase token
async function getToken() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.getIdToken();
}

// Helper for API calls
async function apiCall(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = await getToken();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `API Error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Shortlist Management
 */

export async function addToShortlist(studentId: string, notes: string = '') {
  return apiCall('/shortlist/add', {
    method: 'POST',
    body: JSON.stringify({ studentId, notes }),
  });
}

export async function getShortlist() {
  return apiCall('/shortlist/list');
}

export async function removeFromShortlist(studentId: string) {
  return apiCall(`/shortlist/${studentId}`, {
    method: 'DELETE',
  });
}

/**
 * 1v1 Call Management
 */

export async function schedulCall(
  studentId: string,
  proposedTimes: Array<{ startTime: string; endTime: string }>,
  notes: string = ''
) {
  return apiCall('/calls/schedule-1v1', {
    method: 'POST',
    body: JSON.stringify({
      studentId,
      proposedTimes,
      notes,
    }),
  });
}

export async function getMyScheduledCalls() {
  return apiCall('/calls/my-scheduled');
}

export async function getMyCallInvitations() {
  return apiCall('/calls/my-invitations');
}

export async function respondToCall(
  callId: string,
  response: 'accepted' | 'declined',
  acceptedTimeIndex?: number,
  inviteId?: string
) {
  return apiCall(`/calls/${callId}/respond`, {
    method: 'PATCH',
    body: JSON.stringify({
      response,
      acceptedTimeIndex,
      inviteId,
    }),
  });
}

export async function getCallDetails(callId: string) {
  return apiCall(`/calls/${callId}/join`);
}

export async function cancelCall(callId: string) {
  return apiCall(`/calls/${callId}/cancel`, {
    method: 'PATCH',
  });
}

/**
 * Q&A Session Management
 */

export async function createQASession(
  fairId: string,
  title: string,
  description: string,
  scheduledTime: string,
  maxDuration: number
) {
  return apiCall('/sessions/create-qa', {
    method: 'POST',
    body: JSON.stringify({
      fairId,
      title,
      description,
      scheduledTime,
      maxDuration,
    }),
  });
}

export async function getActiveSessions(fairId: string) {
  return apiCall(`/sessions/active/${fairId}`);
}

export async function joinSession(sessionId: string) {
  return apiCall(`/sessions/${sessionId}/join`, {
    method: 'POST',
  });
}

export async function togglePresentationMode(sessionId: string, isPresentationMode: boolean) {
  return apiCall(`/sessions/${sessionId}/toggle-mode`, {
    method: 'PATCH',
    body: JSON.stringify({ isPresentationMode }),
  });
}

export async function raiseHand(sessionId: string) {
  return apiCall(`/sessions/${sessionId}/raise-hand`, {
    method: 'POST',
  });
}

export async function lowerHand(sessionId: string) {
  return apiCall(`/sessions/${sessionId}/lower-hand`, {
    method: 'POST',
  });
}
