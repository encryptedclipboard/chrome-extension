const RATING_STORAGE_KEYS = {
  FIRST_INSTALL_DATE: "firstInstallDate",
  RATING_MODAL_DISMISSED: "ratingModalDismissed",
  RATING_MODAL_NOT_NOW: "ratingModalNotNow",
} as const;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export class RatingService {
  async getFirstInstallDate(): Promise<number | undefined> {
    const result = await chrome.storage.local.get(
      RATING_STORAGE_KEYS.FIRST_INSTALL_DATE,
    );
    return result[RATING_STORAGE_KEYS.FIRST_INSTALL_DATE] as number | undefined;
  }

  async setFirstInstallDate(date: number): Promise<void> {
    await chrome.storage.local.set({
      [RATING_STORAGE_KEYS.FIRST_INSTALL_DATE]: date,
    });
  }

  async isRatingModalDismissed(): Promise<boolean> {
    const result = await chrome.storage.local.get(
      RATING_STORAGE_KEYS.RATING_MODAL_DISMISSED,
    );
    return result[RATING_STORAGE_KEYS.RATING_MODAL_DISMISSED] === true;
  }

  async setRatingModalDismissed(): Promise<void> {
    await chrome.storage.local.set({
      [RATING_STORAGE_KEYS.RATING_MODAL_DISMISSED]: true,
    });
  }

  async getRatingModalNotNowTimestamp(): Promise<number | undefined> {
    const result = await chrome.storage.local.get(
      RATING_STORAGE_KEYS.RATING_MODAL_NOT_NOW,
    );
    return result[RATING_STORAGE_KEYS.RATING_MODAL_NOT_NOW] as
      | number
      | undefined;
  }

  async setRatingModalNotNow(timestamp: number): Promise<void> {
    await chrome.storage.local.set({
      [RATING_STORAGE_KEYS.RATING_MODAL_NOT_NOW]: timestamp,
    });
  }

  async shouldShowRatingModal(): Promise<boolean> {
    const installDate = await this.getFirstInstallDate();
    if (!installDate) return false;

    const hasBeen24Hours = Date.now() - installDate >= TWENTY_FOUR_HOURS_MS;
    if (!hasBeen24Hours) return false;

    const dismissed = await this.isRatingModalDismissed();
    if (dismissed) return false;

    const notNowTimestamp = await this.getRatingModalNotNowTimestamp();
    if (notNowTimestamp) {
      const hasBeen7Days = Date.now() - notNowTimestamp >= SEVEN_DAYS_MS;
      if (!hasBeen7Days) return false;
    }

    return true;
  }
}

export const ratingService = new RatingService();
