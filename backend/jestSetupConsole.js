"use strict";

function applyJestConsoleMocks() {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
}

module.exports = { applyJestConsoleMocks };
