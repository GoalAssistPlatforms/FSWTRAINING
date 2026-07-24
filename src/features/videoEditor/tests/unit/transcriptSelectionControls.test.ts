// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildSelectedWordRanges,
  isTranscriptDeleteKey,
  mergeVisibleSelectionRanges,
  updateTranscriptSelectionControls
} from "../../services/transcriptSelectionControls";

const wordItem = (
  key: string,
  visibleStartTime: number,
  visibleEndTime: number,
  state = "visible"
) => ({
  key,
  kind: "word" as const,
  visibleWord: {
    state,
    visibleStartTime,
    visibleEndTime,
    word: {
      startSourceTime: visibleStartTime,
      endSourceTime: visibleEndTime
    }
  }
});

describe("transcript selection controls", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="bar" style="display: none" aria-hidden="true">
        <span id="duration">Selected: 0.0 seconds</span>
        <button id="remove" type="button">Remove selected text from video</button>
      </div>
    `;
  });

  it("reveals the parent action bar and reports the selected duration", () => {
    updateTranscriptSelectionControls({
      selectionBar: document.getElementById("bar"),
      durationLabel: document.getElementById("duration"),
      removeButton: document.getElementById("remove") as HTMLButtonElement,
      selectedItems: [
        wordItem("word:1", 1.2, 1.8),
        wordItem("word:2", 1.8, 2.4)
      ]
    });

    expect(document.getElementById("bar")?.style.display).toBe("flex");
    expect(document.getElementById("bar")?.getAttribute("aria-hidden")).toBe("false");
    expect(document.getElementById("duration")?.textContent).toBe("Selected: 1.2 seconds");
    expect((document.getElementById("remove") as HTMLButtonElement).disabled).toBe(false);
  });

  it("hides and disables the delete action after the selection is cleared", () => {
    updateTranscriptSelectionControls({
      selectionBar: document.getElementById("bar"),
      durationLabel: document.getElementById("duration"),
      removeButton: document.getElementById("remove") as HTMLButtonElement,
      selectedItems: []
    });

    expect(document.getElementById("bar")?.style.display).toBe("none");
    expect(document.getElementById("bar")?.getAttribute("aria-hidden")).toBe("true");
    expect((document.getElementById("remove") as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers restoration only when every selected item is a removed word", () => {
    const removeButton = document.getElementById("remove") as HTMLButtonElement;

    updateTranscriptSelectionControls({
      selectionBar: document.getElementById("bar"),
      durationLabel: document.getElementById("duration"),
      removeButton,
      selectedItems: [wordItem("word:1", 1, 2, "removed")]
    });
    expect(removeButton.textContent).toBe("Restore this section");

    updateTranscriptSelectionControls({
      selectionBar: document.getElementById("bar"),
      durationLabel: document.getElementById("duration"),
      removeButton,
      selectedItems: [
        wordItem("word:1", 1, 2, "removed"),
        {
          key: "pause:1",
          kind: "pause",
          pause: { visibleStart: 2, visibleEnd: 4 }
        }
      ]
    });
    expect(removeButton.textContent).toBe("Remove selected text from video");
  });

  it("keeps mixed word and shortened pause ranges in one non destructive cut plan", () => {
    const items = [
      wordItem("word:1", 1, 2),
      {
        key: "pause:1",
        kind: "pause" as const,
        pause: { visibleStart: 2, visibleEnd: 5 }
      },
      wordItem("word:2", 5, 6)
    ];
    const selectedKeys = new Set(items.map(item => item.key));
    const wordRanges = buildSelectedWordRanges(items, selectedKeys);
    const mergedRanges = mergeVisibleSelectionRanges([
      ...wordRanges,
      { visibleStart: 2, visibleEnd: 4.5 }
    ]);

    expect(wordRanges).toEqual([
      { visibleStart: 1, visibleEnd: 2 },
      { visibleStart: 5, visibleEnd: 6 }
    ]);
    expect(mergedRanges).toEqual([
      { visibleStart: 1, visibleEnd: 4.5 },
      { visibleStart: 5, visibleEnd: 6 }
    ]);
  });

  it("recognises both supported keyboard delete commands", () => {
    expect(isTranscriptDeleteKey("Delete")).toBe(true);
    expect(isTranscriptDeleteKey("Backspace")).toBe(true);
    expect(isTranscriptDeleteKey("Enter")).toBe(false);
  });
});
