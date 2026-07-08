import { MessageType } from "@shared/types";

class SnippetListener {
  private isPaused = false;
  private isExpanding = false;

  private isGoogleDocs = false;
  private gdocsBuffer = "";
  private keywordKeys: string[] = [];
  private pendingKeyword: {
    type: "contentEditable" | "input" | "gdocs";
    target?: HTMLElement;
    fullMatch: string;
    keyword: string;
  } | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  private getSelection(target: HTMLElement): Selection | null {
    const rootNode = target.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      return (rootNode as any).getSelection() as Selection | null;
    }
    return window.getSelection();
  }

  private delay(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  private injectPageScript() {
    if (document.body?.dataset.__ECM_injected === "1") return;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("content/snippets-inject.js");
    if (this.isGoogleDocs) {
      script.setAttribute("data-is-google-docs", "true");
    }
    script.onload = () => {
      document.body!.dataset.__ECM_injected = "1";
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  private sendKey(target: HTMLElement, key: string) {
    const doc = target.ownerDocument;
    const win = doc.defaultView!;

    const isBackspace = key === "Backspace";
    const isSingleChar = key.length === 1;

    const keyProps: KeyboardEventInit = {
      key: isBackspace ? "Backspace" : key,
      code: isBackspace
        ? "Backspace"
        : isSingleChar
          ? `Key${key.toUpperCase()}`
          : key,
      keyCode: isBackspace ? 8 : isSingleChar ? key.charCodeAt(0) : 0,
      which: isBackspace ? 8 : isSingleChar ? key.charCodeAt(0) : 0,
      bubbles: true,
      cancelable: true,
      composed: true,
      isComposing: false,
      location: 0,
      repeat: false,
    };

    const keydown = new win.KeyboardEvent("keydown", keyProps);
    target.dispatchEvent(keydown);
    if (keydown.defaultPrevented) return;

    const selection = win.getSelection();
    const beforeInputProps: InputEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      isComposing: false,
    };

    if (isBackspace) {
      beforeInputProps.inputType = "deleteContentBackward";
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let { startContainer, startOffset } = range;
        const { endContainer, endOffset } = range;
        if (range.collapsed && startOffset > 0) startOffset--;
        try {
          (beforeInputProps as any).targetRanges = [
            new (win as any).StaticRange({
              startContainer,
              startOffset,
              endContainer,
              endOffset,
            }),
          ];
        } catch {}
      }
    } else if (isSingleChar) {
      beforeInputProps.inputType = "insertText";
      beforeInputProps.data = key;
    }

    const beforeinput = new win.InputEvent("beforeinput", beforeInputProps);
    target.dispatchEvent(beforeinput);
    if (beforeinput.defaultPrevented) return;

    if (isSingleChar) {
      const textInput = new win.InputEvent("textInput", {
        bubbles: true,
        cancelable: true,
        composed: true,
        data: key,
      });
      target.dispatchEvent(textInput);
    }

    const inputProps: InputEventInit = {
      bubbles: true,
      cancelable: false,
      composed: true,
      isComposing: false,
    };

    if (isBackspace) {
      inputProps.inputType = "deleteContentBackward";
      const input = new win.InputEvent("input", inputProps);
      target.dispatchEvent(input);
      doc.execCommand("delete");
    } else if (isSingleChar) {
      inputProps.inputType = "insertText";
      inputProps.data = key;
      const input = new win.InputEvent("input", inputProps);
      target.dispatchEvent(input);
    }

    const keyup = new win.KeyboardEvent("keyup", keyProps);
    target.dispatchEvent(keyup);
  }

  private async clearKeyword(target: HTMLElement, keywordStr: string) {
    for (let i = 0; i < keywordStr.length; i++) {
      this.sendKey(target, "Backspace");
      await this.delay(1);
    }
  }

  private async pasteSnippet(
    target: HTMLElement,
    plain: string,
    rich?: string,
  ) {
    try {
      await chrome.runtime.sendMessage({
        type: MessageType.SNIPPETS_WRITE_CLIPBOARD,
        payload: { text: plain, html: rich },
      });

      target.focus();

      document.body!.dataset.__ECM_execCommand = "1";
      document.body!.dataset.__ECM_pasteData = JSON.stringify({
        "text/plain": plain,
        ...(rich ? { "text/html": rich } : {}),
      });

      document.execCommand("paste", false);

      delete document.body!.dataset.__ECM_execCommand;
      delete document.body!.dataset.__ECM_pasteData;

      chrome.runtime
        .sendMessage({ type: MessageType.SNIPPETS_RESTORE_CLIPBOARD })
        .catch(() => {});
    } catch (e) {
      console.warn("[Snippets] paste snippet failed:", e);
      delete document.body!.dataset.__ECM_execCommand;
      delete document.body!.dataset.__ECM_pasteData;
    }
  }

  private async fetchAllKeys() {
    try {
      const res = await chrome.runtime.sendMessage({
        type: MessageType.SNIPPETS_GET_ALL_KEYS,
      });
      if (res?.payload) this.keywordKeys = res.payload;
    } catch {}
  }

  private hasLongerKeyword(prefix: string): boolean {
    return this.keywordKeys.some((k) => k !== prefix && k.startsWith(prefix));
  }

  private clearPending() {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.pendingKeyword = null;
  }

  private async firePending() {
    if (!this.pendingKeyword) return;
    const p = this.pendingKeyword;
    this.clearPending();

    if (p.type === "contentEditable") {
      const sel = this.getSelection(p.target!);
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      if (!r.collapsed) return;
      let text: string;
      if (r.startContainer.nodeType === Node.TEXT_NODE) {
        text = (r.startContainer.textContent || "").slice(0, r.startOffset);
      } else {
        const pre = document.createRange();
        pre.selectNodeContents(p.target!);
        pre.setEnd(r.startContainer, r.startOffset);
        text = pre.toString();
      }
      if (!new RegExp(`/${p.keyword}$`).test(text)) return;
    } else if (p.type === "input") {
      const input = p.target as HTMLInputElement | HTMLTextAreaElement;
      const text = input.value.slice(0, input.selectionStart || 0);
      if (!new RegExp(`/${p.keyword}$`).test(text)) return;
    } else if (p.type === "gdocs") {
      if (!new RegExp(`/${p.keyword}$`).test(this.gdocsBuffer)) return;
    }

    const result = await this.getSnippet(p.keyword);
    if (!result) return;

    this.isExpanding = true;
    try {
      if (p.type === "contentEditable") {
        await this.clearKeyword(p.target!, p.fullMatch);
        await this.delay(50);
        await this.pasteSnippet(p.target!, result.plain, result.rich);
      } else if (p.type === "input") {
        const input = p.target as HTMLInputElement | HTMLTextAreaElement;
        const cursor = input.selectionStart || 0;
        const value = input.value;
        const start = cursor - p.fullMatch.length;
        input.value = value.slice(0, start) + value.slice(cursor);
        input.selectionStart = input.selectionEnd = start;
        input.focus();
        (input.ownerDocument || document).execCommand(
          "insertText",
          false,
          result.plain,
        );
      } else if (p.type === "gdocs") {
        window.dispatchEvent(
          new CustomEvent("ecm-gdocs-delete", {
            detail: { count: p.fullMatch.length },
          }),
        );
        await this.delay(50);
        await chrome.runtime.sendMessage({
          type: MessageType.SNIPPETS_WRITE_CLIPBOARD,
          payload: { text: result.plain, html: result.rich },
        });
        window.dispatchEvent(new CustomEvent("ecm-gdocs-focus"));
        await this.delay(20);
        document.body!.dataset.__ECM_execCommand = "1";
        document.body!.dataset.__ECM_pasteData = JSON.stringify({
          "text/plain": result.plain,
          ...(result.rich ? { "text/html": result.rich } : {}),
        });
        document.execCommand("paste", false);
        delete document.body!.dataset.__ECM_execCommand;
        delete document.body!.dataset.__ECM_pasteData;
      }
    } finally {
      this.isExpanding = false;
    }
  }

  private scheduleSnippet(
    type: "contentEditable" | "input" | "gdocs",
    target: HTMLElement | undefined,
    fullMatch: string,
    keyword: string,
  ) {
    this.clearPending();
    this.pendingKeyword = { type, target, fullMatch, keyword };
    this.pendingTimer = setTimeout(() => this.firePending(), 1500);
  }

  private setupGdocsDetection() {
    if (!this.isGoogleDocs) return;

    window.addEventListener("ecm-gdocs-char", ((e: CustomEvent) => {
      if (this.isPaused || this.isExpanding) return;
      const c = e.detail.char;
      if (c === "__BS__") {
        this.gdocsBuffer = this.gdocsBuffer.slice(0, -1);
        return;
      }
      this.gdocsBuffer += c;
      const m = /\/([a-zA-Z0-9_\-]+)$/.exec(this.gdocsBuffer);
      if (!m) {
        this.clearPending();
        return;
      }
      if (this.hasLongerKeyword(m[1])) {
        this.scheduleSnippet("gdocs", undefined, m[0], m[1]);
        return;
      }
      this.gdocsBuffer = "";
      this.expandOnGdocs(m[0], m[1]);
    }) as EventListener);

    window.addEventListener(
      "mousedown",
      () => {
        this.gdocsBuffer = "";
      },
      true,
    );
  }

  private async expandOnGdocs(fullMatch: string, keyword: string) {
    const result = await this.getSnippet(keyword);
    if (!result) return;

    this.isExpanding = true;
    try {
      window.dispatchEvent(
        new CustomEvent("ecm-gdocs-delete", {
          detail: { count: fullMatch.length },
        }),
      );
      await this.delay(50);

      await chrome.runtime.sendMessage({
        type: MessageType.SNIPPETS_WRITE_CLIPBOARD,
        payload: { text: result.plain, html: result.rich },
      });

      window.dispatchEvent(new CustomEvent("ecm-gdocs-focus"));
      await this.delay(20);

      document.body!.dataset.__ECM_execCommand = "1";
      document.body!.dataset.__ECM_pasteData = JSON.stringify({
        "text/plain": result.plain,
        ...(result.rich ? { "text/html": result.rich } : {}),
      });
      document.execCommand("paste", false);
      delete document.body!.dataset.__ECM_execCommand;
      delete document.body!.dataset.__ECM_pasteData;

      chrome.runtime
        .sendMessage({ type: MessageType.SNIPPETS_RESTORE_CLIPBOARD })
        .catch(() => {});
    } catch (e) {
      console.warn("[Snippets] Google Docs expand failed:", e);
      delete document.body!.dataset.__ECM_execCommand;
      delete document.body!.dataset.__ECM_pasteData;
    } finally {
      this.isExpanding = false;
    }
  }

  init() {
    this.isGoogleDocs =
      location.hostname === "docs.google.com" &&
      location.pathname.startsWith("/document/");
    this.injectPageScript();
    this.setupGdocsDetection();
    this.fetchAllKeys();
    window.addEventListener("input", this.handleInput.bind(this), true);

    document.addEventListener("ecm-snippets-pause", () => {
      if (!this.isPaused) {
        this.isPaused = true;
      }
    });

    document.addEventListener("ecm-snippets-resume", () => {
      if (this.isPaused) {
        this.isPaused = false;
      }
    });
  }

  async handleInput(e: Event) {
    if (this.isPaused || this.isExpanding) return;

    try {
      const path = e.composedPath();
      const target = (path.find((el) => el instanceof HTMLElement) ||
        e.target) as HTMLElement;
      if (!target) return;

      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        await this.handleInputOrTextarea(
          target as HTMLInputElement | HTMLTextAreaElement,
        );
      } else if (target.isContentEditable) {
        await this.handleContentEditable(target);
      }
    } catch (err) {
      console.error("[Snippets] handleInput error:", err);
    }
  }

  async handleInputOrTextarea(target: HTMLInputElement | HTMLTextAreaElement) {
    const cursor = target.selectionStart || 0;
    const value = target.value;
    const textBeforeCursor = value.slice(0, cursor);
    const regex = /\/([a-zA-Z0-9_\-]+)$/;
    const match = regex.exec(textBeforeCursor);

    if (match) {
      const fullMatch = match[0];
      const shortcut = match[1];
      if (!shortcut) return;

      if (this.hasLongerKeyword(shortcut)) {
        this.scheduleSnippet("input", target, fullMatch, shortcut);
        return;
      }

      const result = await this.getSnippet(shortcut);

      const currentCursor = target.selectionStart || 0;
      if (currentCursor !== cursor) return;

      if (result) {
        const text = result.plain;
        this.isExpanding = true;
        try {
          const start = cursor - fullMatch.length;
          target.value = value.slice(0, start) + value.slice(cursor);
          target.selectionStart = target.selectionEnd = start;
          target.focus();
          const doc = target.ownerDocument || document;
          doc.execCommand("insertText", false, text);
        } finally {
          this.isExpanding = false;
        }
      }
    }
  }

  async handleContentEditable(target: HTMLElement) {
    const selection = this.getSelection(target);
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!range.collapsed) return;

    const node = range.startContainer;
    const isTextNode = node.nodeType === Node.TEXT_NODE;
    const cursorOffset = range.startOffset;

    let textBeforeCursor: string;
    if (isTextNode) {
      textBeforeCursor = (node.textContent || "").slice(0, cursorOffset);
    } else {
      const preRange = document.createRange();
      preRange.selectNodeContents(target);
      preRange.setEnd(node, cursorOffset);
      textBeforeCursor = preRange.toString();
    }

    const regex = /\/([a-zA-Z0-9_\-]+)$/;
    const match = regex.exec(textBeforeCursor);

    if (match) {
      const fullMatch = match[0];
      const shortcut = match[1];
      if (!shortcut) return;

      if (this.hasLongerKeyword(shortcut)) {
        this.scheduleSnippet("contentEditable", target, fullMatch, shortcut);
        return;
      }

      const result = await this.getSnippet(shortcut);

      const currentSelection = this.getSelection(target);
      if (!currentSelection || currentSelection.rangeCount === 0) return;
      const currentRange = currentSelection.getRangeAt(0);

      if (
        currentRange.startContainer !== node ||
        currentRange.startOffset !== cursorOffset
      )
        return;

      if (result) {
        const rich = result.rich;
        const plain = result.plain;
        this.isExpanding = true;
        try {
          await this.clearKeyword(target, fullMatch);
          await this.delay(50);
          await this.pasteSnippet(target, plain, rich);
          await this.delay(50);
        } catch (err) {
          console.error("[Snippets] handleContentEditable error:", err);
        } finally {
          this.isExpanding = false;
        }
      }
    }
  }

  async getSnippet(
    keyword: string,
  ): Promise<{ plain: string; rich?: string } | null> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.SNIPPETS_GET_SNIPPET,
        payload: { keyword },
      });

      if (response && response.success && response.payload) {
        const p = response.payload;
        return { plain: p.snippet, rich: p.richContent };
      }
    } catch (err) {
      console.error("[Snippets] Error getting snippet:", err);
    }
    return null;
  }
}

new SnippetListener().init();
