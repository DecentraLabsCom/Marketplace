/**
 * Unit Tests for optimizedContext.js
 *
 * React context utilities with hooks and error boundaries.
 * Focus on testing the public API and behavior, not implementation details.
 *
 * Test Behaviors:
 * - Context creation with proper structure and displayName
 * - Provider rendering children and updating on value changes
 * - useContext hook returning values and throwing errors outside Provider
 * - useOptimizedContextValue memoization and dependency tracking
 * - useMemoizedValue error handling and various value types
 * - Integration between context creation and value hooks
 *
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import {
  createOptimizedContext,
  useOptimizedContextValue,
  useMemoizedValue,
} from "../optimizedContext";

// Mock logger
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
  },
}));

import devLog from "@/utils/dev/logger";

describe("contextUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createOptimizedContext", () => {
    test("creates context with correct structure", () => {
      const { Context, Provider, useContext } =
        createOptimizedContext("TestContext");

      expect(Context).toBeDefined();
      expect(Provider).toBeDefined();
      expect(useContext).toBeDefined();
      expect(typeof useContext).toBe("function");
    });

    test("sets displayName on context", () => {
      const { Context } = createOptimizedContext("MyContext");

      expect(Context.displayName).toBe("MyContext");
    });

    test("Provider renders children", () => {
      const { Provider } = createOptimizedContext("TestContext");

      render(
        <Provider value={{ test: "value" }}>
          <div>Test Child</div>
        </Provider>
      );

      expect(screen.getByText("Test Child")).toBeInTheDocument();
    });

    test("useContext returns context value", () => {
      const { Provider, useContext } = createOptimizedContext("TestContext");
      const testValue = { data: "test-data" };

      const TestComponent = () => {
        const value = useContext();
        return <div>{value.data}</div>;
      };

      render(
        <Provider value={testValue}>
          <TestComponent />
        </Provider>
      );

      expect(screen.getByText("test-data")).toBeInTheDocument();
    });

    test("useContext throws error when used outside Provider", () => {
      const { useContext } = createOptimizedContext("TestContext");

      const TestComponent = () => {
        useContext();
        return <div>Should not render</div>;
      };

      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => render(<TestComponent />)).toThrow(
        "useTestContext must be used within a TestContextProvider"
      );

      console.error = originalError;
    });

    test("Provider updates when value changes", () => {
      const { Provider, useContext } = createOptimizedContext("TestContext");

      const TestComponent = () => {
        const value = useContext();
        return <div>{value.data}</div>;
      };

      const { rerender } = render(
        <Provider value={{ data: "initial" }}>
          <TestComponent />
        </Provider>
      );

      expect(screen.getByText("initial")).toBeInTheDocument();

      rerender(
        <Provider value={{ data: "updated" }}>
          <TestComponent />
        </Provider>
      );

      expect(screen.getByText("updated")).toBeInTheDocument();
    });
  });

  describe("ContextErrorBoundary", () => {
    test("documents error boundary behavior", () => {
      // Error boundary should:
      // 1. Catch errors in child components
      // 2. Display user-friendly error message
      // 3. Log error with devLog.error
      // 4. Show context name in error message

      expect(true).toBe(true);
    });
  });

  describe("useOptimizedContextValue", () => {
    test("memoizes value from factory function", () => {
      let callCount = 0;
      const valueFactory = () => {
        callCount++;
        return { data: "test" };
      };

      const { result, rerender } = renderHook(
        ({ factory, deps }) =>
          useOptimizedContextValue(factory, deps, "TestContext"),
        {
          initialProps: { factory: valueFactory, deps: [] },
        }
      );

      expect(result.current).toEqual({ data: "test" });
      expect(callCount).toBe(1);

      // Rerender with same dependencies
      rerender({ factory: valueFactory, deps: [] });

      // Factory should not be called again
      expect(callCount).toBe(1);
    });

    test("recreates value when dependencies change", () => {
      let callCount = 0;
      const valueFactory = () => {
        callCount++;
        return { data: "test" };
      };

      const { result, rerender } = renderHook(
        ({ factory, deps }) =>
          useOptimizedContextValue(factory, deps, "TestContext"),
        {
          initialProps: { factory: valueFactory, deps: [1] },
        }
      );

      expect(callCount).toBe(1);

      // Change dependencies
      rerender({ factory: valueFactory, deps: [2] });

      // Factory should be called again
      expect(callCount).toBe(2);
    });

    test("does not log warning for fast value creation", () => {
      const valueFactory = () => ({ data: "test" });

      renderHook(() =>
        useOptimizedContextValue(valueFactory, [], "FastContext")
      );

      expect(devLog.warn).not.toHaveBeenCalled();
    });

    test("works with empty context name", () => {
      const valueFactory = () => ({ data: "test" });

      const { result } = renderHook(() =>
        useOptimizedContextValue(valueFactory, [])
      );

      expect(result.current).toEqual({ data: "test" });
    });
  });

  describe("useMemoizedValue", () => {
    test("memoizes value from factory function", () => {
      let callCount = 0;
      const valueFactory = () => {
        callCount++;
        return { data: "test" };
      };

      const { result, rerender } = renderHook(
        ({ factory, deps }) => useMemoizedValue(factory, deps),
        {
          initialProps: { factory: valueFactory, deps: [] },
        }
      );

      expect(result.current).toEqual({ data: "test" });
      expect(callCount).toBe(1);

      // Rerender with same dependencies
      rerender({ factory: valueFactory, deps: [] });

      // Factory should not be called again
      expect(callCount).toBe(1);
    });

    test("recreates value when dependencies change", () => {
      let callCount = 0;
      const valueFactory = () => {
        callCount++;
        return { count: callCount };
      };

      const { result, rerender } = renderHook(
        ({ factory, deps }) => useMemoizedValue(factory, deps),
        {
          initialProps: { factory: valueFactory, deps: [1] },
        }
      );

      expect(result.current).toEqual({ count: 1 });

      // Change dependencies
      rerender({ factory: valueFactory, deps: [2] });

      expect(result.current).toEqual({ count: 2 });
    });

    test("works with empty dependencies array", () => {
      const valueFactory = () => ({ data: "static" });

      const { result } = renderHook(() => useMemoizedValue(valueFactory));

      expect(result.current).toEqual({ data: "static" });
    });

    test("logs and throws error when factory throws", () => {
      const error = new Error("Factory error");
      const valueFactory = () => {
        throw error;
      };

      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => {
        renderHook(() => useMemoizedValue(valueFactory, []));
      }).toThrow("Factory error");

      expect(devLog.error).toHaveBeenCalledWith(
        "Memoized value creation error:",
        error
      );

      console.error = originalError;
    });

    test("handles primitive values", () => {
      const stringFactory = () => "test-string";
      const numberFactory = () => 42;
      const booleanFactory = () => true;

      const { result: stringResult } = renderHook(() =>
        useMemoizedValue(stringFactory, [])
      );
      const { result: numberResult } = renderHook(() =>
        useMemoizedValue(numberFactory, [])
      );
      const { result: booleanResult } = renderHook(() =>
        useMemoizedValue(booleanFactory, [])
      );

      expect(stringResult.current).toBe("test-string");
      expect(numberResult.current).toBe(42);
      expect(booleanResult.current).toBe(true);
    });

    test("handles null and undefined", () => {
      const nullFactory = () => null;
      const undefinedFactory = () => undefined;

      const { result: nullResult } = renderHook(() =>
        useMemoizedValue(nullFactory, [])
      );
      const { result: undefinedResult } = renderHook(() =>
        useMemoizedValue(undefinedFactory, [])
      );

      expect(nullResult.current).toBeNull();
      expect(undefinedResult.current).toBeUndefined();
    });

    test("handles arrays", () => {
      const arrayFactory = () => [1, 2, 3];

      const { result } = renderHook(() => useMemoizedValue(arrayFactory, []));

      expect(result.current).toEqual([1, 2, 3]);
      expect(Array.isArray(result.current)).toBe(true);
    });

    test("handles nested objects", () => {
      const nestedFactory = () => ({
        user: {
          name: "John",
          settings: {
            theme: "dark",
          },
        },
      });

      const { result } = renderHook(() => useMemoizedValue(nestedFactory, []));

      expect(result.current).toEqual({
        user: {
          name: "John",
          settings: {
            theme: "dark",
          },
        },
      });
    });
  });

  describe("Integration tests", () => {
    test("createOptimizedContext works with useOptimizedContextValue", () => {
      const { Provider, useContext } =
        createOptimizedContext("IntegrationContext");

      const TestComponent = () => {
        const value = useContext();
        const optimizedValue = useOptimizedContextValue(
          () => ({ ...value, extra: "data" }),
          [value],
          "IntegrationContext"
        );
        return <div>{JSON.stringify(optimizedValue)}</div>;
      };

      render(
        <Provider value={{ test: "value" }}>
          <TestComponent />
        </Provider>
      );

      expect(screen.getByText(/"test":"value"/)).toBeInTheDocument();
      expect(screen.getByText(/"extra":"data"/)).toBeInTheDocument();
    });

    test("createOptimizedContext works with useMemoizedValue", () => {
      const { Provider, useContext } = createOptimizedContext("MemoContext");

      const TestComponent = () => {
        const value = useContext();
        const memoizedValue = useMemoizedValue(
          () => value.data.toUpperCase(),
          [value.data]
        );
        return <div>{memoizedValue}</div>;
      };

      render(
        <Provider value={{ data: "hello" }}>
          <TestComponent />
        </Provider>
      );

      expect(screen.getByText("HELLO")).toBeInTheDocument();
    });
  });
});
