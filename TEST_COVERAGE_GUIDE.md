# Test Coverage Guide

This guide explains how to run tests and view test coverage for both the frontend and backend of the Virtual Career Fair application.

## Quick Start

### Frontend Tests
```bash
cd frontend
npm test              # Run all tests once
npm test:watch       # Watch mode (auto-rerun on changes)
npm run test:coverage # Generate coverage report
```

### Backend Tests
```bash
cd backend
npm test              # Run all tests once
npm test:watch       # Watch mode (auto-rerun on changes)
npm test:coverage    # Generate coverage report
```

---

## Frontend Testing

### Setup
The frontend uses **Vitest** as the test runner with React Testing Library for component testing.

**Installed Tools:**
- `vitest` - Fast unit test framework
- `@testing-library/react` - Component testing utilities
- `@testing-library/user-event` - User interaction simulation
- `@vitest/coverage-v8` - Code coverage reporting

### Test Files Location
```
frontend/src/
├── components/__tests__/        # Component tests (5 files)
├── pages/__tests__/             # Page tests (11 files)
└── utils/__tests__/             # Utility tests (6 files)
```

### Running Tests

#### Run All Tests Once
```bash
cd frontend
npm test
```
**Output:** Shows test results with pass/fail status for each test file and individual test cases.

#### Run Tests in Watch Mode
```bash
cd frontend
npm test:watch
```
**Output:** Continuous testing mode. Tests automatically rerun when files change. Press:
- `a` - Run all tests
- `f` - Run failed tests only
- `p` - Filter by filename
- `q` - Quit watch mode

#### Generate Coverage Report
```bash
cd frontend
npm run test:coverage
```
**Output:**
- Terminal shows coverage summary (statements, branches, functions, lines)
- Generates HTML report in `frontend/coverage/index.html`

### Viewing Coverage Report

**Option 1: Open HTML Report**
```bash
open frontend/coverage/index.html    # macOS
xdg-open frontend/coverage/index.html # Linux
start frontend/coverage/index.html   # Windows
```

**Option 2: View in Terminal**
The coverage command displays a summary in the terminal showing:
- **Statements:** Percentage of executable statements covered
- **Branches:** Percentage of conditional branches tested
- **Functions:** Percentage of functions called in tests
- **Lines:** Percentage of code lines executed

### Frontend Test Coverage

**Current Test Files:**
- 22 test files created
- 115 total tests
- Coverage includes:
  - **5 Chat Components:** ChatHeader, ChatSidebar, MessageList, NewChatDialog, EventList
  - **11 Pages:** Register, Booths, BoothEditor, BoothView, ChatPage, Company, CompanyManagement, InviteCodeManager, StudentProfilePage, VerifyEmail, AdminDashboard
  - **1 Utility:** streamClient

### Test Configuration

**vite.config.ts** includes:
```typescript
test: {
  globals: true,              // Global test functions (describe, it, expect)
  environment: 'jsdom',       // Browser-like environment
  setupFiles: './src/test/setup.ts',
  css: false,
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    exclude: ['node_modules/', 'src/test/']
  }
}
```

---

## Backend Testing

### Setup
The backend uses **Jest** as the test runner with supertest for API testing.

**Installed Tools:**
- `jest` - JavaScript testing framework
- `supertest` - HTTP assertion library for testing Express endpoints

### Test Files Location
```
backend/
├── __tests__/              # Test directory
└── jest.config.js         # Jest configuration
```

### Running Tests

#### Run All Tests Once
```bash
cd backend
npm test
```
**Output:** Shows test results with pass/fail status and timing information.

#### Run Tests in Watch Mode
```bash
cd backend
npm test:watch
```
**Output:** Continuous testing mode. Tests automatically rerun when files change.

#### Generate Coverage Report
```bash
cd backend
npm test:coverage
```
**Output:**
- Terminal shows coverage summary with detailed file breakdown
- Coverage data in formats suitable for CI/CD integration

### Backend Test Coverage

The backend tests cover:
- API endpoints
- Authentication and authorization
- Error handling
- Database operations
- Integration with Firebase and Stream Chat

### Test Configuration

**jest.config.js** includes:
- Test environment setup
- Coverage configuration
- File pattern matching

---

## Comparing Coverage Reports

### Frontend vs Backend

| Aspect | Frontend | Backend |
|--------|----------|---------|
| **Framework** | Vitest | Jest |
| **Coverage Tool** | v8 | Built-in Jest |
| **Report Format** | HTML + Terminal | Terminal + JSON |
| **Test Type** | Component + Unit | Integration + Unit |
| **Browser Env** | jsdom | Node.js |

### Reading Coverage Numbers

**Coverage Percentage Meaning:**
- **80-100%:** Excellent - Most critical code paths tested
- **60-80%:** Good - Good test coverage for main features
- **40-60%:** Fair - Core functionality tested, edge cases missing
- **< 40%:** Poor - Limited coverage, needs more tests

**Coverage Metrics:**
- **Statements:** Individual lines of code executed
- **Branches:** if/else, switch cases, ternary operators
- **Functions:** Functions that were called during tests
- **Lines:** Physical lines of code in source files

---

## Best Practices

### Writing Tests

1. **Use Descriptive Names**
   ```typescript
   it("renders button and calls onClick when clicked", () => {
     // Good test name describes behavior
   })
   ```

2. **Test Behavior, Not Implementation**
   ```typescript
   // Good - tests what user sees
   expect(screen.getByText("Submit")).toBeInTheDocument()

   // Bad - tests internal state
   expect(component.state).toBe(true)
   ```

3. **Keep Tests Focused**
   ```typescript
   // One describe block per component/function
   describe("Button", () => {
     it("renders with label")
     it("calls onClick when clicked")
     it("disables when disabled prop is true")
   })
   ```

### Running Tests Effectively

1. **Before Committing:**
   ```bash
   npm test              # Verify all tests pass
   npm run test:coverage # Check coverage changes
   ```

2. **During Development:**
   ```bash
   npm test:watch       # Keep tests running while coding
   ```

3. **Before Deployment:**
   ```bash
   npm run test:coverage # Generate final coverage report
   ```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: cd frontend && npm ci && npm run test:coverage
      - run: cd backend && npm ci && npm run test:coverage
```

---

## Troubleshooting

### Frontend Issues

**Issue:** Tests timeout or hang
- **Solution:** Check for infinite loops in mocked functions
- **Solution:** Increase timeout: `it("test", () => {}, 10000)`

**Issue:** Coverage report not generated
- **Solution:** Ensure `@vitest/coverage-v8` is installed: `npm install --save-dev @vitest/coverage-v8`
- **Solution:** Check vite.config.ts has coverage configuration

**Issue:** "Cannot find module" errors
- **Solution:** Run `npm install` to ensure all dependencies are installed
- **Solution:** Check mock setup in `src/test/setup.ts`

### Backend Issues

**Issue:** Database tests fail
- **Solution:** Ensure Firebase credentials are set in environment
- **Solution:** Use Firebase emulator for local testing

**Issue:** Coverage not showing all files
- **Solution:** Configure jest.config.js collectCoverageFrom patterns
- **Solution:** Check exclude patterns

---

## Coverage Goals

### Recommended Coverage Targets
- **Statements:** 80%+
- **Branches:** 75%+
- **Functions:** 80%+
- **Lines:** 80%+

### Critical Paths to Test
1. **Authentication flows** - Login, register, logout
2. **User interactions** - Form submission, button clicks
3. **Data fetching** - API calls, Firebase queries
4. **Error handling** - Error messages, fallback states
5. **Navigation** - Route changes, redirects

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Docs](https://github.com/visionmedia/supertest)

---

## Quick Reference

### Frontend Commands
```bash
npm test                    # Run tests once
npm test:watch             # Run tests in watch mode
npm run test:coverage      # Generate coverage report
npm test -- filename       # Run specific test file
npm test -- --reporter=verbose  # Verbose output
```

### Backend Commands
```bash
npm test                    # Run tests once
npm test:watch             # Run tests in watch mode
npm test:coverage          # Generate coverage report
npm test -- --testNamePattern="pattern"  # Run specific tests
```

---

## Questions?

For issues or questions about testing:
1. Check the test setup files: `frontend/src/test/setup.ts` and `backend/jest.config.js`
2. Review existing test files for examples
3. Consult framework documentation (Vitest, Jest, Testing Library)
