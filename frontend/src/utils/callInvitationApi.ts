import { authUtils } from './auth';
import { API_URL } from '../config';

export interface CallInvitation {
  id: string;
  employerId: string;
  employerName: string;
  employerCompanyId?: string;
  employerCompanyName?: string;
  studentId: string;
  studentName: string;
  scheduledTime: number;
  duration: number;
  description?: string;
  jitsiRoom: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed';
  createdAt: number;
  respondedAt?: number;
  startedAt?: number;
  endedAt?: number;
}

/**
 * Create a new 1x1 call invitation
 */
export async function createCallInvitation(
  studentId: string,
  scheduledTime: Date,
  duration: number,
  description?: string
): Promise<{ success: boolean; invitationId?: string; error?: string }> {
  try {
    const token = await authUtils.getIdToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_URL}/api/call-invitations/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        studentId,
        scheduledTime: scheduledTime.toISOString(),
        duration,
        description: description || '',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Failed to create invitation' };
    }

    const data = await response.json();
    return { success: true, invitationId: data.invitationId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Get incoming call invitations for a student
 */
export async function getIncomingCallInvitations(): Promise<{ success: boolean; data?: CallInvitation[]; error?: string }> {
  try {
    const token = await authUtils.getIdToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_URL}/api/call-invitations/incoming`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Failed to fetch invitations' };
    }

    const data = await response.json();
    return { success: true, data: data.invitations || [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error fetching incoming invitations:', err);
    return { success: false, error: message };
  }
}

/**
 * Get outgoing call invitations for an employer
 */
export async function getOutgoingCallInvitations(): Promise<{ success: boolean; data?: CallInvitation[]; error?: string }> {
  try {
    const token = await authUtils.getIdToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_URL}/api/call-invitations/outgoing`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Failed to fetch invitations' };
    }

    const data = await response.json();
    return { success: true, data: data.invitations || [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error fetching outgoing invitations:', err);
    return { success: false, error: message };
  }
}

/**
 * Accept a call invitation
 */
export async function acceptCallInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await authUtils.getIdToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_URL}/api/call-invitations/${invitationId}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Failed to accept invitation' };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Decline a call invitation
 */
export async function declineCallInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await authUtils.getIdToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_URL}/api/call-invitations/${invitationId}/decline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Failed to decline invitation' };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Cancel a call invitation (employer only)
 */
export async function cancelCallInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await authUtils.getIdToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_URL}/api/call-invitations/${invitationId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Failed to cancel invitation' };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Join a 1x1 call
 */
export async function joinCall(
  invitationId: string
): Promise<{
  success: boolean;
  jitsiRoom?: string;
  userName?: string;
  employerName?: string;
  studentName?: string;
  description?: string;
  error?: string;
}> {
  try {
    const token = await authUtils.getIdToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_URL}/api/call-invitations/${invitationId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Failed to join call' };
    }

    const data = await response.json();
    return {
      success: true,
      jitsiRoom: data.jitsiRoom,
      userName: data.userName,
      employerName: data.employerName,
      studentName: data.studentName,
      description: data.description,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}
