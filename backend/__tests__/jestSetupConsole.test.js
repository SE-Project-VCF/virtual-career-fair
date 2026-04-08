const { applyJestConsoleMocks } = require("../jestSetupConsole");

describe("jestSetupConsole", () => {
  afterEach(() => {
    applyJestConsoleMocks();
  });

  it("applyJestConsoleMocks installs jest mocks on console.error and console.log", () => {
    jest.restoreAllMocks();
    applyJestConsoleMocks();
    expect(jest.isMockFunction(console.error)).toBe(true);
    expect(jest.isMockFunction(console.log)).toBe(true);
    console.error("x");
    console.log("y");
    expect(console.error).toHaveBeenCalledWith("x");
    expect(console.log).toHaveBeenCalledWith("y");
  });
});
