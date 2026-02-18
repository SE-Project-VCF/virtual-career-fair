import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import {
  useCompany,
  useJobs,
  useFairStatus,
  useFairSchedules,
  useCreateJob,
  useUpdateJob,
  useDeleteJob,
  useCreateBooth,
  useSyncStreamUser,
} from "../useApi";
import { auth } from "../../firebase";

// Get mocked function for manipulation in tests
const mockGetIdToken = vi.mocked(auth.currentUser.getIdToken);

// Mock firebase auth
vi.mock("../../firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(),
    },
  },
}));

// Mock fetch
global.fetch = vi.fn();

// Helper to create React Query wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetIdToken.mockResolvedValue("mock-token");
});

describe("useCompany", () => {
  it("fetches company data when companyId is provided", async () => {
    const mockCompany = { id: "comp1", name: "Tech Corp" };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockCompany,
    } as Response);

    const { result } = renderHook(() => useCompany("comp1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockCompany);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/company/comp1"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mock-token",
        }),
      })
    );
  });

  it("is disabled when companyId is undefined", () => {
    const { result } = renderHook(() => useCompany(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("handles fetch errors", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "Not found" }),
    } as Response);

    const { result } = renderHook(() => useCompany("comp1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useJobs", () => {
  it("fetches jobs for a company when companyId is provided", async () => {
    const mockJobs = [
      { id: "job1", name: "Engineer" },
      { id: "job2", name: "Designer" },
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockJobs,
    } as Response);

    const { result } = renderHook(() => useJobs("comp1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockJobs);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs?companyId=comp1"),
      undefined
    );
  });

  it("is disabled when companyId is undefined", () => {
    const { result } = renderHook(() => useJobs(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("makes unauthenticated request (no auth headers)", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    renderHook(() => useJobs("comp1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(fetch).toHaveBeenCalled());

    // Verify no Authorization header (second argument should be undefined or not include auth)
    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[1]).toBeUndefined();
  });
});

describe("useFairStatus", () => {
  it("fetches fair status", async () => {
    const mockStatus = { isOpen: true, message: "Fair is open" };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    const { result } = renderHook(() => useFairStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockStatus);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/fair-status"),
      undefined
    );
  });

  it("makes unauthenticated request", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ isOpen: false }),
    } as Response);

    renderHook(() => useFairStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(fetch).toHaveBeenCalled());

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[1]).toBeUndefined();
  });
});

describe("useFairSchedules", () => {
  it("fetches public schedules", async () => {
    const mockSchedules = [
      { id: "s1", date: "2024-01-01" },
      { id: "s2", date: "2024-01-02" },
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockSchedules,
    } as Response);

    const { result } = renderHook(() => useFairSchedules(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockSchedules);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/public/fair-schedules"),
      undefined
    );
  });
});

describe("useCreateJob", () => {
  it("creates job with authenticated request", async () => {
    const mockResponse = { id: "new-job", success: true };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { result } = renderHook(() => useCreateJob(), {
      wrapper: createWrapper(),
    });

    const jobData = {
      companyId: "comp1",
      name: "Engineer",
      description: "Build things",
      majorsAssociated: "CS",
      applicationLink: "https://apply.com",
    };

    result.current.mutate(jobData);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-token",
        }),
        body: JSON.stringify(jobData),
      })
    );
  });

  it("handles creation errors", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid data" }),
    } as Response);

    const { result } = renderHook(() => useCreateJob(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      companyId: "comp1",
      name: "Job",
      description: "Desc",
      majorsAssociated: "CS",
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateJob", () => {
  it("updates job with authenticated request", async () => {
    const mockResponse = { success: true };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { result } = renderHook(() => useUpdateJob(), {
      wrapper: createWrapper(),
    });

    const updateData = {
      jobId: "job1",
      companyId: "comp1",
      name: "Senior Engineer",
      description: "Build complex things",
      majorsAssociated: "CS, EE",
    };

    result.current.mutate(updateData);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs/job1"),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-token",
        }),
      })
    );
  });
});

describe("useDeleteJob", () => {
  it("deletes job with authenticated request", async () => {
    const mockResponse = { success: true };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { result } = renderHook(() => useDeleteJob(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ jobId: "job1", companyId: "comp1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs/job1"),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-token",
        }),
      })
    );
  });

  it("handles deletion errors", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "Job not found" }),
    } as Response);

    const { result } = renderHook(() => useDeleteJob(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ jobId: "job1", companyId: "comp1" });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCreateBooth", () => {
  it("creates booth with authenticated request", async () => {
    const mockResponse = { id: "booth1", success: true };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { result } = renderHook(() => useCreateBooth(), {
      wrapper: createWrapper(),
    });

    const boothData = {
      companyId: "comp1",
      boothName: "Main Booth",
      location: "Hall A",
      description: "Our booth",
      representatives: ["rep1", "rep2"],
    };

    result.current.mutate(boothData);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/booths"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-token",
        }),
        body: JSON.stringify(boothData),
      })
    );
  });
});

describe("useSyncStreamUser", () => {
  it("syncs user with Stream (unauthenticated)", async () => {
    const mockResponse = { success: true };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { result } = renderHook(() => useSyncStreamUser(), {
      wrapper: createWrapper(),
    });

    const userData = {
      uid: "user1",
      email: "user@test.com",
      firstName: "John",
      lastName: "Doe",
    };

    result.current.mutate(userData);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/sync-stream-user"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(userData),
      })
    );
  });

  it("handles sync errors", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Stream error" }),
    } as Response);

    const { result } = renderHook(() => useSyncStreamUser(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      uid: "user1",
      email: "user@test.com",
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
