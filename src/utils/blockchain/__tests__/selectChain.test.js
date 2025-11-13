/**
 * Unit Tests for Chain Selection Utility (selectChain)
 *
 * Tests the blockchain chain selection based on name matching.
 * Handles config lookup and default fallback.
 *
 * Test Behaviors:
 * - Name matching (case-insensitive)
 * - Default fallback
 * - Invalid/edge inputs (including error throwing)
 * - Config variations
 */

import { selectChain } from "../selectChain";

jest.mock("@/utils/blockchain/wagmiConfig", () => ({
  chains: [
    { name: "Ethereum", id: 1 },
    { name: "Polygon", id: 137 },
  ],
}));

jest.mock("@/utils/blockchain/networkConfig", () => ({
  defaultChain: { name: "Default", id: 0 },
}));

describe("selectChain - Chain Selection Utility", () => {
  describe("Name Matching", () => {
    test("returns matching chain (case-insensitive)", () => {
      const currentChain = { name: "ethereum" };
      const result = selectChain(currentChain);
      expect(result).toEqual({ name: "Ethereum", id: 1 });
    });

    test("returns matching chain with mixed case", () => {
      const currentChain = { name: "PoLyGoN" };
      const result = selectChain(currentChain);
      expect(result).toEqual({ name: "Polygon", id: 137 });
    });
  });

  describe("Default Fallback", () => {
    test("returns default when no match", () => {
      const currentChain = { name: "Unknown" };
      const result = selectChain(currentChain);
      expect(result).toEqual({ name: "Default", id: 0 });
    });

    test("returns default when currentChain is undefined", () => {
      const result = selectChain(undefined);
      expect(result).toEqual({ name: "Default", id: 0 });
    });

    test("throws TypeError when currentChain has no name", () => {
      const currentChain = { id: 42 };
      expect(() => selectChain(currentChain)).toThrow(TypeError);
    });
  });

  describe("Invalid/Edge Inputs", () => {
    test("returns default when currentChain is null", () => {
      const result = selectChain(null);
      expect(result).toEqual({ name: "Default", id: 0 });
    });

    test("returns default when name is empty string", () => {
      const currentChain = { name: "" };
      const result = selectChain(currentChain);
      expect(result).toEqual({ name: "Default", id: 0 });
    });

    test("throws TypeError when name is non-string (e.g., number)", () => {
      const currentChain = { name: 123 };
      expect(() => selectChain(currentChain)).toThrow(TypeError);
    });
  });

  describe("Config Variations", () => {
    test("handles empty config.chains", async () => {
      jest.resetModules();
      jest.mock("@/utils/blockchain/wagmiConfig", () => ({ chains: [] }));
      jest.mock("@/utils/blockchain/networkConfig", () => ({
        defaultChain: { name: "Default", id: 0 },
      }));
      const { selectChain } = await import("../selectChain"); //Dynamic import after reset/mock for ESM
      const currentChain = { name: "Ethereum" };
      const result = selectChain(currentChain);
      expect(result).toEqual({ name: "Default", id: 0 });
    });
  });

  describe("Real-World Use Cases", () => {
    test("selects chain in typical Wagmi context", () => {
      const currentChain = { name: "Polygon" };
      const result = selectChain(currentChain);
      expect(result.id).toBe(137);
    });

    test("falls back to default in unknown network", () => {
      const currentChain = { name: "Arbitrum" };
      const result = selectChain(currentChain);
      expect(result).toEqual({ name: "Default", id: 0 });
    });
  });
});
