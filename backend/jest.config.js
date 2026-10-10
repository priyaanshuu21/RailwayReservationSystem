/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts", "<rootDir>/src/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js"],
  testTimeout: 60000,
  setupFiles: ["<rootDir>/tests/setup.ts"],
  reporters: ["default"]
};