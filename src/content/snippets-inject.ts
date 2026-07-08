(function () {
  if ((window as any).__ECM_injected) return;
  (window as any).__ECM_injected = true;

  document.addEventListener(
    "paste",
    function (e: ClipboardEvent) {
      if (document.body?.dataset.__ECM_execCommand !== "1") return;

      const cd = e.clipboardData;
      if (!cd) return;

      const raw = document.body!.dataset.__ECM_pasteData;
      if (!raw) return;

      let data: Record<string, string>;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      (cd as any).__ECM_overridden = true;
      const dataTypes = Object.keys(data);
      const origGetData = cd.getData.bind(cd);

      cd.getData = function (format: string): string {
        if ((cd as any).__ECM_overridden) {
          const f = format.toLowerCase();
          if (f === "text") return data["text/plain"] || "";
          if (f in data) return data[f];
        }
        return origGetData(format);
      };

      Object.defineProperty(cd, "types", {
        get: () => dataTypes.slice(),
      });

      const origItems = cd.items;
      Object.defineProperty(cd, "items", {
        get: () => origItems,
      });
    },
    true,
  );

  if (document.currentScript?.getAttribute("data-is-google-docs") === "true") {
    const EVENT_NAME = "tb-get-docs-content";
    let docsText: any = null;

    try {
      (window as any)._docs_annotate_getAnnotatedText?.()?.then((t: any) => {
        docsText = t;
      });
    } catch {}

    function handleDocsRequest(e: Event) {
      const detail = (e as any).detail;
      if (!detail?.type) return;

      let result: any;

      if (detail.type === "get-text") {
        if (!docsText) {
          result = null;
        } else {
          const text = docsText.getText();
          const etx = "\u0003";
          const first = text.indexOf(etx);
          const last = text.indexOf(etx, first + 1);
          const start = first + 1;
          const end = last !== -1 ? last : text.length;
          result = text.substring(start, end);
        }
      } else if (detail.type === "get-selection") {
        if (!docsText) {
          result = { start: 0, end: 0 };
        } else {
          const sel = docsText.getSelection()?.[0];
          if (!sel) {
            result = { start: 0, end: 0 };
          } else {
            const text = docsText.getText();
            let delimiterCount = 0;
            for (
              let i = 0;
              i < text.length && i < sel.start && delimiterCount < 2;
              i++
            ) {
              if (text[i] === "\u0003") delimiterCount++;
            }
            result = {
              start: sel.start - delimiterCount,
              end: sel.end - delimiterCount,
            };
          }
        }
      }

      window.dispatchEvent(
        new CustomEvent(`${EVENT_NAME}res`, { detail: result || {} }),
      );
    }

    window.addEventListener(EVENT_NAME, handleDocsRequest);

    const gdocsIframe = document.querySelector(
      "iframe.docs-texteventtarget-iframe",
    );
    if (gdocsIframe) {
      (function waitForBody() {
        const doc = (gdocsIframe as HTMLIFrameElement).contentDocument;
        if (!doc?.body) {
          setTimeout(waitForBody, 200);
          return;
        }

        doc.addEventListener(
          "beforeinput",
          function (e: InputEvent) {
            if (e.inputType === "insertText" && e.data) {
              window.dispatchEvent(
                new CustomEvent("ecm-gdocs-char", {
                  detail: { char: e.data },
                }),
              );
            } else if (e.inputType === "deleteContentBackward") {
              window.dispatchEvent(
                new CustomEvent("ecm-gdocs-char", {
                  detail: { char: "__BS__" },
                }),
              );
            }
          },
          true,
        );

        window.addEventListener("ecm-gdocs-delete", function (e: Event) {
          const count = (e as CustomEvent).detail?.count || 1;
          const body = doc.body;
          if (!body) return;
          body.focus();
          for (let i = 0; i < count; i++) {
            try {
              doc.execCommand("delete");
            } catch {}
          }
        });

        window.addEventListener("ecm-gdocs-focus", function () {
          const body = doc.body;
          if (body) body.focus();
        });
      })();
    }
  }
})();
