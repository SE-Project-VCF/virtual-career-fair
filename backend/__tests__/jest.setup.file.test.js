describe("jest.setup.js", () => {
  afterEach(() => {
    const { applyJestConsoleMocks } = require("../jestSetupConsole");
    applyJestConsoleMocks();
  });

  it("requires jestSetupEnv and applies console mocks when loaded fresh", () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    jest.restoreAllMocks();
    jest.resetModules();
    // eslint-disable-next-line global-require -- intentional fresh load for coverage
    require("../jest.setup");
    expect(process.env.MAPBOX_ACCESS_TOKEN).toBe("test-mapbox-token");
    expect(jest.isMockFunction(console.error)).toBe(true);
    expect(jest.isMockFunction(console.log)).toBe(true);
  });
});
