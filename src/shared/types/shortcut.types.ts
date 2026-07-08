export interface KeyboardShortcut {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export const DEFAULT_CB_PALETTE_SHORTCUT: KeyboardShortcut = {
  key: "KeyV",
  altKey: true,
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
};

export const STORAGE_KEY_CB_PALETTE_SHORTCUT = "cbPaletteShortcut";

export const DEFAULT_ELEMENT_PICKER_SHORTCUT: KeyboardShortcut = {
  key: "KeyC",
  altKey: true,
  ctrlKey: false,
  shiftKey: true,
  metaKey: false,
};

export const STORAGE_KEY_ELEMENT_PICKER_SHORTCUT = "elementPickerShortcut";

export const DEFAULT_FILTER_SHORTCUT: KeyboardShortcut = {
  key: "KeyF",
  altKey: false,
  ctrlKey: true,
  shiftKey: true,
  metaKey: false,
};

export const STORAGE_KEY_FILTER_SHORTCUT = "filterShortcut";

export function isKeyboardShortcut(obj: any): obj is KeyboardShortcut {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.key === "string" &&
    typeof obj.altKey === "boolean" &&
    typeof obj.ctrlKey === "boolean" &&
    typeof obj.shiftKey === "boolean" &&
    typeof obj.metaKey === "boolean"
  );
}
