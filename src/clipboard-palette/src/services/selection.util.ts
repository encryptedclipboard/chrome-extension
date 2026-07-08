// Reusable utilities for saving/restoring cursor/selection position
// Works with native inputs, textareas, and contenteditable elements
// Supports modern rich text editors (Tiptap, Quill, Slate, Draft.js, etc.)

export interface SelectionState {
  type: "input" | "textarea" | "contenteditable";
  start: number;
  end: number;
  range?: Range;
}

export function saveSelection(
  element: HTMLElement | null,
): SelectionState | null {
  if (!element) return null;

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return {
      type: element instanceof HTMLInputElement ? "input" : "textarea",
      start: element.selectionStart ?? 0,
      end: element.selectionEnd ?? 0,
    };
  }

  if (element.isContentEditable) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      return {
        type: "contenteditable",
        start: range.startOffset,
        end: range.endOffset,
        range: range.cloneRange(),
      };
    }
  }

  return null;
}

export function restoreSelection(
  element: HTMLElement | null,
  state: SelectionState | null,
): boolean {
  if (!element || !state) return false;

  try {
    if (state.type === "input" || state.type === "textarea") {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        element.focus();
        element.setSelectionRange(state.start, state.end);
        return true;
      }
    }

    if (state.type === "contenteditable") {
      const selection = window.getSelection();
      if (selection) {
        element.focus();

        if (state.range) {
          try {
            selection.removeAllRanges();
            selection.addRange(state.range);
            return true;
          } catch {
            // Element may have changed, try fallback
          }
        }

        const textNode = element.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          selection.removeAllRanges();
          const newRange = document.createRange();
          const maxOffset = textNode.textContent?.length ?? 0;
          const start = Math.min(state.start, maxOffset);
          const end = Math.min(state.end, maxOffset);
          newRange.setStart(textNode, start);
          newRange.setEnd(textNode, end);
          selection.addRange(newRange);
          return true;
        }
      }
    }

    return false;
  } catch (e) {
    console.warn("[Selection] Failed to restore:", e);
    return false;
  }
}
