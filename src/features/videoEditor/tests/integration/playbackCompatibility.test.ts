import { describe, it, expect } from "vitest";
import { calculateCompatibility, migrateLegacyEditsToSequence } from "../../services/playbackSequenceService";
import { LegacyVideoEdits } from "../../domain/editorTypes";

describe("Playback Compatibility Fixture Tests", () => {
  const runCompatibilityCheck = (legacyEdits: LegacyVideoEdits, sourceDuration: number) => {
    const sequence = migrateLegacyEditsToSequence("asset-123", sourceDuration, legacyEdits);
    const result = calculateCompatibility(legacyEdits, sequence, sourceDuration);
    return result;
  };

  it("1. No trims or cuts", () => {
    const legacyEdits: LegacyVideoEdits = { trimStart: 0, trimEnd: null, cuts: [] };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
    expect(res.differences.find(d => d.category === "visibleDuration")?.expected).toBe(100);
  });

  it("2. Start trim only", () => {
    const legacyEdits: LegacyVideoEdits = { trimStart: 15.5, trimEnd: null, cuts: [] };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
    expect(res.differences.find(d => d.category === "visibleDuration")?.expected).toBe(84.5);
  });

  it("3. End trim only", () => {
    const legacyEdits: LegacyVideoEdits = { trimStart: 0, trimEnd: 85.2, cuts: [] };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
    expect(res.differences.find(d => d.category === "visibleDuration")?.expected).toBeCloseTo(85.2, 5);
  });

  it("4. Start and end trim", () => {
    const legacyEdits: LegacyVideoEdits = { trimStart: 10.1, trimEnd: 90.9, cuts: [] };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
    expect(res.differences.find(d => d.category === "visibleDuration")?.expected).toBeCloseTo(80.8, 5);
  });

  it("5. One cut", () => {
    const legacyEdits: LegacyVideoEdits = { trimStart: 0, trimEnd: null, cuts: [{ start: 20, end: 30 }] };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
    expect(res.differences.find(d => d.category === "visibleDuration")?.expected).toBe(90);
  });

  it("6. Several cuts", () => {
    const legacyEdits: LegacyVideoEdits = {
      trimStart: 0,
      trimEnd: null,
      cuts: [
        { start: 10, end: 20 },
        { start: 40, end: 50 },
        { start: 70, end: 80 }
      ]
    };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
    expect(res.differences.find(d => d.category === "visibleDuration")?.expected).toBe(70);
  });

  it("7. Adjacent cuts", () => {
    const legacyEdits: LegacyVideoEdits = {
      trimStart: 0,
      trimEnd: null,
      cuts: [
        { start: 10, end: 20 },
        { start: 20.0001, end: 30 }
      ]
    };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
  });

  it("8. Overlapping legacy cuts", () => {
    const legacyEdits: LegacyVideoEdits = {
      trimStart: 0,
      trimEnd: null,
      cuts: [
        { start: 10, end: 25 },
        { start: 20, end: 35 }
      ]
    };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
  });

  it("9. Cut at trim start", () => {
    const legacyEdits: LegacyVideoEdits = {
      trimStart: 15,
      trimEnd: 90,
      cuts: [{ start: 10, end: 20 }]
    };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
  });

  it("10. Cut at trim end", () => {
    const legacyEdits: LegacyVideoEdits = {
      trimStart: 10,
      trimEnd: 80,
      cuts: [{ start: 75, end: 85 }]
    };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
  });

  it("11. Entire visible range removed", () => {
    const legacyEdits: LegacyVideoEdits = {
      trimStart: 10,
      trimEnd: 20,
      cuts: [{ start: 5, end: 25 }]
    };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
    expect(res.differences.find(d => d.category === "visibleDuration")?.expected).toBe(0);
  });

  it("12. Decimal boundaries", () => {
    const legacyEdits: LegacyVideoEdits = {
      trimStart: 10.123456,
      trimEnd: 90.654321,
      cuts: [{ start: 20.111111, end: 30.222222 }]
    };
    const res = runCompatibilityCheck(legacyEdits, 100);
    expect(res.compatible).toBe(true);
  });

  it("13. Long recording", () => {
    const legacyEdits: LegacyVideoEdits = {
      trimStart: 100,
      trimEnd: 3500,
      cuts: [
        { start: 500, end: 600 },
        { start: 2000, end: 2100 }
      ]
    };
    const res = runCompatibilityCheck(legacyEdits, 3600); // 1 hour
    expect(res.compatible).toBe(true);
  });

  it("14. One thousand chronological sequence clips", () => {
    const cuts: { start: number; end: number }[] = [];
    const sourceDuration = 9995; // 1000 clips of 5s + 999 cuts of 5s
    for (let i = 0; i < 1000; i++) {
      const clipStart = i * 10;
      const clipEnd = clipStart + 5;
      if (i < 999) {
        cuts.push({ start: clipEnd, end: clipEnd + 5 });
      }
    }

    const legacyEdits: LegacyVideoEdits = {
      trimStart: 0,
      trimEnd: null,
      cuts
    };

    // Calculate compatibility
    const res = runCompatibilityCheck(legacyEdits, sourceDuration);
    expect(res.compatible).toBe(true);
    expect(res.differences.find(d => d.category === "visibleDuration")?.expected).toBe(5000);
  });
});
