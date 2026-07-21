import {
  SourceDurationError,
  InvalidTimeRangeError,
  InvalidSequenceError
} from "./editorTypes";

export const PRECISION = 1000000;

export const roundTo6 = (val: number): number => {
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new TypeError("Value must be a finite number");
  }
  return Math.round(val * PRECISION) / PRECISION;
};

export const validateDurationFinite = (val: number): void => {
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new SourceDurationError("Duration must be a finite number");
  }
};

export const validateTimeRangeFinite = (start: number, end: number): void => {
  if (typeof start !== "number" || !Number.isFinite(start) || typeof end !== "number" || !Number.isFinite(end)) {
    throw new InvalidTimeRangeError("Time range boundaries must be finite numbers");
  }
};

export const validateVisibleTimeFinite = (val: number): void => {
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new InvalidTimeRangeError("Visible time must be a finite number");
  }
};

export const timesEqual = (a: number, b: number): boolean => {
  return Math.abs(roundTo6(a) - roundTo6(b)) < 1e-9;
};

export const timesLessOrEqual = (a: number, b: number): boolean => {
  return roundTo6(a) <= roundTo6(b) + 1e-9;
};

export const timesLessThan = (a: number, b: number): boolean => {
  return roundTo6(a) < roundTo6(b) - 1e-9;
};
