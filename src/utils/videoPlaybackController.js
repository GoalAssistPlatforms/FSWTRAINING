/**
 * Centralized Playback Controller for Video Trimming and Section Removal
 * Handles non-destructive mapping between original video timeline and visible edits timeline.
 */

/**
 * Returns a list of visible [start, end] segment ranges.
 * Clamps cuts to trim boundaries and filters/sorts them chronologically.
 */
export const getVisibleSegments = (originalDuration, edits) => {
    const trimStart = edits?.trimStart || 0.0;
    const trimEnd = edits?.trimEnd !== null && edits?.trimEnd !== undefined ? edits.trimEnd : originalDuration;
    let rawCuts = edits?.cuts || [];
    if (!Array.isArray(rawCuts) && typeof rawCuts === 'object') {
        rawCuts = Object.values(rawCuts);
    }
    const cuts = Array.isArray(rawCuts) ? rawCuts : [];

    if (trimEnd <= trimStart) return [];

    const activeCuts = cuts
        .map(c => ({
            start: Math.max(c.start, trimStart),
            end: Math.min(c.end, trimEnd)
        }))
        .filter(c => c.start < c.end)
        .sort((a, b) => a.start - b.start);

    const segments = [];
    let currentStart = trimStart;

    for (const cut of activeCuts) {
        if (cut.start > currentStart) {
            segments.push([currentStart, cut.start]);
        }
        currentStart = Math.max(currentStart, cut.end);
    }

    if (currentStart < trimEnd) {
        segments.push([currentStart, trimEnd]);
    }

    return segments;
};

/**
 * Calculates the net visible duration after subtracting all cut ranges.
 */
export const getVisibleDuration = (originalDuration, edits) => {
    const segments = getVisibleSegments(originalDuration, edits);
    return segments.reduce((sum, [start, end]) => sum + (end - start), 0.0);
};

/**
 * Translates virtual/visible timeline time back to original video file coordinates.
 */
export const visibleToSourceTime = (visibleTime, edits, originalDuration) => {
    const segments = getVisibleSegments(originalDuration, edits);
    let remaining = visibleTime;

    for (const [start, end] of segments) {
        const len = end - start;
        if (remaining <= len) {
            return start + remaining;
        }
        remaining -= len;
    }

    const trimEnd = edits?.trimEnd !== null && edits?.trimEnd !== undefined ? edits.trimEnd : originalDuration;
    return trimEnd;
};

/**
 * Translates a raw video timestamp to visible timeline time.
 * If the rawTime falls inside a cut, identifies the boundary.
 */
export const sourceToVisibleTime = (sourceTime, edits, originalDuration) => {
    const trimStart = edits?.trimStart || 0.0;
    const trimEnd = edits?.trimEnd !== null && edits?.trimEnd !== undefined ? edits.trimEnd : originalDuration;

    if (sourceTime < trimStart) {
        return { visibleTime: 0.0, isRemoved: true, boundary: "cutStart" };
    }
    if (sourceTime >= trimEnd) {
        const segments = getVisibleSegments(originalDuration, edits);
        const totalLen = segments.reduce((sum, [s, e]) => sum + (e - s), 0);
        return { visibleTime: totalLen, isRemoved: true, boundary: "cutEnd" };
    }

    const segments = getVisibleSegments(originalDuration, edits);
    let accumulated = 0.0;

    for (let i = 0; i < segments.length; i++) {
        const [start, end] = segments[i];
        if (sourceTime < start) {
            return { visibleTime: accumulated, isRemoved: true, boundary: "cutStart" };
        }
        if (sourceTime >= start && sourceTime < end) {
            return { visibleTime: accumulated + (sourceTime - start), isRemoved: false };
        }
        accumulated += (end - start);
    }

    return { visibleTime: accumulated, isRemoved: true, boundary: "cutEnd" };
};

/**
 * Checks if the source time is currently inside a cut and returns the jump time if so.
 */
export const getNextVisibleTime = (sourceTime, edits, originalDuration) => {
    const trimStart = edits?.trimStart || 0.0;
    if (sourceTime < trimStart) return trimStart;

    const trimEnd = edits?.trimEnd !== null && edits?.trimEnd !== undefined ? edits.trimEnd : originalDuration;
    if (sourceTime >= trimEnd) return trimEnd;

    let rawCuts = edits?.cuts || [];
    if (!Array.isArray(rawCuts) && typeof rawCuts === 'object') {
        rawCuts = Object.values(rawCuts);
    }
    const cuts = Array.isArray(rawCuts) ? rawCuts : [];

    const activeCut = cuts.find(c => sourceTime >= c.start && sourceTime < c.end);
    if (activeCut) {
        return Math.min(activeCut.end, trimEnd);
    }

    return sourceTime;
};

/**
 * Normalizes edits configuration: sorts cuts, merges overlapping/adjacent ones,
 * and removes cuts made redundant by trim boundaries.
 */
export const normalizeEdits = (edits, originalDuration) => {
    const trimStart = Math.max(0.0, edits?.trimStart || 0.0);
    let trimEnd = edits?.trimEnd !== null && edits?.trimEnd !== undefined ? edits.trimEnd : originalDuration;
    if (trimEnd !== null && trimEnd < trimStart) {
        trimEnd = trimStart;
    }

    let rawCuts = edits?.cuts || [];
    if (!Array.isArray(rawCuts) && typeof rawCuts === 'object') {
        rawCuts = Object.values(rawCuts);
    }
    const cuts = Array.isArray(rawCuts) ? rawCuts : [];

    const sortedCuts = [...cuts].sort((a, b) => a.start - b.start);
    const mergedCuts = [];

    for (const cut of sortedCuts) {
        // Clamp cut boundaries to trim boundaries
        const start = Math.max(cut.start, trimStart);
        const end = Math.min(cut.end, trimEnd);

        // Skip cuts that are outside trim boundaries or invalid
        if (start >= end) {
            continue;
        }

        if (mergedCuts.length === 0) {
            mergedCuts.push({
                id: cut.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
                start,
                end
            });
        } else {
            const lastCut = mergedCuts[mergedCuts.length - 1];
            // Merge if overlapping or adjacent (within 0.1s threshold)
            if (start <= lastCut.end + 0.1) {
                lastCut.end = Math.max(lastCut.end, end);
            } else {
                mergedCuts.push({
                    id: cut.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
                    start,
                    end
                });
            }
        }
    }

    return {
        schemaVersion: edits?.schemaVersion || 1,
        trimStart,
        trimEnd,
        cuts: mergedCuts
    };
};
