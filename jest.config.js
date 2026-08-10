const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  displayName: "circuvent-technologies",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    /*
     * One React, always.
     *
     * The app under `mobile/` has its own node_modules, so a hook imported
     * from `mobile/src/**` resolves React by walking up from there and finds
     * the app's copy, while the test renderer uses the root's. Two copies means
     * two independent hook dispatchers, and the second one is null: any test of
     * a mobile hook fails with "Cannot read properties of null (reading
     * 'useRef')", which reads like a bug in the hook rather than in resolution.
     */
    "^react$": "<rootDir>/node_modules/react",
    "^react-dom$": "<rootDir>/node_modules/react-dom",
  },
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.{ts,tsx}",
    "<rootDir>/src/**/*.{test,spec}.{ts,tsx}",
    "<rootDir>/tests/**/*.{test,spec}.{ts,tsx}",
  ],
};

module.exports = createJestConfig(config);
