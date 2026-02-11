# Agent Guidelines for Chrome Plugin Video Manager

## Build & Test Commands

### Core Development Commands
```bash
# Build for production (minified, no sourcemap)
npm run build

# Development mode (watch file changes, inline sourcemap)
npm run watch

# Full development workflow (clean + build + watch)
npm run dev

# Clean build artifacts
npm run clean
```

### Testing Commands
```bash
# Run all tests
npm test

# Watch mode for tests
npm run test:watch

# Run a single test file (example)
npx jest tests/unit/utils/debounce.test.js

# Run tests with coverage
npx jest --coverage

# Run tests matching a pattern
npx jest --testNamePattern="debounce"
```

### Code Quality Commands
```bash
# ESLint check
npm run lint

# ESLint auto-fix
npm run lint:fix
```

## Code Style Guidelines

### File Organization
- **Source code**: `src/` directory with modular structure
  - `src/main.js` - Entry point, initializes VideoSpeedController
  - `src/modules/` - Feature modules (mediaDetector, keyboardHandler, etc.)
  - `src/utils/` - Utility functions (dom, storage, debounce)
- **Tests**: `tests/unit/` mirroring src/ structure
- **Build output**: `content-bundled.js` (IIFE format, loaded by content.js)

### Import/Export Style
```javascript
// Use named exports for utilities and modules
export function debounce(func, wait) { }
export class MediaDetector { }

// Use named imports
import { debounce } from "./utils/debounce.js";
import { MediaDetector } from "./modules/mediaDetector.js";

// Explicit .js extensions required for ES modules
```

### Naming Conventions
- **Files**: camelCase (e.g., `mediaDetector.js`, `debounce.js`)
- **Classes**: PascalCase (e.g., `VideoSpeedController`, `MediaDetector`)
- **Functions/Variables**: camelCase (e.g., `getAllMediaElements`, `isStale`)
- **Constants**: camelCase (e.g., `defaultShortcuts`, `buildOptions`)
- **Private properties**: camelCase (no underscore prefix)

### Code Formatting
- **Indentation**: 4 spaces (ESLint enforced)
- **Quotes**: Single quotes for strings
- **Semicolons**: Required at end of statements
- **Line endings**: Unix (\n)
- **Line length**: No strict limit, but keep readable (~80-100 chars)

### Error Handling Patterns
```javascript
// Try-catch blocks for async operations
try {
  const result = await someAsyncOperation();
} catch (error) {
  console.error("Operation failed:", error);
  // Fallback or cleanup
}

// Promise-based APIs with reject
export function loadSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get({}, (data) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(data);
      }
    });
  });
}

// Silent error handling for non-critical paths
try {
  // Optional enhancement
} catch (e) {
  // Log but don't throw
  console.error("Optional feature failed:", e);
}
```

### Documentation (JSDoc)
```javascript
/**
 * Function description
 * @param {Type} paramName - Parameter description
 * @returns {Type} Return value description
 */
export function myFunction(paramName) {
}

/**
 * Class description
 * @module modules/className
 */
export class MyClass {
  /**
   * Method description
   * @param {Type} param - Description
   */
  myMethod(param) { }
}
```

### Class Structure
```javascript
class MyClass {
  constructor() {
    // Initialize properties
    this.property = value;
  }

  /**
   * Public method
   */
  publicMethod() { }

  /**
   * Private method (documented, but not enforced)
   */
  _privateMethod() { }

  /**
   * Cleanup method
   */
  destroy() {
    // Cleanup listeners, observers, etc.
  }
}
```

### Chrome Extension Specifics
- **Manifest V3**: Uses manifest_version: 3
- **Content scripts**: Loaded via `content.js` → `content-bundled.js`
- **Storage**: Use `chrome.storage.sync` with Promise wrappers
- **Event listeners**: Use capture phase (`true`) for keyboard events
- **IIFE pattern**: Wrap main initialization to avoid pollution
- **Cleanup**: Always add `destroy()` methods for cleanup on page unload

### Testing Guidelines
```javascript
// Use Jest with jsdom environment
describe("moduleName", () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  test("should do something", () => {
    // Arrange, Act, Assert
    expect(result).toBe(expected);
  });
});

// Use fake timers for async/debounce tests
jest.useFakeTimers();
jest.advanceTimersByTime(100);
```

### Anti-Patterns to Avoid
- **No type coercion**: Use `===` and `!==` instead of `==` and `!=`
- **No empty catch blocks**: Always log or handle errors
- **No var**: Use `const` and `let` only
- **No console.log in production**: Use console.error for errors only
- **No inline styles**: Keep styles in separate CSS files or modules
- **No global namespace pollution**: Use ES modules and IIFE patterns

### Performance Considerations
- Use caching for expensive operations (e.g., `MediaDetector` cache)
- Use `WeakMap` for element-related data to prevent memory leaks
- Use `IntersectionObserver` for viewport detection instead of scroll events
- Debounce event handlers (mouse events, resize, etc.)
- Clean up event listeners and observers in `destroy()` methods
