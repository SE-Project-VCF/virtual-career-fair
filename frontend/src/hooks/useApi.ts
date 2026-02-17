import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { auth } from "../firebase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Helper function to get auth headers
async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }
  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Helper function for authenticated fetch
async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Hook for fetching company data
export function useCompany(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company", companyId],
    queryFn: () => authenticatedFetch(`/api/company/${companyId}`),
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Hook for fetching jobs by company
export function useJobs(companyId: string | undefined) {
  return useQuery({
    queryKey: ["jobs", companyId],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/jobs?companyId=${companyId}`);
      if (!response.ok) throw new Error("Failed to fetch jobs");
      return response.json();
    },
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000, // 3 minutes
  });
}

// Hook for fetching fair status
export function useFairStatus() {
  return useQuery({
    queryKey: ["fairStatus"],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/fair-status`);
      if (!response.ok) throw new Error("Failed to fetch fair status");
      return response.json();
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Refetch every minute
  });
}

// Hook for fetching public fair schedules
export function useFairSchedules() {
  return useQuery({
    queryKey: ["fairSchedules"],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/public/fair-schedules`);
      if (!response.ok) throw new Error("Failed to fetch schedules");
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook for creating a job
export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobData: {
      companyId: string;
      name: string;
      description: string;
      majorsAssociated: string;
      applicationLink?: string;
    }) => authenticatedFetch("/api/jobs", {
      method: "POST",
      body: JSON.stringify(jobData),
    }),
    onSuccess: (_, variables) => {
      // Invalidate and refetch jobs for this company
      queryClient.invalidateQueries({ queryKey: ["jobs", variables.companyId] });
      queryClient.invalidateQueries({ queryKey: ["company", variables.companyId] });
    },
  });
}

// Hook for updating a job
export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      jobId,
      companyId,
      ...jobData
    }: {
      jobId: string;
      companyId: string;
      name: string;
      description: string;
      majorsAssociated: string;
      applicationLink?: string;
    }) => authenticatedFetch(`/api/jobs/${jobId}`, {
      method: "PUT",
      body: JSON.stringify(jobData),
    }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", variables.companyId] });
      queryClient.invalidateQueries({ queryKey: ["company", variables.companyId] });
    },
  });
}

// Hook for deleting a job
export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, companyId }: { jobId: string; companyId: string }) =>
      authenticatedFetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", variables.companyId] });
      queryClient.invalidateQueries({ queryKey: ["company", variables.companyId] });
    },
  });
}

// Hook for creating a booth
export function useCreateBooth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (boothData: {
      companyId: string;
      boothName: string;
      location?: string;
      description?: string;
      representatives?: string[];
    }) => authenticatedFetch("/api/booths", {
      method: "POST",
      body: JSON.stringify(boothData),
    }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["company", variables.companyId] });
    },
  });
}

// Hook for syncing Stream user
export function useSyncStreamUser() {
  return useMutation({
    mutationFn: async (userData: {
      uid: string;
      email: string;
      firstName?: string;
      lastName?: string;
    }) => {
      const response = await fetch(`${API_URL}/api/sync-stream-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });
      if (!response.ok) throw new Error("Failed to sync Stream user");
      return response.json();
    },
  });
}

export { API_URL };
