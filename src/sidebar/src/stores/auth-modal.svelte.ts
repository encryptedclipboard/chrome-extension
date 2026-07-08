export interface AuthModalState {
  isOpen: boolean;
  feature?: string; // which feature triggered the modal (e.g. "sync", "lock")
}

function createAuthModalStore() {
  const state = $state<AuthModalState>({
    isOpen: false,
    feature: undefined,
  });

  function open(feature?: string) {
    state.isOpen = true;
    state.feature = feature;
  }

  function close() {
    state.isOpen = false;
    state.feature = undefined;
  }

  return {
    get isOpen() {
      return state.isOpen;
    },
    get feature() {
      return state.feature;
    },
    open,
    close,
  };
}

export const authModalStore = createAuthModalStore();
