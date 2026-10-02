import { describe, it, expect } from "vitest";
import { classifyGesture } from "./gestureLayer.js";

describe("classifyGesture", () => {
  it("is undecided under 8px", () => {
    expect(classifyGesture(0, 0)).toBeNull();
    expect(classifyGesture(5, 5)).toBeNull();
    expect(classifyGesture(-7, 0)).toBeNull();
  });
  it("picks the dominant axis", () => {
    expect(classifyGesture(0, 8)).toBe("v");
    expect(classifyGesture(2, -20)).toBe("v");
    expect(classifyGesture(-9, 3)).toBe("h");
    expect(classifyGesture(30, -29)).toBe("h");
  });
  it("ties go vertical", () => {
    expect(classifyGesture(10, 10)).toBe("v");
  });
});
