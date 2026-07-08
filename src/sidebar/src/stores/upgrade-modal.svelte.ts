import type { UpgradeModalOptions } from "../types/modal.types";

const createUpgradeModalStore = () => {
  let isOpen = $state<boolean>(false);
  let title = $state<string>("Premium Feature");
  let featureName = $state<string>("this feature");
  let description = $state<string>("");
  let subDescription = $state<string>(
    "Upgrade to a premium plan to unlock this and many other powerful features!",
  );

  const open = (details: UpgradeModalOptions) => {
    if (details.featureName) featureName = details.featureName;
    if (details.title) title = details.title;

    // If description is provided, use it. Otherwise, we might rely on the component to construct it from featureName.
    // But to be fully flexible, we should probably allow the store to hold the full text.
    // If the caller passes description, we use it.
    if (details.description) {
      description = details.description;
    } else {
      // Reset to empty so the component can decide or we can set a default here.
      // The current component logic is: <strong>{featureName}</strong> is a premium feature available to paid users.
      // I'll leave description empty if not provided, and handle the default logic in the component or here.
      // Let's handle it in the component to keep the "bolding" logic if needed, OR we can just pass the full HTML string?
      // Svelte handles HTML safely but we need `@html`.
      // Better to keep `featureName` separate if we want to keep the specific formatting.
      description = "";
    }

    if (details.subDescription) subDescription = details.subDescription;

    isOpen = true;
  };

  const close = () => {
    isOpen = false;
  };

  return {
    get isOpen() {
      return isOpen;
    },
    get title() {
      return title;
    },
    get featureName() {
      return featureName;
    },
    get description() {
      return description;
    },
    get subDescription() {
      return subDescription;
    },
    open,
    close,
  };
};

export const upgradeModalStore = createUpgradeModalStore();
