import { browserAPI } from "@shared/utils/browser-api.util";
import { ClipboardItemType } from "@shared/enums/clipboard-item-type.enum";
import { MessageType } from "@shared/types/message.types";

/**
 * Injects a "Copy URL" button into the GitHub header actions (Repos and PRs).
 */
function injectCopyButton() {
  // 1. Target standard repository header actions
  const actionsList = document.querySelector(".pagehead-actions");

  // 2. Target newer PageHeader actions (used in PRs and some newer repo views)
  const pageHeaderActions = document.querySelector(
    '[data-component="PH_Actions"] .d-flex.gap-1, [data-component="PH_Actions"]',
  );

  // 3. Fallback for other React-based header structures
  const repositoryDetails = document.getElementById(
    "repository-details-container",
  );

  if (!actionsList && !pageHeaderActions && !repositoryDetails) return;

  // Avoid duplicate injection
  if (document.getElementById("ecm-github-copy-url")) return;

  const container = document.createElement(actionsList ? "li" : "div");
  container.id = "ecm-github-copy-url";
  if (actionsList) {
    container.className = "d-inline-block";
  } else {
    container.className = "d-flex";
  }

  // Use GitHub's modern button styling
  const button = document.createElement("button");
  button.type = "button";
  // PR pages use a slightly different button class for PageHeader actions
  button.className = actionsList
    ? "Button--secondary Button--small Button"
    : "prc-Button-ButtonBase-9n-Xk Button--secondary Button--small Button";

  // Add some margin to separate from other buttons
  button.style.marginRight = "8px";

  button.innerHTML = `
    <span class="Button-content">
      <span class="Button-visual Button-leadingVisual">
        <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" class="octicon octicon-link">
          <path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"></path>
        </svg>
      </span>
      <span class="Button-label ecm-button-text">Copy URL</span>
    </span>
  `;

  button.addEventListener("click", async () => {
    const url = window.location.href;
    try {
      // Send message to background script to add to ECM history AND write to OS clipboard
      browserAPI.runtime.sendMessage({
        type: MessageType.CLIPBOARD_CAPTURED,
        payload: {
          type: ClipboardItemType.URL,
          content: url,
          metadata: {
            source: "GitHub",
            sourceUrl: url,
            hostname: window.location.hostname,
            writeToOSClipboard: true, // Background script handles the OS clipboard write
          },
        },
      });

      // Provide feedback
      const textSpan = button.querySelector(".ecm-button-text");
      const iconContainer = button.querySelector(".Button-leadingVisual");

      if (textSpan && iconContainer) {
        const originalText = textSpan.textContent;
        const originalIcon = iconContainer.innerHTML;

        textSpan.textContent = "Copied!";
        iconContainer.innerHTML = `
          <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" class="octicon octicon-check color-fg-success">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
          </svg>
        `;

        setTimeout(() => {
          textSpan.textContent = originalText;
          iconContainer.innerHTML = originalIcon;
        }, 2000);
      }
    } catch (err) {
      console.error("[ECM] Failed to copy URL:", err);
    }
  });

  container.appendChild(button);

  if (actionsList) {
    // Repository page: Insert at the beginning of the list
    actionsList.insertBefore(container, actionsList.firstChild);
  } else if (pageHeaderActions) {
    // Pull Request page: Insert at the beginning of the action bar
    pageHeaderActions.prepend(container);
  } else if (repositoryDetails) {
    // Fallback for newer header structures
    const target =
      repositoryDetails.querySelector("ul.pagehead-actions") ||
      repositoryDetails;
    target.prepend(container);
  }
}

// GitHub uses Turbo (formerly PJAX) for navigation, so we need to handle page changes
// that don't trigger a full page reload.
document.addEventListener("turbo:load", injectCopyButton);
document.addEventListener("pjax:end", injectCopyButton);

// MutationObserver as a catch-all for dynamic content loading
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      injectCopyButton();
      break;
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial injection
injectCopyButton();
