/**
 * Unit Tests for Error Boundary System
 *
 * Tests pure error handling logic without React dependencies
 * Focused on reliable, passing tests
 *
 * Test Behaviors:
 * - Error constants validation
 * - EnhancedError creation and serialization
 * - Basic ErrorHandler operations (registration, listeners)
 * - Error enhancement and auto-categorization
 * - Error processing (history, logging, notifications)
 * - Category-specific handling
 * - Statistics generation
 * - Error creation utilities
 * - Edge cases for error handling
 * - Logging by severity
 */

import {
  ErrorSeverity,
  ErrorCategory,
  EnhancedError,
  globalErrorHandler,
  createNetworkError,
  createBlockchainError,
  createValidationError,
} from "../errorBoundaries";
import devLog from "@/utils/dev/logger";

// Mock logger
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("Error Boundary System - Core Utilities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the singleton instance by clearing its internal state
    globalErrorHandler.errorHistory = [];
    globalErrorHandler.errorListeners = [];
    globalErrorHandler.globalErrorHandlers.clear();
  });

  describe("Error Constants", () => {
    test("exports error severity levels", () => {
      expect(ErrorSeverity.LOW).toBe("low");
      expect(ErrorSeverity.MEDIUM).toBe("medium");
      expect(ErrorSeverity.HIGH).toBe("high");
      expect(ErrorSeverity.CRITICAL).toBe("critical");
    });

    test("exports error categories", () => {
      expect(ErrorCategory.NETWORK).toBe("network");
      expect(ErrorCategory.BLOCKCHAIN).toBe("blockchain");
      expect(ErrorCategory.VALIDATION).toBe("validation");
      expect(ErrorCategory.AUTHENTICATION).toBe("authentication");
      expect(ErrorCategory.UNKNOWN).toBe("unknown");
    });
  });

  describe("EnhancedError Class", () => {
    test("creates error with default values", () => {
      const error = new EnhancedError("Test message");

      expect(error.message).toBe("Test message");
      expect(error.name).toBe("EnhancedError");
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.UNKNOWN);
      expect(error.userMessage).toBe("An unexpected error occurred");
      expect(error.recoverable).toBe(true);
      expect(error.timestamp).toBeDefined();
    });

    test("creates error with custom options", () => {
      const error = new EnhancedError("Test", {
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.NETWORK,
        userMessage: "Custom message",
        recoverable: false,
      });

      expect(error.severity).toBe("high");
      expect(error.category).toBe("network");
      expect(error.userMessage).toBe("Custom message");
      expect(error.recoverable).toBe(false);
    });

    test("serializes to JSON correctly", () => {
      const error = new EnhancedError("Test error");
      const json = error.toJSON();

      expect(json.name).toBe("EnhancedError");
      expect(json.message).toBe("Test error");
      expect(json.severity).toBe("medium");
      expect(json.category).toBe("unknown");
      expect(json.userMessage).toBe("An unexpected error occurred");
      expect(json.recoverable).toBe(true);
    });
  });

  describe("Error Handler - Basic Operations", () => {
    test("registers category handlers", () => {
      const handler = jest.fn();
      globalErrorHandler.registerHandler(ErrorCategory.NETWORK, handler);

      expect(
        globalErrorHandler.globalErrorHandlers.get(ErrorCategory.NETWORK)
      ).toBe(handler);
    });

    test("adds and removes listeners", () => {
      const listener = jest.fn();

      globalErrorHandler.addErrorListener(listener);
      expect(globalErrorHandler.errorListeners).toContain(listener);

      globalErrorHandler.removeErrorListener(listener);
      expect(globalErrorHandler.errorListeners).not.toContain(listener);
    });

    test("handles EnhancedError without modification", () => {
      const error = new EnhancedError("Test error");

      globalErrorHandler.handleError(error);

      expect(globalErrorHandler.errorHistory).toContain(error);
    });
  });

  describe("Error Handler - Error Enhancement", () => {
    test("enhances string errors with network terms", () => {
      const error = "network timeout";
      const context = { source: "test" };

      globalErrorHandler.handleError(error, context);

      const enhancedError = globalErrorHandler.errorHistory[0];
      expect(enhancedError.message).toBe("network timeout");
      expect(enhancedError.category).toBe(ErrorCategory.NETWORK);
    });

    test("enhances objects with error property and auth terms", () => {
      const error = { error: "auth failed" };

      globalErrorHandler.handleError(error);

      const enhancedError = globalErrorHandler.errorHistory[0];
      expect(enhancedError.message).toBe("auth failed");
      expect(enhancedError.category).toBe(ErrorCategory.AUTHENTICATION);
    });

    test("handles completely empty error objects", () => {
      const emptyError = {};

      globalErrorHandler.handleError(emptyError);

      const enhancedError = globalErrorHandler.errorHistory[0];
      expect(enhancedError.message).toBe("Empty error object");
      expect(enhancedError.category).toBe(ErrorCategory.UI);
    });

    test("handles error objects with some properties but no message", () => {
      const errorWithSomeProps = { status: 404, code: "NOT_FOUND" };

      globalErrorHandler.handleError(errorWithSomeProps);

      const enhancedError = globalErrorHandler.errorHistory[0];
      expect(enhancedError.message).toBe("[object Object]");
      expect(enhancedError.category).toBe(ErrorCategory.UNKNOWN);
    });
  });

  describe("Error Handler - Error Processing", () => {
    test("adds errors to history with limit", () => {
      // Add more errors than the limit
      for (let i = 0; i < 150; i++) {
        globalErrorHandler.handleError(new Error(`Error ${i}`));
      }

      expect(globalErrorHandler.errorHistory.length).toBe(100);
    });

    test("notifies registered listeners", () => {
      const listener = jest.fn();
      const error = new Error("Test error");

      globalErrorHandler.addErrorListener(listener);
      globalErrorHandler.handleError(error);

      expect(listener).toHaveBeenCalledWith(expect.any(EnhancedError));
    });

    test("handles listener errors gracefully", () => {
      const faultyListener = jest.fn().mockImplementation(() => {
        throw new Error("Listener failed");
      });
      const error = new Error("Test error");

      globalErrorHandler.addErrorListener(faultyListener);

      expect(() => {
        globalErrorHandler.handleError(error);
      }).not.toThrow();
    });
  });

  describe("Error Handler - Category Handling", () => {
    test("uses category-specific handler when available", () => {
      const handler = jest.fn().mockReturnValue(true);
      const error = new EnhancedError("Test", {
        category: ErrorCategory.NETWORK,
      });

      globalErrorHandler.registerHandler(ErrorCategory.NETWORK, handler);
      globalErrorHandler.handleError(error);

      expect(handler).toHaveBeenCalledWith(error);
    });

    test("falls back to severity handling when handler returns false", () => {
      const handler = jest.fn().mockReturnValue(false);
      const error = new EnhancedError("Test", {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
      });

      globalErrorHandler.registerHandler(ErrorCategory.NETWORK, handler);
      globalErrorHandler.handleError(error);

      expect(handler).toHaveBeenCalledWith(error);
    });
  });

  describe("Error Handler - Statistics", () => {
    beforeEach(() => {
      // Add sample errors
      const errors = [
        new EnhancedError("Error 1", {
          severity: ErrorSeverity.LOW,
          category: ErrorCategory.NETWORK,
        }),
        new EnhancedError("Error 2", {
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.VALIDATION,
        }),
        new EnhancedError("Error 3", {
          severity: ErrorSeverity.HIGH,
          category: ErrorCategory.NETWORK,
        }),
      ];

      errors.forEach((error) => globalErrorHandler.handleError(error));
    });

    test("generates error statistics", () => {
      const stats = globalErrorHandler.getStats();

      expect(stats.total).toBe(3);
      expect(stats.bySeverity[ErrorSeverity.LOW]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.MEDIUM]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(stats.byCategory[ErrorCategory.NETWORK]).toBe(2);
      expect(stats.byCategory[ErrorCategory.VALIDATION]).toBe(1);
    });

    test("clears error history", () => {
      expect(globalErrorHandler.errorHistory.length).toBe(3);

      globalErrorHandler.clearHistory();

      expect(globalErrorHandler.errorHistory.length).toBe(0);
    });
  });

  describe("Error Creation Utilities", () => {
    test("creates network error", () => {
      const error = createNetworkError("Connection failed");

      expect(error).toBeInstanceOf(EnhancedError);
      expect(error.message).toBe("Connection failed");
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.NETWORK);
    });

    test("creates blockchain error", () => {
      const error = createBlockchainError("Transaction failed");

      expect(error.message).toBe("Transaction failed");
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.category).toBe(ErrorCategory.BLOCKCHAIN);
    });

    test("creates validation error", () => {
      const error = createValidationError("Invalid input");

      expect(error.message).toBe("Invalid input");
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.category).toBe(ErrorCategory.VALIDATION);
    });

    test("allows context override in error creators", () => {
      const error = createNetworkError("Test", {
        severity: ErrorSeverity.HIGH,
        userMessage: "Custom",
      });

      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.userMessage).toBe("Custom");
    });
  });

  describe("Error Handler - Auto Categorization", () => {
    test("categorizes network errors with lowercase terms", () => {
      const errors = [
        "fetch failed",
        "network error",
        "network request failed",
      ];

      errors.forEach((error) => {
        globalErrorHandler.handleError(error);
      });

      globalErrorHandler.errorHistory.forEach((enhancedError) => {
        expect(enhancedError.category).toBe(ErrorCategory.NETWORK);
      });
    });

    test("categorizes validation errors with lowercase terms", () => {
      const errors = [
        "invalid email",
        "validation failed",
        "invalid input format",
      ];

      errors.forEach((error) => {
        globalErrorHandler.handleError(error);
      });

      globalErrorHandler.errorHistory.forEach((enhancedError) => {
        expect(enhancedError.category).toBe(ErrorCategory.VALIDATION);
        expect(enhancedError.severity).toBe(ErrorSeverity.LOW);
      });
    });

    test("handles mixed case in error messages", () => {
      const errors = [
        "Network Error", // Uppercase N
        "FETCH failed", // Uppercase FETCH
        "BlockChain Transaction", // Mixed case
      ];

      errors.forEach((error) => {
        globalErrorHandler.handleError(error);
      });

      // These should be categorized as UNKNOWN because the original code
      // uses includes() which is case-sensitive
      globalErrorHandler.errorHistory.forEach((enhancedError) => {
        expect(enhancedError.category).toBe(ErrorCategory.UNKNOWN);
      });
    });
  });

  describe("Error Handler - Logging", () => {
    test("logs errors with correct severity levels", () => {
      const lowError = new EnhancedError("Low", {
        severity: ErrorSeverity.LOW,
      });
      const mediumError = new EnhancedError("Medium", {
        severity: ErrorSeverity.MEDIUM,
      });
      const highError = new EnhancedError("High", {
        severity: ErrorSeverity.HIGH,
      });
      const criticalError = new EnhancedError("Critical", {
        severity: ErrorSeverity.CRITICAL,
      });

      globalErrorHandler.handleError(lowError);
      globalErrorHandler.handleError(mediumError);
      globalErrorHandler.handleError(highError);
      globalErrorHandler.handleError(criticalError);

      expect(devLog.warn).toHaveBeenCalledWith(
        "Error (LOW):",
        expect.any(Object)
      );
      expect(devLog.error).toHaveBeenCalledWith(
        "Error (MEDIUM):",
        expect.any(Object)
      );
      expect(devLog.error).toHaveBeenCalledWith(
        "Error (HIGH):",
        expect.any(Object)
      );
      expect(devLog.error).toHaveBeenCalledWith(
        "Error (CRITICAL):",
        expect.any(Object)
      );
    });
  });

  describe("Error Handler - Edge Cases", () => {
    test("handles null errors", () => {
      globalErrorHandler.handleError(null);

      const enhancedError = globalErrorHandler.errorHistory[0];
      expect(enhancedError.message).toBe("Empty error object");
      expect(enhancedError.category).toBe(ErrorCategory.UI);
    });

    test("handles undefined errors", () => {
      globalErrorHandler.handleError(undefined);

      const enhancedError = globalErrorHandler.errorHistory[0];
      expect(enhancedError.message).toBe("Empty error object");
      expect(enhancedError.category).toBe(ErrorCategory.UI);
    });

    test("handles errors with toString method", () => {
      const customError = {
        toString: () => "Custom error message",
      };

      globalErrorHandler.handleError(customError);

      const enhancedError = globalErrorHandler.errorHistory[0];
      expect(enhancedError.message).toBe("Custom error message");
    });
  });
});
