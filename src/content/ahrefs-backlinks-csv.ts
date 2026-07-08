import { browserAPI } from "@shared/utils/browser-api.util";
import { ClipboardItemType } from "@shared/enums/clipboard-item-type.enum";
import { MessageType } from "@shared/types/message.types";

/**
 * Injects a "Copy as CSV" button into the Ahrefs backlinks table action bar.
 * Matches styling from adjacent action buttons by cloning the Export button.
 */
function injectCopyCSVButton() {
  const allButtons = Array.from(document.querySelectorAll("button"));
  const exportButton = allButtons.find((btn) =>
    btn.innerText.includes("Export"),
  );

  if (!exportButton) {
    return;
  }

  if (document.getElementById("ecm-ahrefs-copy-csv")) {
    return;
  }

  // Find the button wrapper. If parent contains only this button, it is a single-button box wrapper.
  const parent = exportButton.parentElement;

  if (!parent) {
    return;
  }

  const exportButtonBox = parent.children.length === 1 ? parent : exportButton;
  const copyBox = exportButtonBox.cloneNode(true) as HTMLElement;
  copyBox.id = "ecm-ahrefs-copy-csv";

  const button = copyBox.querySelector("button");

  if (!button) {
    return;
  }

  // Find text node container inside cloned button and change text to "Copy as CSV"
  const textElement = Array.from(button.querySelectorAll("*")).find(
    (el) => el.textContent?.trim() === "Export",
  );

  if (textElement) {
    textElement.textContent = "Copy as CSV";
  }

  const svg = button.querySelector("svg");

  if (svg) {
    svg.innerHTML = `
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 3 7 8 15 8"></polyline>
    `;
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
  }

  button.addEventListener("click", async () => {
    const table = document.querySelector("table");

    if (!table) {
      return;
    }

    // Find the header row (contains th elements) to dynamically map columns
    const headerTr = table.querySelector("tr:has(th)");

    if (!headerTr) {
      return;
    }

    const headers = Array.from(headerTr.querySelectorAll("th"));

    // Map column names to their respective indexes to avoid hardcoded column indices
    const columnIndices = {
      referringPage: headers.findIndex((th) =>
        th.textContent?.toLowerCase().includes("referring page"),
      ),
      pageTypeCategory: headers.findIndex(
        (th) =>
          th.textContent?.toLowerCase().includes("page type") ||
          th.textContent?.toLowerCase().includes("category"),
      ),
      dr: headers.findIndex(
        (th) => th.textContent?.toLowerCase().trim() === "dr",
      ),
      ur: headers.findIndex(
        (th) => th.textContent?.toLowerCase().trim() === "ur",
      ),
      domainTraffic: headers.findIndex((th) =>
        th.textContent?.toLowerCase().includes("domain traffic"),
      ),
      referringDomains: headers.findIndex((th) =>
        th.textContent?.toLowerCase().includes("referring domains"),
      ),
      linkedDomains: headers.findIndex((th) =>
        th.textContent?.toLowerCase().includes("linked domains"),
      ),
      ext: headers.findIndex((th) =>
        th.textContent?.toLowerCase().trim().startsWith("ext"),
      ),
      pageTraffic: headers.findIndex((th) =>
        th.textContent?.toLowerCase().includes("page traffic"),
      ),
      kw: headers.findIndex((th) =>
        th.textContent?.toLowerCase().trim().startsWith("kw"),
      ),
      anchorTarget: headers.findIndex((th) =>
        th.textContent?.toLowerCase().includes("anchor"),
      ),
      seenDates: headers.findIndex((th) =>
        th.textContent?.toLowerCase().includes("seen"),
      ),
    };

    const rows = Array.from(table.querySelectorAll("tr"));

    // Get only the actual data rows containing td elements
    const dataRows = rows.filter((tr) => {
      const hasTh = tr.querySelector("th") !== null;
      const hasTd = tr.querySelector("td") !== null;

      return hasTd && !hasTh;
    });

    const csvRows: string[][] = [
      [
        "Referring Page Title",
        "Referring Page URL",
        "Page Type",
        "Category",
        "DR",
        "UR",
        "Domain Traffic",
        "Referring Domains",
        "Linked Domains",
        "External Links",
        "Page Traffic",
        "Keywords",
        "Anchor Text",
        "Link Attributes",
        "Target URL",
        "First Seen",
        "Last Seen",
      ],
    ];

    for (const tr of dataRows) {
      const cells = Array.from(tr.querySelectorAll("td"));

      // Filter out side gap cells (which are empty side spacing columns)
      let startIndex = 0;
      let endIndex = cells.length;

      if (
        cells[0] &&
        cells[0].children.length === 0 &&
        !cells[0].textContent?.trim()
      ) {
        startIndex = 1;
      }

      if (
        cells[cells.length - 1] &&
        cells[cells.length - 1].children.length === 0 &&
        !cells[cells.length - 1].textContent?.trim()
      ) {
        endIndex = cells.length - 1;
      }

      const dataCells = cells.slice(startIndex, endIndex);

      if (dataCells.length < 12) {
        continue;
      }

      const getCell = (index: number) => {
        return index !== -1 ? dataCells[index] : null;
      };

      // 1. Parse Referring Page
      const refPageCell = getCell(columnIndices.referringPage);
      let refPageTitle = "";
      let refPageUrl = "";

      if (refPageCell) {
        const titleLink = refPageCell.querySelector("a");
        refPageTitle = titleLink ? titleLink.textContent?.trim() || "" : "";
        refPageUrl = titleLink ? titleLink.getAttribute("href") || "" : "";
      }

      // 2. Parse Page Type & Category
      const typeCell = getCell(columnIndices.pageTypeCategory);
      const pageTypes: string[] = [];
      const categories: string[] = [];

      if (typeCell) {
        const wrapper = typeCell.firstElementChild;

        if (wrapper && wrapper.children.length >= 2) {
          const pageTypesContainer = wrapper.firstElementChild;
          const categoriesContainer = wrapper.lastElementChild;

          if (pageTypesContainer) {
            pageTypes.push(
              ...Array.from(pageTypesContainer.querySelectorAll("*"))
                .filter(
                  (el) => el.children.length === 0 && el.textContent?.trim(),
                )
                .map((el) => el.textContent!.trim())
                .filter((t) => t !== "…"),
            );
          }

          if (categoriesContainer) {
            categories.push(
              ...Array.from(categoriesContainer.querySelectorAll("*"))
                .filter(
                  (el) => el.children.length === 0 && el.textContent?.trim(),
                )
                .map((el) => el.textContent!.trim())
                .filter((t) => t !== "…"),
            );
          }
        } else {
          const allTexts = Array.from(typeCell.querySelectorAll("*"))
            .filter((el) => el.children.length === 0 && el.textContent?.trim())
            .map((el) => el.textContent!.trim())
            .filter((t) => t !== "…");
          pageTypes.push(...allTexts);
        }
      }

      // 3. Parse Metrics
      const dr = getCell(columnIndices.dr)?.textContent?.trim() || "";
      const ur = getCell(columnIndices.ur)?.textContent?.trim() || "";
      const domainTraffic =
        getCell(columnIndices.domainTraffic)?.textContent?.trim() || "";
      const refDomains =
        getCell(columnIndices.referringDomains)?.textContent?.trim() || "";
      const linkedDomains =
        getCell(columnIndices.linkedDomains)?.textContent?.trim() || "";
      const extLinks = getCell(columnIndices.ext)?.textContent?.trim() || "";
      const pageTraffic =
        getCell(columnIndices.pageTraffic)?.textContent?.trim() || "";
      const kw = getCell(columnIndices.kw)?.textContent?.trim() || "";

      // 4. Parse Anchor and Target URL
      const anchorCell = getCell(columnIndices.anchorTarget);
      let anchorText = "";
      let targetUrl = "";
      let attributes = "";

      if (anchorCell) {
        const anchorLinks = Array.from(anchorCell.querySelectorAll("a"));
        const anchorLink = anchorLinks[0];
        const targetLink = anchorLinks[anchorLinks.length - 1];
        anchorText = anchorLink ? anchorLink.textContent?.trim() || "" : "";
        targetUrl = targetLink ? targetLink.getAttribute("href") || "" : "";

        const badgeElements = Array.from(
          anchorCell.querySelectorAll("*"),
        ).filter((el) => {
          return (
            el.children.length === 0 &&
            el.textContent?.trim() &&
            el !== anchorLink &&
            el !== targetLink &&
            !anchorLink?.contains(el) &&
            !targetLink?.contains(el)
          );
        });
        attributes = badgeElements
          .map((el) => el.textContent!.trim())
          .filter((t) => t !== "…")
          .join(", ");
      }

      // 5. Parse First seen / Last seen
      const dateCell = getCell(columnIndices.seenDates);
      let firstSeen = "";
      let lastSeen = "";

      if (dateCell) {
        const dateLines =
          dateCell.textContent
            ?.split("\n")
            .map((s) => s.trim())
            .filter(Boolean) || [];
        firstSeen = dateLines[0] || "";
        lastSeen = dateLines[1] || "";
      }

      csvRows.push([
        refPageTitle,
        refPageUrl,
        pageTypes.join(", "),
        categories.join(", "),
        dr,
        ur,
        domainTraffic,
        refDomains,
        linkedDomains,
        extLinks,
        pageTraffic,
        kw,
        anchorText,
        attributes,
        targetUrl,
        firstSeen,
        lastSeen,
      ]);
    }

    const csvContent = csvRows
      .map((row) => {
        return row
          .map((val) => {
            const clean = val.replace(/"/g, '""');

            if (
              clean.includes(",") ||
              clean.includes("\n") ||
              clean.includes('"')
            ) {
              return `"${clean}"`;
            }

            return clean;
          })
          .join(",");
      })
      .join("\n");

    try {
      browserAPI.runtime.sendMessage({
        type: MessageType.CLIPBOARD_CAPTURED,
        payload: {
          type: ClipboardItemType.TEXT,
          content: csvContent,
          metadata: {
            source: "Ahrefs Backlinks",
            sourceUrl: window.location.href,
            hostname: window.location.hostname,
            writeToOSClipboard: true,
          },
        },
      });

      const originalText = textElement
        ? textElement.textContent
        : "Copy as CSV";
      const originalSvgContent = svg ? svg.innerHTML : "";

      if (textElement) {
        textElement.textContent = "Copied!";
      }

      if (svg) {
        svg.innerHTML = `
          <polyline points="20 6 9 17 4 12"></polyline>
        `;
        svg.setAttribute("viewBox", "0 0 24 24");
      }

      setTimeout(() => {
        if (textElement) {
          textElement.textContent = originalText;
        }

        if (svg) {
          svg.innerHTML = originalSvgContent;
          svg.setAttribute("viewBox", "0 0 24 24");
        }
      }, 2000);
    } catch (err) {
      console.error("[ECM] Failed to copy backlinks CSV:", err);
    }
  });

  exportButtonBox.parentElement?.insertBefore(copyBox, exportButtonBox);
}

let injectionTimeout: number | undefined = undefined;

const observer = new MutationObserver((mutations) => {
  if (injectionTimeout) {
    clearTimeout(injectionTimeout);
  }

  injectionTimeout = window.setTimeout(() => {
    injectCopyCSVButton();
  }, 250);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

injectCopyCSVButton();
