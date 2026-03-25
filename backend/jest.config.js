module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>", "<rootDir>/__tests__"],
  testMatch: ["**/*.test.js"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  clearMocks: true,
  collectCoverageFrom: [
    "server.js", "helpers.js", "resumeTailorHelpers.js",
    "routes/**/*.js",
    "console.js", "resumeParser.js", "resumeTailorSimple.js",
    "patchApplier.js", "patchValidator.js",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
};
