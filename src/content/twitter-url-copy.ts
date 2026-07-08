import { browserAPI } from "@shared/utils/browser-api.util";
import { ClipboardItemType } from "@shared/enums/clipboard-item-type.enum";
import { MessageType } from "@shared/types/message.types";

/**
 * Injects "Copy Profile URL" icon buttons into Twitter/X tweets.
 * Focuses on performance and native-like appearance.
 */
function injectTwitterCopyButtons() {
  // Only target tweets that haven't been processed yet
  const tweets = document.querySelectorAll(
    'article[data-testid="tweet"]:not([data-ecm-processed])',
  );

  tweets.forEach((tweet) => {
    tweet.setAttribute("data-ecm-processed", "true");

    // 1. Find the User-Name container which holds the display name and handle
    const userNameContainer = tweet.querySelector('[data-testid="User-Name"]');
    if (!userNameContainer) return;

    // 2. Find the handle link (e.g., /username)
    // On X, the handle is usually the second major block in the User-Name container
    const profileLink = userNameContainer.querySelector(
      'a[href^="/"]:not([href*="/status/"]):not([href="/home"])',
    );
    if (!profileLink) return;

    const handle = profileLink.getAttribute("href")?.replace("/", "") || "";
    if (
      !handle ||
      handle === "home" ||
      handle === "explore" ||
      handle === "notifications"
    )
      return;

    const profileUrl = `https://x.com/${handle}`;

    // 3. Find where to insert (after the handle link's container)
    // The handle is usually inside a div with css classes like r-1wbh5a2
    const handleWrapper = profileLink.closest("div");
    if (!handleWrapper) return;

    // Avoid duplicates in the same header
    if (userNameContainer.querySelector(".ecm-twitter-copy-url")) return;

    // 4. Create the icon button
    const button = document.createElement("button");
    button.className = "ecm-twitter-copy-url";
    button.title = "Copy Profile URL";
    button.setAttribute("aria-label", "Copy Profile URL");
    button.style.marginLeft = "4px";
    button.style.padding = "2px";
    button.style.border = "none";
    button.style.background = "transparent";
    button.style.cursor = "pointer";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.verticalAlign = "middle";
    button.style.borderRadius = "9999px";
    button.style.transition = "background-color 0.2s";

    // Hover effect
    button.onmouseenter = () => {
      button.style.backgroundColor = "rgba(231, 233, 234, 0.1)";
    };
    button.onmouseleave = () => {
      button.style.backgroundColor = "transparent";
    };

    const linkIcon = `
      <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 18px; height: 18px; fill: #1d9bf0;">
        <g>
          <path d="M18.36 5.64c-1.95-1.96-5.11-1.96-7.07 0L9.88 7.05 8.46 5.64l1.42-1.42c2.73-2.73 7.16-2.73 9.9 0 2.73 2.74 2.73 7.17 0 9.9l-1.42 1.42-1.41-1.41 1.41-1.42c1.96-1.96 1.96-5.12 0-7.07zm-2.12 3.53l-7.07 7.07-1.41-1.41 7.07-7.07 1.41 1.41zm-12.02.71l1.42-1.42 1.41 1.41-1.42 1.42c-1.96 1.96-1.96 5.12 0 7.07 1.95 1.96 5.11 1.96 7.07 0l1.41-1.41 1.42 1.42-1.42 1.42c-2.73 2.73-7.16 2.73-9.9 0-2.73-2.74-2.73-7.17 0-9.9z"></path>
        </g>
      </svg>
    `;

    const checkIcon = `
      <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 18px; height: 18px; fill: #00ba7c;">
        <g>
          <path d="M12 1.75C6.477 1.75 2 6.227 2 11.75s4.477 10 10 10 10-4.477 10-10-4.477-10-10-10zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm4.707-11.293l-6.707 6.707-2.707-2.707-1.414 1.414 4.121 4.121 8.121-8.121-1.414-1.414z"></path>
        </g>
      </svg>
    `;

    button.innerHTML = linkIcon;

    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      browserAPI.runtime.sendMessage({
        type: MessageType.CLIPBOARD_CAPTURED,
        payload: {
          type: ClipboardItemType.URL,
          content: profileUrl,
          metadata: {
            source: "Twitter/X",
            sourceUrl: window.location.href,
            profileUrl: profileUrl,
            hostname: window.location.hostname,
            writeToOSClipboard: true,
          },
        },
      });

      // Visual feedback: Show checkmark and change back after delay
      button.innerHTML = checkIcon;
      setTimeout(() => {
        button.innerHTML = linkIcon;
      }, 2000);
    };

    // 5. Insert after the handle
    handleWrapper.after(button);
  });
}

// Reuse the optimization logic from LinkedIn
let injectionTimeout: number | undefined = undefined;

const observer = new MutationObserver((mutations) => {
  if (injectionTimeout) {
    clearTimeout(injectionTimeout);
  }

  injectionTimeout = window.setTimeout(() => {
    injectTwitterCopyButtons();
  }, 300);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial run
injectTwitterCopyButtons();
