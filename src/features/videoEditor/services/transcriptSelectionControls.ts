export interface VisibleSelectionRange {
  visibleStart: number;
  visibleEnd: number;
}

export interface TranscriptSelectionItem {
  key: string;
  kind: "word" | "pause";
  visibleWord?: {
    state: string;
    visibleStartTime: number;
    visibleEndTime: number;
    word: {
      startSourceTime: number;
      endSourceTime: number;
    };
  };
  pause?: {
    visibleStart: number;
    visibleEnd: number;
  };
}

export interface TranscriptSelectionControls {
  selectionBar: HTMLElement | null;
  durationLabel: HTMLElement | null;
  removeButton: HTMLButtonElement | null;
  selectedItems: TranscriptSelectionItem[];
}

const getSelectionItemRange = (
  item: TranscriptSelectionItem
): VisibleSelectionRange | null => {
  if (item.kind === "pause" && item.pause) {
    return {
      visibleStart: Number(item.pause.visibleStart),
      visibleEnd: Number(item.pause.visibleEnd)
    };
  }

  if (item.kind === "word" && item.visibleWord) {
    return {
      visibleStart: Number(item.visibleWord.visibleStartTime),
      visibleEnd: Number(item.visibleWord.visibleEndTime)
    };
  }

  return null;
};

export const getTranscriptSelectionDuration = (
  selectedItems: TranscriptSelectionItem[]
): number => {
  const ranges = selectedItems
    .map(getSelectionItemRange)
    .filter(
      (range): range is VisibleSelectionRange =>
        Boolean(
          range
          && Number.isFinite(range.visibleStart)
          && Number.isFinite(range.visibleEnd)
          && range.visibleEnd >= range.visibleStart
        )
    );

  if (ranges.length === 0) return 0;

  const start = Math.min(...ranges.map(range => range.visibleStart));
  const end = Math.max(...ranges.map(range => range.visibleEnd));
  return Math.max(0, end - start);
};

export const buildSelectedWordRanges = (
  selectableItems: TranscriptSelectionItem[],
  selectedKeys: ReadonlySet<string>
): VisibleSelectionRange[] => {
  const ranges: VisibleSelectionRange[] = [];
  let currentRun: TranscriptSelectionItem[] = [];

  const flushRun = () => {
    if (currentRun.length === 0) return;

    const firstWord = currentRun[0].visibleWord;
    const lastWord = currentRun[currentRun.length - 1].visibleWord;
    if (firstWord && lastWord) {
      ranges.push({
        visibleStart: firstWord.visibleStartTime,
        visibleEnd: lastWord.visibleEndTime
      });
    }
    currentRun = [];
  };

  selectableItems.forEach(item => {
    if (selectedKeys.has(item.key) && item.kind === "word" && item.visibleWord) {
      currentRun.push(item);
    } else {
      flushRun();
    }
  });
  flushRun();

  return ranges;
};

export const mergeVisibleSelectionRanges = (
  ranges: VisibleSelectionRange[]
): VisibleSelectionRange[] => {
  const validRanges = ranges
    .filter(range =>
      Number.isFinite(range.visibleStart)
      && Number.isFinite(range.visibleEnd)
      && range.visibleEnd > range.visibleStart
    )
    .map(range => ({ ...range }))
    .sort((a, b) => a.visibleStart - b.visibleStart);

  const merged: VisibleSelectionRange[] = [];
  const epsilon = 1e-6;

  validRanges.forEach(range => {
    const last = merged[merged.length - 1];
    if (!last || range.visibleStart > last.visibleEnd + epsilon) {
      merged.push(range);
      return;
    }
    last.visibleEnd = Math.max(last.visibleEnd, range.visibleEnd);
  });

  return merged;
};

export const isTranscriptDeleteKey = (key: string): boolean =>
  key === "Backspace" || key === "Delete";

export const updateTranscriptSelectionControls = ({
  selectionBar,
  durationLabel,
  removeButton,
  selectedItems
}: TranscriptSelectionControls): void => {
  const hasSelection = selectedItems.length > 0;
  const restoreMode = hasSelection && selectedItems.every(
    item => item.kind === "word" && item.visibleWord?.state === "removed"
  );

  if (selectionBar) {
    selectionBar.style.display = hasSelection ? "flex" : "none";
    selectionBar.setAttribute("aria-hidden", hasSelection ? "false" : "true");
  }

  if (durationLabel) {
    durationLabel.textContent = `Selected: ${getTranscriptSelectionDuration(selectedItems).toFixed(1)} seconds`;
  }

  if (!removeButton) return;

  removeButton.style.display = hasSelection ? "inline-flex" : "none";
  removeButton.disabled = !hasSelection;
  removeButton.textContent = restoreMode
    ? "Restore this section"
    : "Remove selected text from video";
  removeButton.style.background = restoreMode ? "#3b82f6" : "#10b981";
  removeButton.style.borderColor = restoreMode ? "#3b82f6" : "#10b981";
};
