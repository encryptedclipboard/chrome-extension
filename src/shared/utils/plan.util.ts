import { PlanAbility } from "../enums/plan-ability.enum";

export const getFeaturesFromAbilities = (abilities: string[]): string[] => {
  const features: string[] = [];
  const abilitySet = new Set(abilities);

  // Clipboard Features
  if (abilitySet.has("clipboard_history")) features.push("Clipboard History");
  // Note: CLIPBOARD_UNLIMITED ability is used internally for backend logic
  // The actual clipboard item limits are shown from plan.maxClipboardItemsLimit in the database
  if (abilitySet.has("clipboard_search")) features.push("Search & Filters");
  if (abilitySet.has("clipboard_favorites"))
    features.push("Favorite Clipboard Items");
  if (abilitySet.has("clipboard_tags")) features.push("Tag Clipboard Items");
  if (abilitySet.has(PlanAbility.CLIPBOARD_SYNC)) features.push("Cloud Sync");
  if (abilitySet.has("clipboard_encryption"))
    features.push("End-to-End Encryption");
  if (abilitySet.has(PlanAbility.IMAGE_SUPPORT))
    features.push("Image Clipboard Support");

  // Security Features
  if (abilitySet.has(PlanAbility.PIN_LOCK))
    features.push("PIN Lock Protection");
  if (abilitySet.has(PlanAbility.AUTO_LOCK)) features.push("Auto-Lock");

  // Sync Features
  if (abilitySet.has(PlanAbility.AUTO_SYNC)) features.push("Auto Sync");
  if (abilitySet.has("cross_device_sync")) features.push("Cross-Device Sync");

  // UI Features
  if (abilitySet.has(PlanAbility.FLOATING_WINDOW))
    features.push("Floating Window");
  if (abilitySet.has("dark_mode")) features.push("Dark Mode");
  if (abilitySet.has("custom_themes")) features.push("Custom Themes");
  if (abilitySet.has(PlanAbility.MOBILE_APP_ACCESS))
    features.push("Mobile App Access");

  // Import/Export
  const exportOps = [];
  if (abilitySet.has(PlanAbility.EXPORT_JSON)) exportOps.push("JSON");
  if (abilitySet.has(PlanAbility.EXPORT_CSV)) exportOps.push("CSV");
  if (exportOps.length > 0) {
    features.push(`Export ${exportOps.join(" & ")}`);
  }

  const importOps = [];
  if (abilitySet.has(PlanAbility.IMPORT_JSON)) importOps.push("JSON");
  if (abilitySet.has(PlanAbility.IMPORT_CSV)) importOps.push("CSV");
  if (importOps.length > 0) {
    features.push(`Import ${importOps.join(" & ")}`);
  }

  // Support
  if (abilitySet.has(PlanAbility.PRIORITY_SUPPORT))
    features.push("Priority Support");

  // Pattern Detection
  if (abilitySet.has("json_validation"))
    features.push("Smart Pattern Detection");

  return features;
};

export const formatFeature = (feature: string): string => {
  return feature
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
};
