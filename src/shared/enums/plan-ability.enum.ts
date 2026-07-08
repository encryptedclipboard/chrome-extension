export enum PlanAbility {
  // Protection & Sync
  CLIPBOARD_SYNC = "clipboard_sync", // Cloud sync capability

  // Import/Export
  IMPORT_JSON = "import_json",
  IMPORT_CSV = "import_csv",

  // Advanced features
  EXPORT_JSON = "export_json",
  EXPORT_CSV = "export_csv",
  PRIORITY_SUPPORT = "priority_support",

  // Security Features
  PIN_LOCK = "pin_lock", // PIN lock for clipboard
  AUTO_LOCK = "auto_lock", // Auto-lock after inactivity

  // Sync Features
  AUTO_SYNC = "auto_sync", // Auto sync to cloud
  MANUAL_SYNC = "manual_sync", // Manual sync to cloud

  // UI Features
  FLOATING_WINDOW = "floating_window", // Floating window mode
  MOBILE_APP_ACCESS = "mobile_app_access", // Access to mobile application
  IMAGE_SUPPORT = "image_support", // Ability to copy/sync images
  // Snippets
  TEXT_EXPANDER_LIMIT = "TEXT_EXPANDER_LIMIT",
}
