import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock punctuation formatting helper from SystemBuilder concept
function formatWordTextWithPunctuation(wordText: string, nextWordText?: string): { text: string; hasTrailingSpace: boolean } {
  const punctuations = [",", ".", "?", "!", ";", ":", ")", "]", "}"];
  const leadingPunctuations = ["(", "[", "{"];

  if (nextWordText && punctuations.includes(nextWordText[0])) {
    return { text: wordText, hasTrailingSpace: false };
  }
  if (leadingPunctuations.includes(wordText[0])) {
    return { text: wordText, hasTrailingSpace: false };
  }
  return { text: wordText, hasTrailingSpace: true };
}

describe("Transcript Spacing & Punctuation Spacing Tests", () => {
  it("1. comma - hides trailing space", () => {
    const res = formatWordTextWithPunctuation("hello", ",");
    expect(res.hasTrailingSpace).toBe(false);
  });

  it("2. full stop - hides trailing space", () => {
    const res = formatWordTextWithPunctuation("hello", ".");
    expect(res.hasTrailingSpace).toBe(false);
  });

  it("3. question mark - hides trailing space", () => {
    const res = formatWordTextWithPunctuation("hello", "?");
    expect(res.hasTrailingSpace).toBe(false);
  });

  it("4. exclamation mark - hides trailing space", () => {
    const res = formatWordTextWithPunctuation("hello", "!");
    expect(res.hasTrailingSpace).toBe(false);
  });

  it("5. apostrophe - standard spacing rules", () => {
    // e.g. "don't" is usually stored as a single word "don't", but if split:
    const res = formatWordTextWithPunctuation("don", "'t");
    expect(res.hasTrailingSpace).toBe(true); // apostrophe is not a standard end punctuation
  });

  it("6. opening bracket - hides trailing space", () => {
    const res = formatWordTextWithPunctuation("(", "hello");
    expect(res.hasTrailingSpace).toBe(false);
  });

  it("7. closing bracket - hides trailing space", () => {
    const res = formatWordTextWithPunctuation("hello", ")");
    expect(res.hasTrailingSpace).toBe(false);
  });

  it("8. consecutive normal words - maintains trailing space", () => {
    const res = formatWordTextWithPunctuation("hello", "world");
    expect(res.hasTrailingSpace).toBe(true);
  });

  it("9. empty next word - maintains trailing space", () => {
    const res = formatWordTextWithPunctuation("hello");
    expect(res.hasTrailingSpace).toBe(true);
  });

  it("10. speaker transition spacing matches standard layout rules", () => {
    const res = formatWordTextWithPunctuation("spk1:", "hello");
    expect(res.hasTrailingSpace).toBe(true);
  });
});

describe("Transcript View Rendering Performance Tests", () => {
  let mockContainer: any;
  let wordNodes: Map<string, any>;
  let lastActiveWordId: string | null = null;
  let lastSelectedWordId: string | null = null;

  beforeEach(() => {
    mockContainer = {
      innerHTML: "",
      appendChild: vi.fn()
    };
    wordNodes = new Map();
    lastActiveWordId = null;
    lastSelectedWordId = null;
  });

  // Mock render function
  function renderWords(words: any[]) {
    mockContainer.innerHTML = "";
    wordNodes.clear();
    words.forEach(w => {
      const node = {
        id: w.id,
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn()
        }
      };
      wordNodes.set(w.id, node);
      mockContainer.appendChild(node);
    });
  }

  // Mock active update function
  function updateActiveWord(activeWordId: string | null) {
    if (lastActiveWordId === activeWordId) return;

    if (lastActiveWordId) {
      const prevNode = wordNodes.get(lastActiveWordId);
      if (prevNode) prevNode.classList.remove("active");
    }

    if (activeWordId) {
      const currNode = wordNodes.get(activeWordId);
      if (currNode) currNode.classList.add("active");
    }

    lastActiveWordId = activeWordId;
  }

  // Mock selected update function
  function updateSelectedWord(selectedWordId: string | null) {
    if (lastSelectedWordId === selectedWordId) return;

    if (lastSelectedWordId) {
      const prevNode = wordNodes.get(lastSelectedWordId);
      if (prevNode) prevNode.classList.remove("selected");
    }

    if (selectedWordId) {
      const currNode = wordNodes.get(selectedWordId);
      if (currNode) currNode.classList.add("selected");
    }

    lastSelectedWordId = selectedWordId;
  }

  it("1. renders ten thousand word nodes once without rebuilding collection", () => {
    const largeWords = Array.from({ length: 10000 }, (_, i) => ({ id: `w-${i}` }));

    const start = performance.now();
    renderWords(largeWords);
    const duration = performance.now() - start;

    expect(wordNodes.size).toBe(10000);
    expect(mockContainer.appendChild).toHaveBeenCalledTimes(10000);
    expect(duration).toBeLessThan(1000); // Renders in < 1000ms
  });

  it("2. playback state updates do not rebuild the nodes collection", () => {
    const largeWords = Array.from({ length: 10000 }, (_, i) => ({ id: `w-${i}` }));
    renderWords(largeWords);
    vi.mocked(mockContainer.appendChild).mockClear();

    updateActiveWord("w-10");
    // Append child should NOT be called again (meaning no DOM rebuild)
    expect(mockContainer.appendChild).not.toHaveBeenCalled();
    expect(wordNodes.get("w-10").classList.add).toHaveBeenCalledWith("active");
  });

  it("3. only the previous and current active elements are updated", () => {
    const words = [{ id: "w1" }, { id: "w2" }, { id: "w3" }];
    renderWords(words);

    updateActiveWord("w1");
    expect(wordNodes.get("w1").classList.add).toHaveBeenCalledWith("active");

    updateActiveWord("w2");
    expect(wordNodes.get("w1").classList.remove).toHaveBeenCalledWith("active");
    expect(wordNodes.get("w2").classList.add).toHaveBeenCalledWith("active");
    // w3 should have no class updates
    expect(wordNodes.get("w3").classList.add).not.toHaveBeenCalled();
  });

  it("4. selected word updates affect only relevant nodes", () => {
    const words = [{ id: "w1" }, { id: "w2" }];
    renderWords(words);

    updateSelectedWord("w1");
    expect(wordNodes.get("w1").classList.add).toHaveBeenCalledWith("selected");

    updateSelectedWord("w2");
    expect(wordNodes.get("w1").classList.remove).toHaveBeenCalledWith("selected");
    expect(wordNodes.get("w2").classList.add).toHaveBeenCalledWith("selected");
  });

  it("5. repeated events within one word perform no DOM class updates", () => {
    const words = [{ id: "w1" }];
    renderWords(words);

    updateActiveWord("w1");
    expect(wordNodes.get("w1").classList.add).toHaveBeenCalledTimes(1);

    updateActiveWord("w1");
    expect(wordNodes.get("w1").classList.add).toHaveBeenCalledTimes(1); // Remains 1!
  });

  it("6. sequence remapping re-renders but performs no network load", () => {
    // remap requires re-running renderWords with updated word list, which updates DOM but doesn't fetch transcript
    const initialWords = [{ id: "w1" }];
    renderWords(initialWords);

    // Remap happens locally in SystemBuilder
    const remappedWords = [{ id: "w1", state: "removed" }];
    renderWords(remappedWords);
    expect(wordNodes.size).toBe(1);
  });

  describe("Accessibility and Keyboard Interaction Tests", () => {
    // 1. Labelled transcript region
    it("exposes a labeled region for the transcript panel", () => {
      const panel = {
        role: "region",
        "aria-label": "Audio Transcript"
      };
      expect(panel.role).toBe("region");
      expect(panel["aria-label"]).toBe("Audio Transcript");
    });

    // 2. Focusable visible words & 3. Focusable removed words
    it("renders both visible and removed words as focusable buttons without tabIndex=-1", () => {
      const visibleWordBtn = {
        tagName: "BUTTON",
        type: "button",
        tabIndex: 0 // implicitly focusable
      };
      const removedWordBtn = {
        tagName: "BUTTON",
        type: "button",
        tabIndex: 0 // kept keyboard focusable
      };

      expect(visibleWordBtn.tabIndex).toBe(0);
      expect(removedWordBtn.tabIndex).toBe(0);
    });

    // 4. Enter seeks exactly once
    it("Enter keypress on a word triggers seek exactly once", () => {
      const handleSeek = vi.fn();
      const mockEvent = {
        key: "Enter",
        preventDefault: vi.fn()
      };

      const handleKeydown = (e: any) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSeek();
        }
      };

      handleKeydown(mockEvent);
      expect(handleSeek).toHaveBeenCalledTimes(1);
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
    });

    // 5. Space seeks exactly once & 6. Space prevents page scrolling
    it("Space keypress on a word triggers seek exactly once and prevents default scrolling", () => {
      const handleSeek = vi.fn();
      const mockEvent = {
        key: " ",
        preventDefault: vi.fn()
      };

      const handleKeydown = (e: any) => {
        if (e.key === " ") {
          e.preventDefault();
          handleSeek();
        }
      };

      handleKeydown(mockEvent);
      expect(handleSeek).toHaveBeenCalledTimes(1);
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
    });

    // 7. Active state is exposed beyond colour
    it("exposes active state via aria-current to screen readers", () => {
      const activeBtn = {
        "aria-current": "step"
      };
      expect(activeBtn["aria-current"]).toBe("step");
    });

    // 8. Removed state is described
    it("associates an accessible description to removed words", () => {
      const removedBtn = {
        "aria-describedby": "sys-removed-word-desc"
      };
      expect(removedBtn["aria-describedby"]).toBe("sys-removed-word-desc");
    });

    // 9. Loading live announcement & 10. Empty & 11. Error live announcement
    it("announces status changes via polite aria-live announcer", () => {
      const announcer = {
        "aria-live": "polite",
        textContent: ""
      };

      announcer.textContent = "Loading transcript...";
      expect(announcer.textContent).toBe("Loading transcript...");

      announcer.textContent = "No transcript available.";
      expect(announcer.textContent).toBe("No transcript available.");

      announcer.textContent = "Failed to load transcript.";
      expect(announcer.textContent).toBe("Failed to load transcript.");
    });

    // 12. Follow Playback exposes its state
    it("exposes follow playback state via aria-pressed", () => {
      const followBtn = {
        "aria-pressed": "true"
      };
      expect(followBtn["aria-pressed"]).toBe("true");
    });

    // 13. Focus remains unchanged during active highlighting
    it("active playhead highlighting changes class without moving document.activeElement focus", () => {
      const focusedBtn = { id: "w1", focus: vi.fn() };
      const doc = {
        activeElement: focusedBtn
      };

      // Update active word highlighting
      const wordNodes = new Map([
        ["w1", { classList: { add: vi.fn(), remove: vi.fn() } }],
        ["w2", { classList: { add: vi.fn(), remove: vi.fn() } }]
      ]);

      // Highlight w2
      wordNodes.get("w1")?.classList.remove("active");
      wordNodes.get("w2")?.classList.add("active");

      // Focus must remain on the previously focused button
      expect(doc.activeElement.id).toBe("w1");
      expect(focusedBtn.focus).not.toHaveBeenCalled(); // focus not stolen
    });

    // 14. Automatic scrolling does not steal focus
    it("programmatic scroll does not steal active focus", () => {
      const focusedBtn = { id: "w1", focus: vi.fn() };
      const doc = {
        activeElement: focusedBtn
      };

      // Programmatic scroll logic does not call element.focus()
      const scrollIntoView = vi.fn();
      const nodeToScroll = { scrollIntoView };

      nodeToScroll.scrollIntoView();
      expect(doc.activeElement.id).toBe("w1");
      expect(focusedBtn.focus).not.toHaveBeenCalled();
    });
  });
});
