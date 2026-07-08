// Navigation store for sidebar page routing
export enum PageType {
  HOME = "home",
  PROFILE = "profile",
  SETTINGS = "settings",
  SNIPPETS = "snippets",
}

const createNavigationStore = () => {
  let currentPage = $state<PageType>(PageType.HOME);

  const setPage = (page: PageType) => {
    currentPage = page;
  };

  const goHome = () => {
    setPage(PageType.HOME);
  };

  const goToProfile = () => {
    setPage(PageType.PROFILE);
  };

  const goToSettings = () => {
    setPage(PageType.SETTINGS);
  };

  const goToSnippets = () => {
    setPage(PageType.SNIPPETS);
  };

  return {
    get currentPage() {
      return currentPage;
    },
    setPage,
    goHome,
    goToProfile,
    goToSettings,
    goToSnippets,
  };
};

export const navigationStore = createNavigationStore();
