/**
 * Unit Tests for bigIntSerializer.js
 *
 * Test Behaviors:
 * - serializeBigInt(): Recursive conversion of BigInt values to strings in any data structure
 * - createSerializedJsonResponse(): Response creation with automatic BigInt serialization
 * - Edge cases: null objects, deeply nested structures, mixed types, immutability
 *
 */

import {
  serializeBigInt,
  createSerializedJsonResponse,
} from "../bigIntSerializer";

describe("bigIntSerializer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("serializeBigInt", () => {
    describe("Primitive BigInt values", () => {
      test("converts BigInt to string", () => {
        const input = BigInt(123456789);
        const result = serializeBigInt(input);

        expect(result).toBe("123456789");
        expect(typeof result).toBe("string");
      });

      test("converts very large BigInt to string", () => {
        const input = BigInt("9007199254740991999999");
        const result = serializeBigInt(input);

        expect(result).toBe("9007199254740991999999");
      });

      test("converts zero BigInt to string", () => {
        const input = BigInt(0);
        const result = serializeBigInt(input);

        expect(result).toBe("0");
      });

      test("converts negative BigInt to string", () => {
        const input = BigInt(-123);
        const result = serializeBigInt(input);

        expect(result).toBe("-123");
      });
    });

    describe("Primitive non-BigInt values (passthrough)", () => {
      test("returns string unchanged", () => {
        const input = "test string";
        expect(serializeBigInt(input)).toBe("test string");
      });

      test("returns number unchanged", () => {
        const input = 42;
        expect(serializeBigInt(input)).toBe(42);
      });

      test("returns boolean unchanged", () => {
        expect(serializeBigInt(true)).toBe(true);
        expect(serializeBigInt(false)).toBe(false);
      });

      test("returns null unchanged", () => {
        expect(serializeBigInt(null)).toBe(null);
      });

      test("returns undefined unchanged", () => {
        expect(serializeBigInt(undefined)).toBe(undefined);
      });
    });

    describe("Arrays with BigInt", () => {
      test("converts array of BigInts to array of strings", () => {
        const input = [BigInt(1), BigInt(2), BigInt(3)];
        const result = serializeBigInt(input);

        expect(result).toEqual(["1", "2", "3"]);
      });

      test("handles mixed array (BigInt and primitives)", () => {
        const input = [BigInt(100), "text", 42, true, null];
        const result = serializeBigInt(input);

        expect(result).toEqual(["100", "text", 42, true, null]);
      });

      test("handles empty array", () => {
        const input = [];
        const result = serializeBigInt(input);

        expect(result).toEqual([]);
      });

      test("handles nested arrays with BigInt", () => {
        const input = [BigInt(1), [BigInt(2), BigInt(3)], [BigInt(4)]];
        const result = serializeBigInt(input);

        expect(result).toEqual(["1", ["2", "3"], ["4"]]);
      });
    });

    describe("Objects with BigInt", () => {
      test("converts simple object with BigInt values", () => {
        const input = {
          id: BigInt(123),
          name: "test",
        };
        const result = serializeBigInt(input);

        expect(result).toEqual({
          id: "123",
          name: "test",
        });
      });

      test("handles empty object", () => {
        const input = {};
        const result = serializeBigInt(input);

        expect(result).toEqual({});
      });

      test("handles object with multiple BigInt properties", () => {
        const input = {
          balance: BigInt(1000000),
          amount: BigInt(500),
          fee: BigInt(10),
        };
        const result = serializeBigInt(input);

        expect(result).toEqual({
          balance: "1000000",
          amount: "500",
          fee: "10",
        });
      });

      test("handles nested objects with BigInt", () => {
        const input = {
          user: {
            balance: BigInt(1000),
            data: {
              value: BigInt(200),
            },
          },
        };
        const result = serializeBigInt(input);

        expect(result).toEqual({
          user: {
            balance: "1000",
            data: {
              value: "200",
            },
          },
        });
      });

      test("handles object with array properties containing BigInt", () => {
        const input = {
          items: [BigInt(1), BigInt(2)],
          name: "test",
        };
        const result = serializeBigInt(input);

        expect(result).toEqual({
          items: ["1", "2"],
          name: "test",
        });
      });
    });

    describe("Complex nested structures", () => {
      test("handles deeply nested structure with mixed types", () => {
        const input = {
          user: {
            id: BigInt(123),
            name: "Alice",
            balances: [BigInt(1000), BigInt(2000)],
            metadata: {
              created: BigInt(1234567890),
              tags: ["tag1", "tag2"],
              nested: {
                value: BigInt(999),
              },
            },
          },
          items: [
            { id: BigInt(1), name: "Item 1" },
            { id: BigInt(2), name: "Item 2" },
          ],
        };

        const result = serializeBigInt(input);

        expect(result).toEqual({
          user: {
            id: "123",
            name: "Alice",
            balances: ["1000", "2000"],
            metadata: {
              created: "1234567890",
              tags: ["tag1", "tag2"],
              nested: {
                value: "999",
              },
            },
          },
          items: [
            { id: "1", name: "Item 1" },
            { id: "2", name: "Item 2" },
          ],
        });
      });

      test("handles array of objects with BigInt", () => {
        const input = [
          { balance: BigInt(100), name: "A" },
          { balance: BigInt(200), name: "B" },
        ];

        const result = serializeBigInt(input);

        expect(result).toEqual([
          { balance: "100", name: "A" },
          { balance: "200", name: "B" },
        ]);
      });
    });

    describe("Edge cases", () => {
      test("handles object with null prototype", () => {
        const input = Object.create(null);
        input.value = BigInt(123);

        const result = serializeBigInt(input);

        expect(result).toEqual({ value: "123" });
      });

      test("preserves object structure without mutating original", () => {
        const input = {
          value: BigInt(123),
          nested: { amount: BigInt(456) },
        };

        const result = serializeBigInt(input);

        // Original should remain unchanged
        expect(typeof input.value).toBe("bigint");
        expect(typeof input.nested.amount).toBe("bigint");

        // Result should be serialized
        expect(result.value).toBe("123");
        expect(result.nested.amount).toBe("456");
      });
    });
  });

  describe("createSerializedJsonResponse", () => {
    // Mock Response.json
    const mockResponseJson = jest.fn((data, options) => ({
      data,
      options,
      type: "Response",
    }));

    beforeEach(() => {
      global.Response = {
        json: mockResponseJson,
      };
    });

    afterEach(() => {
      delete global.Response;
    });

    describe("Basic functionality", () => {
      test("creates response with serialized BigInt data", () => {
        const data = { value: BigInt(123) };
        const result = createSerializedJsonResponse(data);

        expect(mockResponseJson).toHaveBeenCalledWith({ value: "123" }, {});
        expect(result.data).toEqual({ value: "123" });
      });

      test("uses default empty options when not provided", () => {
        const data = { id: BigInt(1) };
        createSerializedJsonResponse(data);

        expect(mockResponseJson).toHaveBeenCalledWith({ id: "1" }, {});
      });
    });

    describe("With custom options", () => {
      test("passes custom status code", () => {
        const data = { value: BigInt(123) };
        const options = { status: 201 };

        createSerializedJsonResponse(data, options);

        expect(mockResponseJson).toHaveBeenCalledWith(
          { value: "123" },
          { status: 201 }
        );
      });

      test("passes custom headers", () => {
        const data = { value: BigInt(123) };
        const options = {
          status: 200,
          headers: { "X-Custom": "header" },
        };

        createSerializedJsonResponse(data, options);

        expect(mockResponseJson).toHaveBeenCalledWith(
          { value: "123" },
          options
        );
      });

      test("passes multiple custom options", () => {
        const data = { value: BigInt(123) };
        const options = {
          status: 404,
          statusText: "Not Found",
          headers: { "Content-Type": "application/json" },
        };

        createSerializedJsonResponse(data, options);

        expect(mockResponseJson).toHaveBeenCalledWith(
          { value: "123" },
          options
        );
      });
    });

    describe("Complex data serialization", () => {
      test("handles complex nested structure with BigInt", () => {
        const data = {
          user: {
            id: BigInt(123),
            balances: [BigInt(1000), BigInt(2000)],
          },
          items: [{ id: BigInt(1), amount: BigInt(100) }],
        };

        createSerializedJsonResponse(data);

        expect(mockResponseJson).toHaveBeenCalledWith(
          {
            user: {
              id: "123",
              balances: ["1000", "2000"],
            },
            items: [{ id: "1", amount: "100" }],
          },
          {}
        );
      });

      test("handles data without BigInt values", () => {
        const data = { name: "test", value: 42 };

        createSerializedJsonResponse(data);

        expect(mockResponseJson).toHaveBeenCalledWith(
          { name: "test", value: 42 },
          {}
        );
      });

      test("handles null data", () => {
        createSerializedJsonResponse(null);

        expect(mockResponseJson).toHaveBeenCalledWith(null, {});
      });

      test("handles array data with BigInt", () => {
        const data = [BigInt(1), BigInt(2), BigInt(3)];

        createSerializedJsonResponse(data);

        expect(mockResponseJson).toHaveBeenCalledWith(["1", "2", "3"], {});
      });
    });

    describe("Return value", () => {
      test("returns the Response object from Response.json", () => {
        const data = { value: BigInt(123) };
        const result = createSerializedJsonResponse(data);

        expect(result.type).toBe("Response");
        expect(result.data).toEqual({ value: "123" });
      });
    });
  });
});
