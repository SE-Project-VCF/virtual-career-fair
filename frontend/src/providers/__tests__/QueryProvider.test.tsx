import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QueryProvider, queryClient } from "../QueryProvider";

describe("QueryProvider", () => {
  describe("Rendering", () => {
    it("renders children components", () => {
      render(
        <QueryProvider>
          <div data-testid="test-child">Test Child</div>
        </QueryProvider>
      );

      expect(screen.getByTestId("test-child")).toBeInTheDocument();
      expect(screen.getByText("Test Child")).toBeInTheDocument();
    });

    it("provides QueryClient to child components", () => {
      const TestComponent = () => {
        const client = useQueryClient();
        return <div data-testid="has-client">{client ? "Has Client" : "No Client"}</div>;
      };

      render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      expect(screen.getByTestId("has-client")).toHaveTextContent("Has Client");
    });
  });

  describe("QueryClient Configuration", () => {
    it("has correct default query options", () => {
      const defaultOptions = queryClient.getDefaultOptions();

      expect(defaultOptions.queries?.staleTime).toBe(5 * 60 * 1000); // 5 minutes
      expect(defaultOptions.queries?.gcTime).toBe(10 * 60 * 1000); // 10 minutes
      expect(defaultOptions.queries?.retry).toBe(1);
      expect(defaultOptions.queries?.refetchOnWindowFocus).toBe(true);
      expect(defaultOptions.queries?.refetchOnMount).toBe(false);
    });

    it("has correct default mutation options", () => {
      const defaultOptions = queryClient.getDefaultOptions();

      expect(defaultOptions.mutations?.retry).toBe(1);
    });
  });

  describe("React Query Integration", () => {
    it("child components can use useQuery hooks", async () => {
      const mockFetcher = vi.fn().mockResolvedValue({ data: "test data" });

      const TestComponent = () => {
        const { data, isSuccess } = useQuery({
          queryKey: ["test"],
          queryFn: mockFetcher,
        });

        return (
          <div>
            {isSuccess && <div data-testid="query-data">{data.data}</div>}
            {!isSuccess && <div data-testid="loading">Loading...</div>}
          </div>
        );
      };

      render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("query-data")).toHaveTextContent("test data");
      });

      expect(mockFetcher).toHaveBeenCalled();
    });

    it("child components can use useMutation hooks", async () => {
      const mockMutate = vi.fn().mockResolvedValue({ success: true });

      const TestComponent = () => {
        const mutation = useMutation({
          mutationFn: mockMutate,
        });

        return (
          <div>
            <button onClick={() => mutation.mutate({ test: "data" })}>
              Mutate
            </button>
            {mutation.isSuccess && <div data-testid="mutation-success">Success</div>}
          </div>
        );
      };

      render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      const button = screen.getByRole("button", { name: "Mutate" });
      button.click();

      await waitFor(() => {
        expect(screen.getByTestId("mutation-success")).toBeInTheDocument();
      });

      expect(mockMutate).toHaveBeenCalled();
      expect(mockMutate.mock.calls[0][0]).toEqual({ test: "data" });
    });

    it("query client persists across re-renders", () => {
      const clients: any[] = [];

      const TestComponent = () => {
        const client = useQueryClient();
        clients.push(client);
        return <div>Test</div>;
      };

      const { rerender } = render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      rerender(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      // Same client instance should be used
      expect(clients.length).toBe(2);
      expect(clients[0]).toBe(clients[1]);
    });
  });
});
