import { normalizeLabDates } from "../dateFormatter";

describe("normalizeLabDates", () => {
  test("converts opens/closes to Unix seconds", () => {
    const labData = {
      opens: "2025-01-01",
      closes: "2025-12-31",
    };

    const result = normalizeLabDates(labData);

    expect(result.opens).toBe(1735689600);
    expect(result.closes).toBe(1767139200);
  });

  test("passes through numeric Unix values unchanged", () => {
    const labData = { opens: 1704067200, closes: 1706745600 };
    const result = normalizeLabDates(labData);

    expect(result.opens).toBe(1704067200);
    expect(result.closes).toBe(1706745600);
  });

  test("converts termsOfUse.effectiveDate to Unix seconds", () => {
    const labData = { termsOfUse: { effectiveDate: "2024-01-01" } };

    const result = normalizeLabDates(labData);

    expect(result.termsOfUse.effectiveDate).toBe(1704067200);
  });

  test("normalizes unavailableWindows start/end to Unix seconds", () => {
    const labData = {
      unavailableWindows: [
        { start: "2025-06-01T10:00:00Z", end: "2025-06-01T12:00:00Z" },
        { startUnix: 1735689600, endUnix: 1735693200 },
      ],
    };

    const result = normalizeLabDates(labData);

    expect(result.unavailableWindows[0].startUnix).toBe(1748772000);
    expect(result.unavailableWindows[0].endUnix).toBe(1748779200);
    expect(result.unavailableWindows[1].startUnix).toBe(1735689600);
    expect(result.unavailableWindows[1].endUnix).toBe(1735693200);
  });
});
