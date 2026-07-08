import {
  DEFAULT_ELEMENT_PICKER_SHORTCUT,
  STORAGE_KEY_ELEMENT_PICKER_SHORTCUT,
  type KeyboardShortcut,
} from "@shared/types/shortcut.types";

type PickerMode = "dom" | "text" | "screenshot";

// Brand colors
const BRAND_PRIMARY = "#32FF7E";
const BRAND_PRIMARY_RGB = "50, 255, 126";
const BRAND_BG_DARK = "#111827";
const BRAND_BORDER = "#374151";
const BRAND_MUTED = "#9CA3AF";

let isPickerActive = false;
let currentMode: PickerMode = "dom";
const MODES: PickerMode[] = ["dom", "text", "screenshot"];
let highlighter: HTMLElement | null = null;
let controlPanel: HTMLElement | null = null;
let currentTarget: HTMLElement | null = null;
let activationShortcut: KeyboardShortcut = DEFAULT_ELEMENT_PICKER_SHORTCUT;

// Screenshot selection state
let screenshotSelection: HTMLElement | null = null;
let screenshotDimensionLabel: HTMLElement | null = null;
let screenshotActions: HTMLElement | null = null;
let screenshotMasks: HTMLElement[] = [];
let screenshotPreviewPanel: HTMLElement | null = null;
let isResizing = false;
let isDraggingSelection = false;
let hasSelection = false;
let resizeHandle = "";
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartRect = { left: 0, top: 0, width: 0, height: 0 };
let dragStartX = 0;
let dragStartY = 0;
let dragStartLeft = 0;
let dragStartTop = 0;
let selectionRect = { left: 0, top: 0, width: 0, height: 0 };

// Free-form drag state
let isDrawingNewSelection = false;
let drawStartX = 0;
let drawStartY = 0;
let mouseDownTarget: HTMLElement | null = null;
let hadSelectionOnMousedown = false;
const DRAG_THRESHOLD = 5;

const MIN_SELECTION_SIZE = 10;
const HANDLE_SIZE = 10;

function init() {
  loadShortcut();
  window.addEventListener("keydown", handleKeydown, true);
  chrome.storage.onChanged.addListener(handleStorageChange);
}

function loadShortcut() {
  chrome.storage.local.get([STORAGE_KEY_ELEMENT_PICKER_SHORTCUT], (result) => {
    if (result[STORAGE_KEY_ELEMENT_PICKER_SHORTCUT]) {
      activationShortcut = result[
        STORAGE_KEY_ELEMENT_PICKER_SHORTCUT
      ] as KeyboardShortcut;
    }
  });
}

function handleStorageChange(changes: {
  [key: string]: chrome.storage.StorageChange;
}) {
  if (changes[STORAGE_KEY_ELEMENT_PICKER_SHORTCUT]) {
    activationShortcut = changes[STORAGE_KEY_ELEMENT_PICKER_SHORTCUT]
      .newValue as KeyboardShortcut;
  }
}

function handleKeydown(e: KeyboardEvent) {
  const isMatch =
    (e.code === activationShortcut.key || e.key === activationShortcut.key) &&
    !!e.altKey === activationShortcut.altKey &&
    !!e.shiftKey === activationShortcut.shiftKey &&
    !!e.ctrlKey === activationShortcut.ctrlKey &&
    !!e.metaKey === activationShortcut.metaKey;

  if (isMatch) {
    e.preventDefault();
    e.stopPropagation();
    togglePicker();
  }

  if (isPickerActive && e.key === "Escape") {
    e.preventDefault();
    if (screenshotPreviewPanel) {
      dismissPostCapturePreview();
    } else if (hasSelection && currentMode === "screenshot") {
      cancelScreenshotSelection();
    } else {
      disablePicker();
    }
  }

  // Confirm screenshot capture with Enter
  if (
    isPickerActive &&
    currentMode === "screenshot" &&
    e.key === "Enter" &&
    hasSelection &&
    !screenshotPreviewPanel
  ) {
    e.preventDefault();
    confirmScreenshotCapture();
  }

  // Cycle modes with arrow keys (only when nothing is selected)
  if (isPickerActive && !hasSelection && !screenshotPreviewPanel) {
    const currentIndex = MODES.indexOf(currentMode);

    if (e.key === "ArrowRight") {
      e.preventDefault();
      setMode(MODES[(currentIndex + 1) % MODES.length]);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setMode(MODES[(currentIndex - 1 + MODES.length) % MODES.length]);
    }
  }
}

function togglePicker() {
  if (isPickerActive) {
    disablePicker();
  } else {
    enablePicker();
  }
}

function enablePicker() {
  if (isPickerActive) return;
  isPickerActive = true;

  createHighlighter();
  createControlPanel();

  document.addEventListener("mousemove", handleMousemove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("mousedown", handleMousedown, true);
  document.addEventListener("mouseup", handleMouseup, true);

  // Prevent browser text selection while picker is active
  document.body.style.userSelect = "none";

  updateCursor();
}

function disablePicker() {
  if (!isPickerActive) return;
  isPickerActive = false;

  if (highlighter) {
    highlighter.remove();
    highlighter = null;
  }
  if (controlPanel) {
    controlPanel.remove();
    controlPanel = null;
  }

  cleanupScreenshotUI();

  document.removeEventListener("mousemove", handleMousemove, true);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("mousedown", handleMousedown, true);
  document.removeEventListener("mouseup", handleMouseup, true);
  removeScreenshotResizeListeners();
  removeDrawListeners();

  // Restore text selection
  document.body.style.userSelect = "";

  document.body.style.cursor = "";
  currentTarget = null;
  mouseDownTarget = null;
}

function updateCursor() {
  if (!isPickerActive) return;
  if (currentMode === "screenshot") {
    document.body.style.cursor = "crosshair";
  } else if (currentMode === "text") {
    document.body.style.cursor = "text";
  } else {
    document.body.style.cursor = "default";
  }
}

function createHighlighter() {
  highlighter = document.createElement("div");
  highlighter.style.position = "fixed";
  highlighter.style.zIndex = "2147483646";
  highlighter.style.border = `2px solid ${BRAND_PRIMARY}`;
  highlighter.style.backgroundColor = `rgba(${BRAND_PRIMARY_RGB}, 0.1)`;
  highlighter.style.pointerEvents = "none";
  highlighter.style.transition = "all 0.1s ease";
  highlighter.style.borderRadius = "4px";
  highlighter.style.boxSizing = "border-box";
  document.body.appendChild(highlighter);
}

function createControlPanel() {
  controlPanel = document.createElement("div");
  controlPanel.id = "ecm-picker-panel";

  Object.assign(controlPanel.style, {
    position: "fixed",
    bottom: "30px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    backgroundColor: BRAND_BG_DARK,
    color: "#fff",
    padding: "8px",
    borderRadius: "12px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    fontSize: "14px",
    fontWeight: "500",
    boxShadow: `0 10px 25px rgba(0,0,0,0.5), 0 0 0 1px ${BRAND_BORDER}`,
    display: "flex",
    gap: "8px",
    alignItems: "center",
    userSelect: "none",
  });

  const modes: { id: PickerMode; label: string; icon: string }[] = [
    {
      id: "dom",
      label: "DOM Element",
      icon: "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='16 18 22 12 16 6'></polyline><polyline points='8 6 2 12 8 18'></polyline></svg>",
    },
    {
      id: "text",
      label: "Inner Text",
      icon: "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='19' y1='6' x2='5' y2='6'></line><line x1='12' y1='6' x2='12' y2='20'></line><line x1='7' y1='20' x2='17' y2='20'></line></svg>",
    },
    {
      id: "screenshot",
      label: "Screenshot",
      icon: "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='18' height='18' rx='2' ry='2'></rect><circle cx='8.5' cy='8.5' r='1.5'></circle><polyline points='21 15 16 10 5 21'></polyline></svg>",
    },
  ];

  modes.forEach((mode) => {
    const btn = document.createElement("button");
    btn.innerHTML = `${mode.icon} <span>${mode.label}</span>`;

    Object.assign(btn.style, {
      background: currentMode === mode.id ? BRAND_PRIMARY : "transparent",
      color: currentMode === mode.id ? "#000" : BRAND_MUTED,
      border: "none",
      padding: "8px 12px",
      borderRadius: "8px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "13px",
      fontWeight: "600",
      transition: "all 0.2s ease",
    });

    btn.style.outline = "none";

    btn.onclick = (e) => {
      e.stopPropagation();
      setMode(mode.id);
    };

    controlPanel!.appendChild(btn);
  });

  const divider = document.createElement("div");
  Object.assign(divider.style, {
    width: "1px",
    height: "20px",
    backgroundColor: BRAND_BORDER,
    margin: "0 4px",
  });
  controlPanel.appendChild(divider);

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML =
    "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'></line><line x1='6' y1='6' x2='18' y2='18'></line></svg>";
  Object.assign(closeBtn.style, {
    background: "transparent",
    color: BRAND_MUTED,
    border: "none",
    padding: "8px",
    borderRadius: "8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "all 0.2s ease",
    outline: "none",
  });
  closeBtn.onmouseenter = () => (closeBtn.style.color = "#EF4444");
  closeBtn.onmouseleave = () => (closeBtn.style.color = BRAND_MUTED);
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    disablePicker();
  };
  controlPanel.appendChild(closeBtn);

  document.body.appendChild(controlPanel);
}

function setMode(mode: PickerMode) {
  const prevMode = currentMode;
  currentMode = mode;

  if (controlPanel) {
    const buttons = controlPanel.querySelectorAll("button");
    buttons.forEach((btn, index) => {
      if (index > 2) return;
      const isActive =
        (index === 0 && mode === "dom") ||
        (index === 1 && mode === "text") ||
        (index === 2 && mode === "screenshot");

      Object.assign(btn.style, {
        background: isActive ? BRAND_PRIMARY : "transparent",
        color: isActive ? "#000" : BRAND_MUTED,
      });
    });
  }
  updateCursor();

  // Update highlighter color - all modes now use brand neon green
  if (highlighter) {
    if (mode === "text") {
      highlighter.style.borderColor = "#3B82F6";
      highlighter.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
    } else {
      highlighter.style.borderColor = BRAND_PRIMARY;
      highlighter.style.backgroundColor = `rgba(${BRAND_PRIMARY_RGB}, 0.1)`;
    }
  }

  // Cleanup screenshot UI when leaving screenshot mode
  if (mode !== "screenshot" && prevMode === "screenshot") {
    cleanupScreenshotUI();
    removeScreenshotResizeListeners();
    // Show highlighter again
    if (highlighter) highlighter.style.display = "";
  }

  // When entering screenshot mode, keep highlighter visible for element selection
  if (mode === "screenshot" && prevMode !== "screenshot") {
    if (highlighter) highlighter.style.display = "";
  }
}

// --- DOM/Text/Screenshot element hover (shared) ---

function getElementAtHighlighterCenter(): HTMLElement | null {
  if (!highlighter) return null;

  const highlighterRect = highlighter.getBoundingClientRect();
  const centerX = highlighterRect.left + highlighterRect.width / 2;
  const centerY = highlighterRect.top + highlighterRect.height / 2;

  let bestMatch: HTMLElement | null = null;
  let bestMatchScore = Infinity;

  // Get all elements at point (including shadow DOM)
  const elements = document.elementsFromPoint
    ? document.elementsFromPoint(centerX, centerY)
    : [document.elementFromPoint(centerX, centerY)].filter(Boolean);

  for (const el of elements) {
    if (el === highlighter || !(el instanceof HTMLElement)) continue;
    if (!isElementVisible(el)) continue;

    const rect = el.getBoundingClientRect();

    // Calculate how close this element's bounds are to the highlighter
    const score =
      Math.abs(rect.top - highlighterRect.top) +
      Math.abs(rect.left - highlighterRect.left) +
      Math.abs(rect.width - highlighterRect.width) +
      Math.abs(rect.height - highlighterRect.height);

    if (score < bestMatchScore) {
      bestMatchScore = score;
      bestMatch = el;
    }
  }

  // Only return if it's a reasonably close match (within 50px total)
  return bestMatchScore < 50 ? bestMatch : null;
}

function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    parseFloat(style.opacity || "1") > 0 &&
    element.offsetParent !== null
  );
}

function handleMousemove(e: MouseEvent) {
  if (!isPickerActive || !highlighter) return;

  // In screenshot mode, don't highlight when user has an active selection
  if (currentMode === "screenshot" && hasSelection) return;

  const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;

  if (!target || target === highlighter || controlPanel?.contains(target))
    return;

  currentTarget = target;

  const rect = target.getBoundingClientRect();

  highlighter.style.top = `${rect.top}px`;
  highlighter.style.left = `${rect.left}px`;
  highlighter.style.width = `${rect.width}px`;
  highlighter.style.height = `${rect.height}px`;
}

async function handleClick(e: MouseEvent) {
  if (!isPickerActive) return;

  // In screenshot mode, clicks are handled by mousedown/mouseup flow
  if (currentMode === "screenshot") {
    // Let action buttons and control panel clicks pass through
    if (controlPanel?.contains(e.target as Node)) return;
    if (screenshotActions?.contains(e.target as Node)) return;

    e.preventDefault();
    e.stopPropagation();

    return;
  }

  if (controlPanel?.contains(e.target as Node)) return;

  e.preventDefault();
  e.stopPropagation();

  // Use highlighter center to get the element (works with shadow DOM too)
  const elementToCopy = getElementAtHighlighterCenter();
  if (!elementToCopy) return;

  // Visual feedback
  if (highlighter) {
    highlighter.style.transform = "scale(0.98)";
    setTimeout(() => {
      if (highlighter) highlighter.style.transform = "scale(1)";
    }, 150);
  }

  if (currentMode === "dom") {
    await copyDomElement(elementToCopy);
    disablePicker();
    showToast("Element copied!");
  } else if (currentMode === "text") {
    await copyInnerText(elementToCopy);
    disablePicker();
    showToast("Inner text copied!");
  }
}

// --- Screenshot mousedown/mouseup/mousemove for click vs drag ---

function handleMousedown(e: MouseEvent) {
  if (!isPickerActive || currentMode !== "screenshot") return;
  if (controlPanel?.contains(e.target as Node)) return;
  if (screenshotActions?.contains(e.target as Node)) return;
  if (screenshotSelection?.contains(e.target as Node)) return;

  e.preventDefault();
  e.stopPropagation();

  // Remember whether we had a selection when mousedown started
  hadSelectionOnMousedown = hasSelection;

  // Record the mousedown starting point and hovered element
  drawStartX = e.clientX;
  drawStartY = e.clientY;
  isDrawingNewSelection = false;
  mouseDownTarget = document.elementFromPoint(
    e.clientX,
    e.clientY,
  ) as HTMLElement;

  document.addEventListener("mousemove", handleDrawMove, true);
  document.addEventListener("mouseup", handleDrawEnd, true);
}

function handleDrawMove(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();

  const dx = e.clientX - drawStartX;
  const dy = e.clientY - drawStartY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Once past threshold, switch to free-form drag mode
  if (!isDrawingNewSelection && distance >= DRAG_THRESHOLD) {
    isDrawingNewSelection = true;

    // Cancel old selection if we had one - we're starting a new drag
    if (hadSelectionOnMousedown && hasSelection) {
      cancelScreenshotSelection();
    }

    // Hide highlighter during drag draw
    if (highlighter) highlighter.style.display = "none";
  }

  if (!isDrawingNewSelection) return;

  // Calculate rectangle from drag start to current mouse position
  let left = Math.min(drawStartX, e.clientX);
  let top = Math.min(drawStartY, e.clientY);
  const width = Math.abs(e.clientX - drawStartX);
  const height = Math.abs(e.clientY - drawStartY);

  // Clamp to viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  left = Math.max(0, left);
  top = Math.max(0, top);
  const right = Math.min(vw, left + width);
  const bottom = Math.min(vh, top + height);

  selectionRect = {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };

  // Create UI elements on first significant drag
  if (!screenshotSelection) {
    hasSelection = true;

    // Hide mode switcher panel during active selection
    if (controlPanel) controlPanel.style.display = "none";

    createOverlayMasks();
    createSelectionBox();
    createDimensionLabel();
    createActionButtons();
  }

  updateSelectionUI();
}

function handleDrawEnd(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();

  removeDrawListeners();

  if (isDrawingNewSelection) {
    // Finished free-form drag - finalize selection if large enough
    isDrawingNewSelection = false;

    if (
      selectionRect.width < MIN_SELECTION_SIZE ||
      selectionRect.height < MIN_SELECTION_SIZE
    ) {
      cancelScreenshotSelection();
    }
  } else if (hadSelectionOnMousedown) {
    // Had a selection and clicked outside without dragging - just cancel, return to element hover
    isDrawingNewSelection = false;
    cancelScreenshotSelection();
  } else {
    // No prior selection, it was a click - select the element
    isDrawingNewSelection = false;

    if (
      mouseDownTarget &&
      mouseDownTarget !== highlighter &&
      !controlPanel?.contains(mouseDownTarget)
    ) {
      currentTarget = mouseDownTarget;
      createSelectionFromElement(mouseDownTarget);
    }
  }

  hadSelectionOnMousedown = false;
  mouseDownTarget = null;
}

function handleMouseup(e: MouseEvent) {
  if (!isPickerActive || currentMode !== "screenshot") return;
  // Only prevent default in screenshot mode to avoid text selection, etc.
  if (controlPanel?.contains(e.target as Node)) return;
  if (screenshotActions?.contains(e.target as Node)) return;
  if (screenshotSelection?.contains(e.target as Node)) return;

  e.preventDefault();
  e.stopPropagation();
}

function removeDrawListeners() {
  document.removeEventListener("mousemove", handleDrawMove, true);
  document.removeEventListener("mouseup", handleDrawEnd, true);
}

// --- Screenshot: Create selection from element bounds ---

function createSelectionFromElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(vw, rect.left + rect.width);
  const bottom = Math.min(vh, rect.top + rect.height);

  selectionRect = {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };

  hasSelection = true;

  // Hide the element highlighter - we now show the selection box
  if (highlighter) highlighter.style.display = "none";

  // Hide mode switcher panel during active selection
  if (controlPanel) controlPanel.style.display = "none";

  // Create the dark overlay masks
  createOverlayMasks();

  // Create the selection box with resize handles
  createSelectionBox();
  createDimensionLabel();
  createActionButtons();
  updateSelectionUI();
}

// --- Overlay Masks (dark area outside selection) ---

function createOverlayMasks() {
  // Remove existing masks
  screenshotMasks.forEach((m) => m.remove());
  screenshotMasks = [];

  ["top", "right", "bottom", "left"].forEach((side) => {
    const mask = document.createElement("div");
    mask.dataset.screenshotMask = side;
    Object.assign(mask.style, {
      position: "fixed",
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      zIndex: "2147483644",
      pointerEvents: "none",
    });
    document.body.appendChild(mask);
    screenshotMasks.push(mask);
  });

  updateOverlayMasks();
}

function updateOverlayMasks() {
  const { left, top, width, height } = selectionRect;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  screenshotMasks.forEach((mask) => {
    const side = mask.dataset.screenshotMask;
    switch (side) {
      case "top":
        Object.assign(mask.style, {
          top: "0",
          left: "0",
          width: `${vw}px`,
          height: `${top}px`,
        });
        break;
      case "bottom":
        Object.assign(mask.style, {
          top: `${top + height}px`,
          left: "0",
          width: `${vw}px`,
          height: `${vh - top - height}px`,
        });
        break;
      case "left":
        Object.assign(mask.style, {
          top: `${top}px`,
          left: "0",
          width: `${left}px`,
          height: `${height}px`,
        });
        break;
      case "right":
        Object.assign(mask.style, {
          top: `${top}px`,
          left: `${left + width}px`,
          width: `${vw - left - width}px`,
          height: `${height}px`,
        });
        break;
    }
  });
}

// --- Selection Box with Resize Handles ---

function createSelectionBox() {
  if (screenshotSelection) screenshotSelection.remove();

  screenshotSelection = document.createElement("div");
  screenshotSelection.id = "ecm-screenshot-selection";
  Object.assign(screenshotSelection.style, {
    position: "fixed",
    border: `2px solid ${BRAND_PRIMARY}`,
    backgroundColor: "transparent",
    zIndex: "2147483645",
    cursor: "move",
    boxSizing: "border-box",
  });

  // 8 resize handles: 4 edges + 4 corners
  const handles = [
    {
      name: "n",
      cursor: "n-resize",
      top: "-5px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "30px",
      height: `${HANDLE_SIZE}px`,
    },
    {
      name: "s",
      cursor: "s-resize",
      bottom: "-5px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "30px",
      height: `${HANDLE_SIZE}px`,
    },
    {
      name: "e",
      cursor: "e-resize",
      top: "50%",
      right: "-5px",
      transform: "translateY(-50%)",
      width: `${HANDLE_SIZE}px`,
      height: "30px",
    },
    {
      name: "w",
      cursor: "w-resize",
      top: "50%",
      left: "-5px",
      transform: "translateY(-50%)",
      width: `${HANDLE_SIZE}px`,
      height: "30px",
    },
    {
      name: "nw",
      cursor: "nw-resize",
      top: "-5px",
      left: "-5px",
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
    },
    {
      name: "ne",
      cursor: "ne-resize",
      top: "-5px",
      right: "-5px",
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
    },
    {
      name: "sw",
      cursor: "sw-resize",
      bottom: "-5px",
      left: "-5px",
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
    },
    {
      name: "se",
      cursor: "se-resize",
      bottom: "-5px",
      right: "-5px",
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
    },
  ];

  handles.forEach((h) => {
    const handle = document.createElement("div");
    handle.dataset.handle = h.name;

    const styles: Record<string, string> = {
      position: "absolute",
      backgroundColor: BRAND_PRIMARY,
      borderRadius: h.name.length === 2 ? "2px" : "1px",
      cursor: h.cursor,
      width: h.width,
      height: h.height,
      zIndex: "2147483646",
    };

    if (h.top) styles.top = h.top;
    if (h.bottom) styles.bottom = h.bottom;
    if (h.left) styles.left = h.left;
    if (h.right) styles.right = h.right;
    if (h.transform) styles.transform = h.transform;

    Object.assign(handle.style, styles);

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startResize(h.name, e);
    });

    screenshotSelection!.appendChild(handle);
  });

  // Allow dragging the entire selection area
  screenshotSelection.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    if (target.dataset.handle) return;
    e.preventDefault();
    e.stopPropagation();
    startDragSelection(e);
  });

  document.body.appendChild(screenshotSelection);
}

function createDimensionLabel() {
  if (screenshotDimensionLabel) screenshotDimensionLabel.remove();

  screenshotDimensionLabel = document.createElement("div");
  Object.assign(screenshotDimensionLabel.style, {
    position: "fixed",
    zIndex: "2147483647",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    color: BRAND_PRIMARY,
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "12px",
    fontFamily: "monospace",
    fontWeight: "600",
    pointerEvents: "none",
    whiteSpace: "nowrap",
  });

  document.body.appendChild(screenshotDimensionLabel);
}

function updateDimensionLabel() {
  if (!screenshotDimensionLabel) return;

  const w = Math.round(selectionRect.width);
  const h = Math.round(selectionRect.height);
  screenshotDimensionLabel.textContent = `${w} × ${h}`;

  const vh = window.innerHeight;
  const spaceBelow = vh - (selectionRect.top + selectionRect.height);
  const labelGap = 8;

  // Place above if not enough space below (40px accounts for label + action buttons)
  let labelTop: number;
  if (spaceBelow < 40) {
    labelTop = selectionRect.top - labelGap - 24;
  } else {
    labelTop = selectionRect.top + selectionRect.height + labelGap;
  }

  const labelLeft = selectionRect.left + selectionRect.width / 2;

  Object.assign(screenshotDimensionLabel.style, {
    top: `${Math.max(4, labelTop)}px`,
    left: `${labelLeft}px`,
    transform: "translateX(-50%)",
  });
}

function createActionButtons() {
  if (screenshotActions) screenshotActions.remove();

  screenshotActions = document.createElement("div");
  Object.assign(screenshotActions.style, {
    position: "fixed",
    zIndex: "2147483647",
    display: "flex",
    gap: "6px",
    alignItems: "center",
  });

  const btnBase: Record<string, string> = {
    border: "none",
    padding: "8px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "12px",
    fontWeight: "600",
    outline: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
  };

  // Confirm button
  const confirmBtn = document.createElement("button");
  confirmBtn.innerHTML =
    "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='20 6 9 17 4 12'></polyline></svg>";
  Object.assign(confirmBtn.style, {
    ...btnBase,
    background: BRAND_PRIMARY,
    color: "#000",
  });
  confirmBtn.onmouseenter = () => {
    confirmBtn.style.opacity = "0.85";
  };
  confirmBtn.onmouseleave = () => {
    confirmBtn.style.opacity = "1";
  };
  confirmBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    confirmScreenshotCapture();
  };

  // Expand to fullscreen button
  const expandBtn = document.createElement("button");
  expandBtn.innerHTML =
    "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='15 3 21 3 21 9'></polyline><polyline points='9 21 3 21 3 15'></polyline><line x1='21' y1='3' x2='14' y2='10'></line><line x1='3' y1='21' x2='10' y2='14'></line></svg>";
  Object.assign(expandBtn.style, {
    ...btnBase,
    background: BRAND_BORDER,
    color: BRAND_MUTED,
  });
  expandBtn.onmouseenter = () => {
    expandBtn.style.background = "#4B5563";
    expandBtn.style.color = "#fff";
  };
  expandBtn.onmouseleave = () => {
    expandBtn.style.background = BRAND_BORDER;
    expandBtn.style.color = BRAND_MUTED;
  };
  expandBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    expandSelectionToFullscreen();
  };

  // Cancel button
  const cancelBtn = document.createElement("button");
  cancelBtn.innerHTML =
    "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'></line><line x1='6' y1='6' x2='18' y2='18'></line></svg>";
  Object.assign(cancelBtn.style, {
    ...btnBase,
    background: BRAND_BORDER,
    color: BRAND_MUTED,
  });
  cancelBtn.onmouseenter = () => {
    cancelBtn.style.background = "#4B5563";
    cancelBtn.style.color = "#EF4444";
  };
  cancelBtn.onmouseleave = () => {
    cancelBtn.style.background = BRAND_BORDER;
    cancelBtn.style.color = BRAND_MUTED;
  };
  cancelBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    cancelScreenshotSelection();
  };

  screenshotActions.appendChild(confirmBtn);
  screenshotActions.appendChild(expandBtn);
  screenshotActions.appendChild(cancelBtn);
  document.body.appendChild(screenshotActions);
}

function expandSelectionToFullscreen() {
  selectionRect = {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
  updateSelectionUI();
}

function updateActionButtonsPosition() {
  if (!screenshotActions) return;

  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const gap = 8;
  const btnHeight = 36;
  const btnBarWidth = 130;

  const spaceBelow = vh - (selectionRect.top + selectionRect.height);
  const spaceAbove = selectionRect.top;

  // Check if selection covers full viewport (fullscreen)
  const isFullscreen =
    selectionRect.left <= 1 &&
    selectionRect.top <= 1 &&
    selectionRect.width >= vw - 2 &&
    selectionRect.height >= vh - 2;

  let actionsTop: number;
  let actionsLeft: number;
  let transform: string;

  if (isFullscreen) {
    // Fullscreen: place buttons inside at bottom-center
    actionsTop = vh - btnHeight - 16;
    actionsLeft = vw / 2;
    transform = "translateX(-50%)";
  } else if (spaceBelow >= btnHeight + gap) {
    // Prefer below
    actionsTop = selectionRect.top + selectionRect.height + gap;
    actionsLeft = selectionRect.left + selectionRect.width;
    transform = "translateX(-100%)";
  } else if (spaceAbove >= btnHeight + gap) {
    // Fallback above
    actionsTop = selectionRect.top - gap - btnHeight;
    actionsLeft = selectionRect.left + selectionRect.width;
    transform = "translateX(-100%)";
  } else {
    // Inside selection at bottom
    actionsTop = selectionRect.top + selectionRect.height - btnHeight - gap;
    actionsLeft = selectionRect.left + selectionRect.width / 2;
    transform = "translateX(-50%)";
  }

  // Clamp to viewport
  actionsTop = Math.max(4, Math.min(actionsTop, vh - btnHeight - 4));
  actionsLeft = Math.max(btnBarWidth + 4, Math.min(actionsLeft, vw - 4));

  Object.assign(screenshotActions.style, {
    top: `${actionsTop}px`,
    left: `${actionsLeft}px`,
    transform,
  });
}

function updateSelectionUI() {
  if (!screenshotSelection) return;

  Object.assign(screenshotSelection.style, {
    left: `${selectionRect.left}px`,
    top: `${selectionRect.top}px`,
    width: `${selectionRect.width}px`,
    height: `${selectionRect.height}px`,
  });

  updateOverlayMasks();
  updateDimensionLabel();
  updateActionButtonsPosition();
}

// --- Resizing ---

function startResize(handle: string, e: MouseEvent) {
  isResizing = true;
  resizeHandle = handle;
  resizeStartX = e.clientX;
  resizeStartY = e.clientY;
  resizeStartRect = { ...selectionRect };

  document.addEventListener("mousemove", handleResizeMove, true);
  document.addEventListener("mouseup", handleResizeEnd, true);
}

function handleResizeMove(e: MouseEvent) {
  if (!isResizing) return;
  e.preventDefault();

  const dx = e.clientX - resizeStartX;
  const dy = e.clientY - resizeStartY;

  let { left, top, width, height } = resizeStartRect;

  if (resizeHandle.includes("n")) {
    const newTop = top + dy;
    const newHeight = height - dy;
    if (newHeight >= MIN_SELECTION_SIZE && newTop >= 0) {
      top = newTop;
      height = newHeight;
    }
  }

  if (resizeHandle.includes("s")) {
    const newHeight = height + dy;
    if (
      newHeight >= MIN_SELECTION_SIZE &&
      top + newHeight <= window.innerHeight
    ) {
      height = newHeight;
    }
  }

  if (resizeHandle.includes("w")) {
    const newLeft = left + dx;
    const newWidth = width - dx;
    if (newWidth >= MIN_SELECTION_SIZE && newLeft >= 0) {
      left = newLeft;
      width = newWidth;
    }
  }

  if (resizeHandle.includes("e")) {
    const newWidth = width + dx;
    if (
      newWidth >= MIN_SELECTION_SIZE &&
      left + newWidth <= window.innerWidth
    ) {
      width = newWidth;
    }
  }

  selectionRect = { left, top, width, height };
  updateSelectionUI();
}

function handleResizeEnd(e: MouseEvent) {
  if (!isResizing) return;
  e.preventDefault();
  isResizing = false;

  document.removeEventListener("mousemove", handleResizeMove, true);
  document.removeEventListener("mouseup", handleResizeEnd, true);
}

// --- Dragging selection ---

function startDragSelection(e: MouseEvent) {
  isDraggingSelection = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartLeft = selectionRect.left;
  dragStartTop = selectionRect.top;

  document.addEventListener("mousemove", handleDragSelectionMove, true);
  document.addEventListener("mouseup", handleDragSelectionEnd, true);
}

function handleDragSelectionMove(e: MouseEvent) {
  if (!isDraggingSelection) return;
  e.preventDefault();

  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;

  let newLeft = dragStartLeft + dx;
  let newTop = dragStartTop + dy;

  newLeft = Math.max(
    0,
    Math.min(newLeft, window.innerWidth - selectionRect.width),
  );
  newTop = Math.max(
    0,
    Math.min(newTop, window.innerHeight - selectionRect.height),
  );

  selectionRect = { ...selectionRect, left: newLeft, top: newTop };
  updateSelectionUI();
}

function handleDragSelectionEnd(e: MouseEvent) {
  if (!isDraggingSelection) return;
  e.preventDefault();
  isDraggingSelection = false;

  document.removeEventListener("mousemove", handleDragSelectionMove, true);
  document.removeEventListener("mouseup", handleDragSelectionEnd, true);
}

function removeScreenshotResizeListeners() {
  document.removeEventListener("mousemove", handleResizeMove, true);
  document.removeEventListener("mouseup", handleResizeEnd, true);
  document.removeEventListener("mousemove", handleDragSelectionMove, true);
  document.removeEventListener("mouseup", handleDragSelectionEnd, true);
}

// --- Capture ---

async function confirmScreenshotCapture() {
  if (!hasSelection) return;

  const captureRect = { ...selectionRect };

  // 1. Immediately disable picker and listeners so clicks don't trigger anything during capture
  isPickerActive = false;
  document.removeEventListener("mousemove", handleMousemove, true);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("mousedown", handleMousedown, true);
  document.removeEventListener("mouseup", handleMouseup, true);
  removeDrawListeners();
  removeScreenshotResizeListeners();
  document.body.style.cursor = "";
  document.body.style.userSelect = "";

  // 2. Hide all UI for clean capture
  if (screenshotSelection) screenshotSelection.style.visibility = "hidden";
  if (screenshotDimensionLabel)
    screenshotDimensionLabel.style.visibility = "hidden";
  if (screenshotActions) screenshotActions.style.visibility = "hidden";
  if (controlPanel) controlPanel.style.visibility = "hidden";
  screenshotMasks.forEach((m) => {
    m.style.visibility = "hidden";
  });

  // Wait for render
  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 300);
      });
    });
  });

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CAPTURE_VISIBLE_TAB",
    });

    if (!response || !response.dataUrl) {
      throw new Error("No dataUrl received from capture");
    }

    // Crop using canvas
    const croppedDataUrl = await new Promise<string>((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = window.devicePixelRatio;

          canvas.width = captureRect.width * scale;
          canvas.height = captureRect.height * scale;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));

            return;
          }

          ctx.drawImage(
            image,
            captureRect.left * scale,
            captureRect.top * scale,
            captureRect.width * scale,
            captureRect.height * scale,
            0,
            0,
            canvas.width,
            canvas.height,
          );

          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };

      image.onerror = () => {
        reject(new Error("Failed to load captured image"));
      };

      image.src = response.dataUrl;
    });

    // Save to extension clipboard in background
    const tempKey = `temp_screenshot_${Date.now()}`;
    await chrome.storage.local.set({
      [tempKey]: {
        content: croppedDataUrl,
        metadata: {
          source: "Screenshot Tool",
          sourceUrl: window.location.href,
          hostname: window.location.hostname,
        },
      },
    });

    chrome.runtime.sendMessage({
      type: "PROCESS_TEMP_SCREENSHOT",
      payload: { tempKey },
    });

    // Clean up selection UI now that capture is done
    cleanupScreenshotUI();
    showPostCapturePreview(croppedDataUrl);
  } catch (err) {
    console.error("[Screenshot] Capture failed:", err);
    cleanupScreenshotUI();
    disablePicker();
    showToast("Screenshot failed");
  }
}

function showPostCapturePreview(dataUrl: string) {
  // Create backdrop overlay
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    zIndex: "2147483645",
    backdropFilter: "blur(4px)",
  });

  // Create preview panel
  const panel = document.createElement("div");
  Object.assign(panel.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: "2147483646",
    backgroundColor: BRAND_BG_DARK,
    border: `1px solid ${BRAND_BORDER}`,
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    maxWidth: "520px",
    width: "90vw",
    animation: "ecm-fade-in 0.2s ease-out",
  });

  // Inject keyframe animation
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    @keyframes ecm-fade-in {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
  `;
  panel.appendChild(styleEl);

  // Header
  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  });

  const title = document.createElement("div");
  title.textContent = "Screenshot Captured";
  Object.assign(title.style, {
    color: BRAND_PRIMARY,
    fontSize: "15px",
    fontWeight: "600",
    letterSpacing: "0.02em",
  });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "\u2715";
  Object.assign(closeBtn.style, {
    background: "none",
    border: "none",
    color: BRAND_MUTED,
    fontSize: "18px",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: "6px",
    lineHeight: "1",
    transition: "color 0.15s, background 0.15s",
  });
  closeBtn.onmouseenter = () => {
    closeBtn.style.color = "#fff";
    closeBtn.style.background = "rgba(255,255,255,0.1)";
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.color = BRAND_MUTED;
    closeBtn.style.background = "none";
  };
  closeBtn.onclick = () => dismissPostCapturePreview();

  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Image preview
  const imgWrapper = document.createElement("div");
  Object.assign(imgWrapper.style, {
    borderRadius: "10px",
    overflow: "hidden",
    border: `1px solid ${BRAND_BORDER}`,
    marginBottom: "16px",
    backgroundColor: "#000",
    maxHeight: "320px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const img = document.createElement("img");
  img.src = dataUrl;
  Object.assign(img.style, {
    maxWidth: "100%",
    maxHeight: "320px",
    objectFit: "contain",
    display: "block",
  });
  imgWrapper.appendChild(img);
  panel.appendChild(imgWrapper);

  // SVG icons (16x16, stroke-based)
  const ICON_COPY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const ICON_CHECK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const ICON_EXTERNAL = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
  const ICON_DOWNLOAD = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

  // Action buttons container
  const actions = document.createElement("div");
  Object.assign(actions.style, {
    display: "flex",
    gap: "8px",
  });

  // Helper to create action buttons
  function createActionBtn(
    label: string,
    iconSvg: string,
    primary: boolean,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.innerHTML = `${iconSvg}<span style="margin-left:6px">${label}</span>`;
    Object.assign(btn.style, {
      flex: "1",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 12px",
      borderRadius: "10px",
      border: primary ? "none" : `1px solid ${BRAND_BORDER}`,
      backgroundColor: primary ? BRAND_PRIMARY : "transparent",
      color: primary ? BRAND_BG_DARK : "#e5e7eb",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 0.15s ease",
      fontFamily: "inherit",
      lineHeight: "1",
    });
    btn.onmouseenter = () => {
      if (primary) {
        btn.style.filter = "brightness(1.1)";
      } else {
        btn.style.backgroundColor = "rgba(255,255,255,0.08)";
      }
    };
    btn.onmouseleave = () => {
      if (primary) {
        btn.style.filter = "none";
      } else {
        btn.style.backgroundColor = "transparent";
      }
    };
    btn.onclick = onClick;

    return btn;
  }

  // Copy button - writes image to OS clipboard
  const copyBtn = createActionBtn("Copy", ICON_COPY, true, async () => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      copyBtn.innerHTML = `${ICON_CHECK}<span style="margin-left:6px">Copied!</span>`;
      setTimeout(() => {
        copyBtn.innerHTML = `${ICON_COPY}<span style="margin-left:6px">Copy</span>`;
      }, 1500);
    } catch (err) {
      console.error("[Screenshot] Copy to clipboard failed:", err);
      try {
        await navigator.clipboard.writeText(dataUrl);
        copyBtn.innerHTML = `${ICON_CHECK}<span style="margin-left:6px">Copied!</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = `${ICON_COPY}<span style="margin-left:6px">Copy</span>`;
        }, 1500);
      } catch (fallbackErr) {
        console.error("[Screenshot] Fallback copy failed:", fallbackErr);
      }
    }
  });

  // Download button
  const downloadBtn = createActionBtn("Download", ICON_DOWNLOAD, false, () => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `screenshot-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    downloadBtn.innerHTML = `${ICON_CHECK}<span style="margin-left:6px">Saved!</span>`;
    setTimeout(() => {
      downloadBtn.innerHTML = `${ICON_DOWNLOAD}<span style="margin-left:6px">Download</span>`;
    }, 1500);
  });

  actions.appendChild(copyBtn);
  actions.appendChild(downloadBtn);
  panel.appendChild(actions);

  // Click overlay to dismiss
  overlay.onclick = () => dismissPostCapturePreview();

  // Mount
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  screenshotPreviewPanel = panel;

  // Store overlay ref on panel for cleanup
  (panel as HTMLElement & { _overlay?: HTMLElement })._overlay = overlay;
}

function dismissPostCapturePreview() {
  if (screenshotPreviewPanel) {
    const overlay = (
      screenshotPreviewPanel as HTMLElement & { _overlay?: HTMLElement }
    )._overlay;
    if (overlay) overlay.remove();
    screenshotPreviewPanel.remove();
    screenshotPreviewPanel = null;
  }

  disablePicker();
}

function cancelScreenshotSelection() {
  hasSelection = false;
  isResizing = false;
  isDraggingSelection = false;
  removeScreenshotResizeListeners();

  if (screenshotSelection) {
    screenshotSelection.remove();
    screenshotSelection = null;
  }
  if (screenshotDimensionLabel) {
    screenshotDimensionLabel.remove();
    screenshotDimensionLabel = null;
  }
  if (screenshotActions) {
    screenshotActions.remove();
    screenshotActions = null;
  }
  screenshotMasks.forEach((m) => m.remove());
  screenshotMasks = [];

  selectionRect = { left: 0, top: 0, width: 0, height: 0 };

  // Restore element highlighter for re-selection
  if (highlighter) highlighter.style.display = "";

  // Show mode switcher panel again
  if (controlPanel) controlPanel.style.display = "flex";
}

function cleanupScreenshotUI() {
  hasSelection = false;
  isResizing = false;
  isDraggingSelection = false;

  if (screenshotSelection) {
    screenshotSelection.remove();
    screenshotSelection = null;
  }
  if (screenshotDimensionLabel) {
    screenshotDimensionLabel.remove();
    screenshotDimensionLabel = null;
  }
  if (screenshotActions) {
    screenshotActions.remove();
    screenshotActions = null;
  }
  screenshotMasks.forEach((m) => m.remove());
  screenshotMasks = [];

  if (screenshotPreviewPanel) {
    const overlay = (
      screenshotPreviewPanel as HTMLElement & { _overlay?: HTMLElement }
    )._overlay;
    if (overlay) overlay.remove();
    screenshotPreviewPanel.remove();
    screenshotPreviewPanel = null;
  }

  selectionRect = { left: 0, top: 0, width: 0, height: 0 };
}

// --- DOM / Text mode handlers ---

async function copyInnerText(element: HTMLElement) {
  const text = element.textContent || element.innerText || "";
  if (text.trim()) {
    chrome.runtime.sendMessage({
      type: "clipboard_captured",
      payload: {
        type: "text",
        content: text,
        metadata: {
          source: "Element Picker (Text)",
          sourceUrl: window.location.href,
          hostname: window.location.hostname,
        },
      },
    });
    await navigator.clipboard.writeText(text);
  } else {
    showToast("No text content found");
  }
}

async function copyDomElement(element: HTMLElement) {
  try {
    const clone = element.cloneNode(true) as HTMLElement;

    const styles = window.getComputedStyle(element);
    let styleString = "";

    const props = [
      "display",
      "position",
      "top",
      "left",
      "right",
      "bottom",
      "width",
      "height",
      "margin",
      "padding",
      "border",
      "border-radius",
      "background",
      "background-color",
      "color",
      "font-family",
      "font-size",
      "font-weight",
      "line-height",
      "text-align",
      "box-shadow",
      "opacity",
      "z-index",
      "flex",
      "flex-direction",
      "justify-content",
      "align-items",
      "grid-template-columns",
      "gap",
      "overflow",
      "text-decoration",
    ];

    for (const prop of props) {
      const val = styles.getPropertyValue(prop);
      if (
        val &&
        val !== "none" &&
        val !== "auto" &&
        val !== "normal" &&
        val !== "0px" &&
        val !== "rgba(0, 0, 0, 0)"
      ) {
        styleString += `${prop}: ${val}; `;
      }
    }

    const scopeId = "ecm-" + Math.random().toString(36).substr(2, 9);

    clone.removeAttribute("id");
    clone.classList.add(scopeId);

    const html = `
<style>
.${scopeId} {
  ${styleString}
}
</style>
${clone.outerHTML}
    `.trim();

    chrome.runtime.sendMessage({
      type: "clipboard_captured",
      payload: {
        type: "html",
        content: html,
        metadata: {
          source: "Element Picker (DOM)",
          sourceUrl: window.location.href,
          hostname: window.location.hostname,
          isHtmlSnippet: true,
        },
      },
    });

    // Write as HTML to OS clipboard
    const blob = new Blob([html], { type: "text/html" });
    const data = [
      new ClipboardItem({
        ["text/html"]: blob,
        ["text/plain"]: new Blob([html], { type: "text/plain" }),
      }),
    ];
    await navigator.clipboard.write(data);
  } catch (err) {
    console.error("[ECM Picker] Failed to copy:", err);
  }
}

function showToast(msg: string) {
  const toast = document.createElement("div");
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    backgroundColor: BRAND_BG_DARK,
    color: BRAND_PRIMARY,
    padding: "8px 16px",
    borderRadius: "8px",
    fontWeight: "bold",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    border: `1px solid ${BRAND_BORDER}`,
    transition: "opacity 0.3s ease",
    fontFamily: "sans-serif",
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

init();
