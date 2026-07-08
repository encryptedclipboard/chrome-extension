export const lockStore = $state({
  isLocked: false,
  isInitialized: false,

  setLocked(locked: boolean) {
    this.isLocked = locked;
    this.isInitialized = true;
  },
});
