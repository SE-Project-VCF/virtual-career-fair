describe("jestSetupEnv", () => {
  it("sets MAPBOX_ACCESS_TOKEN and other test env vars when required", () => {
    jest.resetModules();
    delete process.env.MAPBOX_ACCESS_TOKEN;
    delete process.env.STREAM_API_KEY;
    // eslint-disable-next-line global-require -- intentional fresh load for coverage
    require("../jestSetupEnv");
    expect(process.env.MAPBOX_ACCESS_TOKEN).toBe("test-mapbox-token");
    expect(process.env.STREAM_API_KEY).toBe("test-stream-key");
    expect(process.env.NODE_ENV).toBe("test");
    expect(process.env.PORT).toBe("0");
  });
});
