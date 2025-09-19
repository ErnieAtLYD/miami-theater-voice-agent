export default {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {},
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  collectCoverageFrom: [
    'api/**/*.js',
    '!api/**/node_modules/**'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};