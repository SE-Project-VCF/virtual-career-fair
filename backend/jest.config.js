module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>", "<rootDir>/__tests__"],
  testMatch: ["**/*.test.js"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  clearMocks: true,
  collectCoverageFrom: ["server.js", "helpers.js", "routes/fairs.js"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
};
