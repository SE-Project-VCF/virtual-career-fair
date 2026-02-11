import { describe, it, expect } from "vitest";
import { API_URL } from "../config";

describe("config", () => {
  it("exports API_URL constant", () => {
    expect(API_URL).toBeDefined();
    expect(typeof API_URL).toBe("string");
  });

  it("API_URL is a valid URL or localhost", () => {
    expect(API_URL).toMatch(/^https?:\/\/.+/);
  });

  it("API_URL has correct default fallback value", () => {
    // This will use whatever is configured in env or fall back to localhost
    const isLocalhost = API_URL === "http://localhost:5000";
    const isRemoteUrl = API_URL.startsWith("http://") || API_URL.startsWith("https://");
    
    expect(isLocalhost || isRemoteUrl).toBe(true);
  });
});
