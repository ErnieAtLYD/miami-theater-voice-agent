# Testing Setup

This directory contains the test suite for the Miami Theater Voice Agent API.

## Test Structure

```
tests/
├── unit/              # Unit tests for helper functions
├── integration/       # API endpoint integration tests
├── mocks/            # Mock data and utilities
├── setup.js          # Jest global setup
└── README.md         # This file
```

## Test Scripts

- `npm test` - Run all tests
- `npm run test:unit` - Run only unit tests
- `npm run test:integration` - Run only integration tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

## Test Coverage

### Unit Tests (`tests/unit/`)
- Helper function testing for voice formatting
- Date/time conversion utilities
- Data filtering and transformation

### Integration Tests (`tests/integration/`)
- **Showtimes API** (`/api/showtimes`)
  - CORS handling
  - Query parameter processing
  - Response format validation
  - Error handling and fallbacks

- **Cron Ingestion API** (`/api/cron/ingest-showtimes`)
  - Authentication validation
  - Agile API integration
  - Error handling

## Mock Data

The test suite uses mock data that mirrors the production data structure:
- Mock Agile WebSales API responses
- Mock Redis client for development
- Sample showtimes data for O Cinema

## Environment

Tests run in development mode with mock Redis connections. The actual APIs are mocked to prevent external dependencies during testing.

## CI/CD

Tests are automatically run on:
- Push to main/develop branches
- Pull requests to main
- Multiple Node.js versions (18.x, 20.x)

See `.github/workflows/test.yml` for the complete CI configuration.