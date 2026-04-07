/**
 * Guards the contract established by jest.setup.js + jestSetupEnv.js (setupFiles run before all tests).
 * If these fail, global test env or Mapbox-related tests may behave incorrectly.
 */
describe("jest.setup.js global environment", () => {
  it("sets NODE_ENV to test", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("sets MAPBOX_ACCESS_TOKEN so geocoding modules can run in unit tests", () => {
    expect(process.env.MAPBOX_ACCESS_TOKEN).toBeTruthy();
    expect(process.env.MAPBOX_ACCESS_TOKEN).toBe("test-mapbox-token");
  });

  it("sets core secrets and Stream env used across the suite", () => {
    expect(process.env.STREAM_API_KEY).toBe("test-stream-key");
    expect(process.env.STREAM_API_SECRET).toBe("test-stream-secret");
    expect(process.env.ADMIN_SECRET_KEY).toBe("test-admin-secret");
    expect(process.env.INVITE_CODE_SECRET).toHaveLength(64);
  });

  it("mocks console.error and console.log to reduce noise (spy still callable)", () => {
    expect(jest.isMockFunction(console.error)).toBe(true);
    expect(jest.isMockFunction(console.log)).toBe(true);
  });
});
