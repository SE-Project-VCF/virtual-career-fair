/**
 * frontend/src/utils/resume.ts
 * 
 * Utility functions for resume tailoring
 */

import { API_URL } from "../config";
import { authUtils } from "./auth";

export interface TailorRequest {
  invitationId: string;
  jobId?: string;
  jobTitle?: string;
  jobDescription: string;
  requiredSkills?: string;
}

export interface TailorResponse {
  ok: boolean;
  patches: any[];
  verification?: {
    issues: any[];
  };
  skill_suggestions?: Array<{
    skill: string;
    presentInResume: boolean;
    reason: string;
    addIfYouHave?: boolean;
  }>;
  provider?: string;
  model?: string;
}

export interface SaveTailoredRequest {
  invitationId: string;
  acceptedPatchIds: string[];
  studentNotes?: string;
}

export interface SaveTailoredResponse {
  ok: boolean;
  tailoredResumeId: string;
  message: string;
  appliedCount: number;
  totalPatches: number;
}

/**
 * Generate resume patches for a job
 */
export async function generateTailorPatches(
  request: TailorRequest
): Promise<TailorResponse> {
  try {
    const token = await authUtils.getIdToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_URL}/api/resume/tailor/v2`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to generate patches");
    }

    return await response.json();
  } catch (err: any) {
    console.error("Error generating patches:", err);
    throw err;
  }
}

/**
 * Save tailored resume with accepted patches
 */
export async function saveTailoredResume(
  request: SaveTailoredRequest
): Promise<SaveTailoredResponse> {
  try {
    const token = await authUtils.getIdToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_URL}/api/resume/tailored/save`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to save tailored resume");
    }

    return await response.json();
  } catch (err: any) {
    console.error("Error saving tailored resume:", err);
    throw err;
  }
}

/**
 * Retrieve a specific tailored resume
 */
export async function getTailoredResume(
  tailoredResumeId: string
): Promise<any> {
  try {
    const token = await authUtils.getIdToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(
      `${API_URL}/api/resume/tailored/${tailoredResumeId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to retrieve resume");
    }

    return await response.json();
  } catch (err: any) {
    console.error("Error retrieving tailored resume:", err);
    throw err;
  }
}

/**
 * List all tailored resumes for user
 */
export async function listTailoredResumes(): Promise<any> {
  try {
    const token = await authUtils.getIdToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_URL}/api/resume/tailored`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to list resumes");
    }

    return await response.json();
  } catch (err: any) {
    console.error("Error listing tailored resumes:", err);
    throw err;
  }
}
