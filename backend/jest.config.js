module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>", "<rootDir>/__tests__", "<rootDir>/scripts"],
  testMatch: ["**/*.test.js", "**/*.test.mjs"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  clearMocks: true,
  collectCoverageFrom: ["server.js", "helpers.js", "routes/fairs.js"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  transform: {}, // disables babel/jest transform for .mjs
};
