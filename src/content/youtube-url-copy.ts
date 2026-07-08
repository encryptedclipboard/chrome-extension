import { browserAPI } from "@shared/utils/browser-api.util";
import { ClipboardItemType } from "@shared/enums/clipboard-item-type.enum";
import { MessageType } from "@shared/types/message.types";

/**
 * Injects a "Copy URL" button into the YouTube video details section.
 */
function injectYouTubeCopyButton() {
  // Target the top-level buttons container in the video metadata section
  const buttonsContainer = document.querySelector(
    "#top-level-buttons-computed.ytd-menu-renderer",
  );
  if (!buttonsContainer) return;

  const injectionId = "ecm-youtube-copy-url-v1";
  if (document.getElementById(injectionId)) return;

  // Find a template button (like Share or Like) to clone styles
  const templateButton = buttonsContainer.querySelector("button");
  if (!templateButton) return;

  // Create a structure that matches YouTube's button view model
  const viewModel = document.createElement("yt-button-view-model");
  viewModel.id = injectionId;
  viewModel.className = "style-scope ytd-menu-renderer";
  viewModel.style.marginRight = "8px"; // Add spacing

  const buttonViewModel = document.createElement("button-view-model");
  buttonViewModel.className =
    "ytSpecButtonViewModelHost style-scope ytd-menu-renderer";

  const button = document.createElement("button");
  button.className = templateButton.className;
  button.setAttribute("aria-label", "Copy Video URL");
  button.title = "Copy Video URL";
  button.style.overflow = "visible"; // Prevent cropping

  // Icon part
  const iconDiv = document.createElement("div");
  iconDiv.setAttribute("aria-hidden", "true");
  iconDiv.className = "ytSpecButtonShapeNextIcon";

  const iconWrapper = document.createElement("span");
  iconWrapper.className = "ytIconWrapperHost";
  iconWrapper.style.width = "24px";
  iconWrapper.style.height = "24px";

  const iconShape = document.createElement("span");
  iconShape.className = "yt-icon-shape ytSpecIconShapeHost";

  const svgContainer = document.createElement("div");
  svgContainer.style.width = "100%";
  svgContainer.style.height = "100%";
  svgContainer.style.display = "block";
  svgContainer.style.fill = "currentColor";

  // Link/Copy icon
  svgContainer.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;">
      <path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2m-3 5h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;

  iconShape.appendChild(svgContainer);
  iconWrapper.appendChild(iconShape);
  iconDiv.appendChild(iconWrapper);

  // Text part
  const textDiv = document.createElement("div");
  textDiv.className = "ytSpecButtonShapeNextButtonTextContent";
  textDiv.innerText = "Copy URL";
  textDiv.style.whiteSpace = "nowrap"; // Ensure text doesn't wrap

  button.appendChild(iconDiv);
  button.appendChild(textDiv);

  // Add touch feedback (YouTube specific)
  const feedback = document.createElement("yt-touch-feedback-shape");
  feedback.setAttribute("aria-hidden", "true");
  feedback.className =
    "ytSpecTouchFeedbackShapeHost ytSpecTouchFeedbackShapeTouchResponse";
  feedback.innerHTML = `
    <div class="ytSpecTouchFeedbackShapeStroke"></div>
    <div class="ytSpecTouchFeedbackShapeFill"></div>
  `;
  button.appendChild(feedback);

  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const url = window.location.href;
    browserAPI.runtime.sendMessage({
      type: MessageType.CLIPBOARD_CAPTURED,
      payload: {
        type: ClipboardItemType.URL,
        content: url,
        metadata: {
          source: "YouTube Video",
          sourceUrl: url,
          hostname: window.location.hostname,
          writeToOSClipboard: true,
        },
      },
    });

    // Feedback
    const originalText = textDiv.innerText;
    textDiv.innerText = "Copied!";
    setTimeout(() => {
      textDiv.innerText = originalText;
    }, 2000);
  });

  buttonViewModel.appendChild(button);
  viewModel.appendChild(buttonViewModel);

  // Prepend to the top-level buttons to put it at the beginning
  buttonsContainer.prepend(viewModel);
}

// YouTube is an SPA, so we need to observe changes
let injectionTimeout: number | undefined = undefined;

const observer = new MutationObserver(() => {
  if (injectionTimeout) clearTimeout(injectionTimeout);
  injectionTimeout = window.setTimeout(injectYouTubeCopyButton, 500);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial run
injectYouTubeCopyButton();
