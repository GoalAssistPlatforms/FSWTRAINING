declare var process: any;

export const isSequencePlaybackEnabled = (): boolean => {
  const isTest = typeof process !== "undefined" && process.env && process.env.VITEST === "true";

  if (isTest) {
    if (typeof window !== "undefined" && window.localStorage) {
      const val = window.localStorage.getItem("sequencePlaybackEnabled");
      if (val === "true") return true;
      if (val === "false") return false;
    }
    return false;
  }

  return true;
};

export const isSequenceTimelineEditingEnabled = (): boolean => {
  if (!isSequencePlaybackEnabled()) {
    return false;
  }

  const isTest = typeof process !== "undefined" && process.env && process.env.VITEST === "true";
  if (isTest) {
    if (typeof window !== "undefined" && window.localStorage) {
      const val = window.localStorage.getItem("sequenceTimelineEditingEnabled");
      if (val === "true") return true;
      if (val === "false") return false;
    }
    return false;
  }

  return true;
};

export const isSequenceTranscriptViewerEnabled = (): boolean => {
  if (!isSequencePlaybackEnabled()) {
    return false;
  }

  const isTest = typeof process !== "undefined" && process.env && process.env.VITEST === "true";
  if (isTest) {
    if (typeof window !== "undefined" && window.localStorage) {
      const val = window.localStorage.getItem("sequenceTranscriptViewerEnabled");
      if (val === "true") return true;
      if (val === "false") return false;
    }
    return false;
  }

  return true;
};

export const isSequenceTranscriptViewerActive = (): boolean => {
  return isSequenceTranscriptViewerEnabled() && isSequencePlaybackEnabled();
};
