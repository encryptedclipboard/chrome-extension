const createRatingModalStore = () => {
  let isOpen = $state<boolean>(false);

  const open = () => {
    isOpen = true;
  };

  const close = () => {
    isOpen = false;
  };

  return {
    get isOpen() {
      return isOpen;
    },
    open,
    close,
  };
};

export const ratingModalStore = createRatingModalStore();
