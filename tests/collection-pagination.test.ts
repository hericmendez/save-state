import { describe, expect, it } from "vitest";
import { pageNumbers } from "@/features/collection/collection-query";

describe("pageNumbers", () => {
  it("lists every page when there are 7 or fewer", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("marks the current page inside the window", () => {
    const numbers = pageNumbers(5, 20);
    expect(numbers).toContain(5);
    expect(numbers[0]).toBe(1);
    expect(numbers[numbers.length - 1]).toBe(20);
  });

  it("collapses distant ranges with an ellipsis", () => {
    expect(pageNumbers(10, 20)).toEqual([
      1,
      "…",
      9,
      10,
      11,
      "…",
      20,
    ]);
  });

  it("keeps the first pages visible near the start", () => {
    const numbers = pageNumbers(1, 20);
    expect(numbers.slice(0, 3)).toEqual([1, 2, "…"]);
    expect(numbers[numbers.length - 1]).toBe(20);
  });

  it("keeps the last pages visible near the end", () => {
    const numbers = pageNumbers(20, 20);
    expect(numbers[0]).toBe(1);
    expect(numbers.slice(-3)).toEqual(["…", 19, 20]);
  });

  it("never emits out-of-range pages", () => {
    for (const current of [1, 2, 19, 20]) {
      const pages = pageNumbers(current, 20).filter(
        (page): page is number => page !== "…",
      );
      expect(Math.min(...pages)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...pages)).toBeLessThanOrEqual(20);
    }
  });
});
