import { browserAPI } from "@shared/utils/browser-api.util";
import { ClipboardItemType } from "@shared/enums/clipboard-item-type.enum";
import { MessageType } from "@shared/types/message.types";

/**
 * Injects a "Copy URL" button into the LinkedIn profile sections.
 * Matches the styling of the native buttons (like "Message" or "More").
 */
function injectProfileCopyButton() {
  // Find all buttons/links that might be the "More" button
  const allButtons = Array.from(document.querySelectorAll("button, a"));
  const moreButtons = allButtons.filter((btn) => {
    const label = btn.getAttribute("aria-label");
    const text = (btn as HTMLElement).innerText?.trim();
    // Match "More" or "More actions" - specifically targeting the one in the profile header
    return (
      (label === "More" || label === "More actions" || text === "More") &&
      btn.closest('section, [role="main"]') !== null
    );
  });

  moreButtons.forEach((moreButton, index) => {
    const injectionId = `ecm-linkedin-profile-copy-v4-${index}`;
    if (document.getElementById(injectionId)) return;

    // Find the wrapper (usually a div with data-display-contents="true" or similar)
    const wrapper =
      moreButton.closest('div[data-display-contents="true"]') ||
      moreButton.parentElement;
    if (!wrapper || !wrapper.parentElement) return;

    const container = wrapper.parentElement;

    // Avoid duplicate injection in this specific container
    if (container.querySelector('[class*="ecm-button-text-container"]')) return;

    // Find a template button with text in the same container to clone its style
    // This ensures we match the "Message", "Connect", or "Follow" button styling perfectly
    const templateButton =
      Array.from(container.querySelectorAll("button, a")).find((el) => {
        const text = (el as HTMLElement).innerText?.trim();
        return text && text.length > 1 && text !== "More";
      }) || moreButton;

    const copyWrapper = document.createElement("div");
    copyWrapper.id = injectionId;
    copyWrapper.className = wrapper.className;
    if (wrapper.hasAttribute("data-display-contents")) {
      copyWrapper.setAttribute("data-display-contents", "true");
    }
    // Match spacing
    copyWrapper.style.marginRight = "8px";

    const button = document.createElement("button");
    button.type = "button";
    button.className = templateButton.className;

    // LinkedIn buttons have a nested span structure: button > span (wrapper) > [svg] + span (text)
    // We clone the first span of the template button to get the wrapper styling.
    const templateSpan = templateButton.querySelector("span");
    const innerWrapperSpan = document.createElement("span");
    if (templateSpan) {
      innerWrapperSpan.className = templateSpan.className;
    } else {
      innerWrapperSpan.className =
        "_373808c0 _51c7ca55 _4bd5abb6 _9f003781 _2165dc90 _25b8f4b9 d0b886d2 da05b7b0";
    }

    const textSpan = document.createElement("span");
    // Find text classes from template button's text span
    const templateText = templateButton.querySelector(
      'span span, .artdeco-button__text, [class*="text"]',
    );
    if (templateText) {
      textSpan.className = templateText.className;
    } else {
      textSpan.className =
        "_90d18b9b _5dca88c0 _813e4ddb _85e37415 _9142f207 fb6594a5 e793aff7 _610a159c";
    }

    textSpan.innerText = "Copy URL";
    textSpan.style.display = "inline-block";
    textSpan.style.whiteSpace = "nowrap"; // Prevent two-line wrap
    textSpan.style.fontSize = "1.6rem"; // Enforce readable size
    textSpan.style.fontWeight = "600"; // Enforce native bold weight
    textSpan.classList.add("ecm-button-text-container");

    innerWrapperSpan.appendChild(textSpan);
    button.appendChild(innerWrapperSpan);

    // Force styles to match native appearance
    button.style.width = "auto";
    button.style.minWidth = "fit-content";
    button.style.height = "32px"; // Standard LinkedIn button height
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.paddingLeft = "16px";
    button.style.paddingRight = "16px";
    button.style.cursor = "pointer";
    button.style.flexShrink = "0"; // Prevent being squashed

    button.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = window.location.href;
      try {
        browserAPI.runtime.sendMessage({
          type: MessageType.CLIPBOARD_CAPTURED,
          payload: {
            type: ClipboardItemType.URL,
            content: url,
            metadata: {
              source: "LinkedIn Profile",
              sourceUrl: url,
              hostname: window.location.hostname,
              writeToOSClipboard: true,
            },
          },
        });

        const originalText = textSpan.innerText;
        textSpan.innerText = "Copied!";
        setTimeout(() => {
          textSpan.innerText = originalText;
        }, 2000);
      } catch (err) {
        console.error("[ECM] Failed to copy LinkedIn URL:", err);
      }
    });

    copyWrapper.appendChild(button);
    // Insert at the end of the actions row
    container.appendChild(copyWrapper);
  });
}

function runInjections() {
  injectProfileCopyButton();
}

// Optimization: Debounce the injection calls to prevent lag during scrolling
let injectionTimeout: number | undefined = undefined;

const observer = new MutationObserver((mutations) => {
  if (injectionTimeout) {
    clearTimeout(injectionTimeout);
  }

  injectionTimeout = window.setTimeout(() => {
    runInjections();
  }, 250); // Small delay to batch multiple DOM changes
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial run
runInjections();
