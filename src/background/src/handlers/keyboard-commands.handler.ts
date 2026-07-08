import { PlanAbility } from "@shared/enums";
import { storageService } from "../services";
import { openClipboardWindow } from "../utils/open-window.util";

export const keyboardCommandsHandler = async (command: string) => {
  if (command === "open_clipboard_window") {
    try {
      const authData = await storageService.getAuthData();

      // Check if user is authenticated
      if (!authData || !authData.authToken) {
        console.warn(
          "[Background] Authentication required to open floating window via shortcut",
        );
        return;
      }

      // Check if user has FLOATING_WINDOW ability
      const hasAbility =
        authData.subscription?.planDetails?.abilities?.includes(
          PlanAbility.FLOATING_WINDOW,
        );

      if (!hasAbility) {
        console.warn(
          "[Background] FLOATING_WINDOW ability required for shortcut",
        );
        return;
      }

      openClipboardWindow();
    } catch (error) {
      console.error(
        "[Background] Error handling open_clipboard_window shortcut:",
        error,
      );
    }
  }
};
