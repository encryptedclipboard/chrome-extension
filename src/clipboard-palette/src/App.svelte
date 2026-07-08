<script lang="ts">
  import { onMount, tick } from "svelte";
  import { clipboardService } from "./services/clipboard.service";
  import {
    saveSelection,
    restoreSelection,
    type SelectionState,
  } from "./services/selection.util";
  import { ClipboardItemType } from "@shared/enums";
  import { StorageService } from "@shared/services/extension-storage.service";
  import type { KeyboardShortcut } from "@shared/types/shortcut.types";
  import { formatTypeLabel, formatDate } from "@shared/utils/format.util";
  import {
    DEFAULT_CB_PALETTE_SHORTCUT,
    STORAGE_KEY_CB_PALETTE_SHORTCUT,
    isKeyboardShortcut,
  } from "@shared/types/shortcut.types";
  import Spinner from "./Spinner.svelte";

  // SSH key regex patterns
  const SSH_PRIVATE_KEY_REGEX =
    /-----BEGIN (?:OPENSSH|RSA|EC|DSA|ENCRYPTED)? ?PRIVATE KEY-----|-----BEGIN PUTTY PRIVATE KEY-----/i;
  const SSH_PUBLIC_KEY_REGEX =
    /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp\d+|ssh-dss)\s+[A-Za-z0-9+\/=]+/i;

  // Confidential detection patterns
  const CONFIDENTIAL_PATTERNS = {
    JWT: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
    AWS_KEY: /(?:AKIA|ASIA|AROA|AIDA)[A-Z0-9]{16}/,
    PRIVATE_KEY: SSH_PRIVATE_KEY_REGEX,
    SSH_PUBLIC_KEY: SSH_PUBLIC_KEY_REGEX,
    HEX_HASH: /\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b/,
    TOKEN_PREFIX:
      /\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{30,}|sq0p-[a-zA-Z0-9]{20,}|sq0i-[a-zA-Z0-9]{20,})\b/,
    KEY_VALUE:
      /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret|bearer)\s*[:=]\s*["']?[a-zA-Z0-9/+_\-.]{16,}["']?/i,
    PASSWORD_ASSIGN: /\b(?:password|passwd|pwd)\s*[:=]\s*["']?\S{6,}["']?/i,
    CREDIT_CARD: /\b(?:\d{4}[- ]){3}\d{4}\b/,
    SSN: /\b\d{3}-\d{2}-\d{4}\b/,
  };

  function isConfidential(text: string): boolean {
    if (!text || typeof text !== "string") return false;
    const trimmed = text.trim();
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount > 8) return false;
    for (const pattern of Object.values(CONFIDENTIAL_PATTERNS)) {
      if (pattern.test(trimmed)) return true;
    }
    // Additional heuristic: looks like password
    if (
      trimmed.length >= 8 &&
      trimmed.length <= 128 &&
      !trimmed.includes(" ") &&
      !/^https?:\/\//i.test(trimmed)
    ) {
      const hasLower = /[a-z]/.test(trimmed);
      const hasUpper = /[A-Z]/.test(trimmed);
      const hasDigit = /[0-9]/.test(trimmed);
      const hasSpecial = /[!@#$%^&*().\-_+=\[\]{};:'"<>?/\\|~`]/.test(trimmed);
      if (
        (hasSpecial && hasDigit && (hasLower || hasUpper)) ||
        (!hasSpecial && hasLower && hasUpper && hasDigit) ||
        (hasSpecial && (hasLower || hasUpper) && trimmed.length >= 10) ||
        (trimmed.length >= 24 && hasDigit && (hasLower || hasUpper))
      )
        return true;
    }
    return false;
  }

  const storageService = new StorageService();

  const { initiallyVisible = false } = $props<{ initiallyVisible?: boolean }>();

  let visible = $state(initiallyVisible);
  let items = $state<any[]>([]);
  let selectedIndex = $state(0);
  let searchQuery = $state("");
  let panelElement = $state<HTMLDivElement | undefined>();
  let position = $state({ x: 0, y: 0 });
  let isLoading = $state(false);
  let lastMousePosition = { x: 0, y: 0 };
  let isUpgradeRequired = $state(false);
  let isLoginRequired = $state(false);
  let currentShortcut = $state<KeyboardShortcut>(DEFAULT_CB_PALETTE_SHORTCUT);
  let previouslyFocusedElement: HTMLElement | null = null;
  let savedSelection: SelectionState | null = null;
  let smartBlurEnabled = $state(true);

  onMount(() => {
    // Load shortcut from storage
    loadShortcut();
    loadSettings();

    // Listen for shortcut changes
    const storageListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "local" && changes[STORAGE_KEY_CB_PALETTE_SHORTCUT]) {
        const newValue = changes[STORAGE_KEY_CB_PALETTE_SHORTCUT].newValue;
        if (isKeyboardShortcut(newValue)) {
          currentShortcut = newValue;
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    window.addEventListener("keydown", handleGlobalKeydown, {
      capture: true,
      passive: false,
    });
    window.addEventListener("mousedown", handleClickOutside, { capture: true });
    window.addEventListener("mousemove", trackMousePosition);

    if (initiallyVisible) {
      // Handle immediate opening for lazy load
      openPanel(true); // true = center mode since we missed mouse moves
    }

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
      window.removeEventListener("keydown", handleGlobalKeydown, {
        capture: true,
      });
      window.removeEventListener("mousedown", handleClickOutside, {
        capture: true,
      });
      window.removeEventListener("mousemove", trackMousePosition);
      clearTimeout(debounceTimer);
      // Resume snippets expander on destroy
      document.dispatchEvent(new CustomEvent("ecm-snippets-resume"));
    };
  });

  // Effect to handle pause/resume when visibility changes
  $effect(() => {
    if (visible) {
      document.dispatchEvent(new CustomEvent("ecm-snippets-pause"));
    } else {
      document.dispatchEvent(new CustomEvent("ecm-snippets-resume"));
    }
  });

  function trackMousePosition(e: MouseEvent) {
    lastMousePosition = { x: e.clientX, y: e.clientY };
  }

  async function loadShortcut() {
    try {
      const shortcut = await storageService.getCbPaletteShortcut();
      if (shortcut) {
        currentShortcut = shortcut;
      }
    } catch (error) {
      console.error("[Instant Clipboard] Failed to load shortcut:", error);
    }
  }

  async function loadSettings() {
    try {
      const settings = await storageService.getSettings();
      if (settings?.smartBlurConfidential !== undefined) {
        smartBlurEnabled = settings.smartBlurConfidential;
      }
    } catch (error) {
      console.error("[Instant Clipboard] Failed to load settings:", error);
    }
  }

  function isSshPrivateKey(content: string): boolean {
    return SSH_PRIVATE_KEY_REGEX.test(content);
  }

  function isSshPublicKey(content: string): boolean {
    return SSH_PUBLIC_KEY_REGEX.test(content);
  }

  function shouldBlurItem(item: any): boolean {
    const type = item.type;
    const content = item.content || "";

    // ENV items always blurred
    if (type === "env") return true;

    // SSH private keys always blurred
    if (type === "ssh_key" && isSshPrivateKey(content)) return true;

    // SSH public keys blurred only when smart blur is enabled
    if (type === "ssh_key" && isSshPublicKey(content) && smartBlurEnabled)
      return true;

    // Confidential text blurred only when smart blur is enabled
    if (type === "text" && isConfidential(content) && smartBlurEnabled)
      return true;

    return false;
  }

  function matchesShortcut(
    e: KeyboardEvent,
    shortcut: KeyboardShortcut,
  ): boolean {
    return (
      e.code === shortcut.key &&
      e.altKey === shortcut.altKey &&
      e.ctrlKey === shortcut.ctrlKey &&
      e.shiftKey === shortcut.shiftKey &&
      e.metaKey === shortcut.metaKey
    );
  }

  async function handleGlobalKeydown(e: KeyboardEvent) {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      // Context invalidated (e.g. extension reloaded/updated)
      // We should self-destruct our listeners to prevent zombie script behavior
      window.removeEventListener("keydown", handleGlobalKeydown, {
        capture: true,
      });
      window.removeEventListener("mousedown", handleClickOutside, {
        capture: true,
      });
      window.removeEventListener("mousemove", trackMousePosition);
      if (panelElement) panelElement.remove();
      // Do NOT remove the host here. If a new extension instance has loaded,
      // the host in the DOM belongs to the NEW instance.
      // The new instance's main.ts is responsible for cleaning up the OLD host during initialization.
      return;
    }

    if (matchesShortcut(e, currentShortcut)) {
      e.preventDefault();
      if (visible) {
        closePanel();
        return;
      }

      // Save the currently focused element before opening the panel
      previouslyFocusedElement = document.activeElement as HTMLElement;
      savedSelection = saveSelection(previouslyFocusedElement);

      openPanel();
    }

    if (visible && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (items.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % items.length;
          scrollToSelected();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + items.length) % items.length;
          scrollToSelected();
        }
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectItem(items[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePanel();
      }
    }
  }

  async function openPanel(forceCenter = false) {
    calculatePosition(forceCenter);

    visible = true;
    searchQuery = "";
    items = [];
    selectedIndex = 0;
    isLoading = true;
    isLoginRequired = false;
    isUpgradeRequired = false;

    try {
      const recent = await clipboardService.getRecentItems(20);
      items = Array.isArray(recent) ? recent : [];
    } catch (err) {
      console.error("Failed to fetch clipboard items", err);
    } finally {
      isLoading = false;
      await tick();
      focusInput();
    }
  }

  // ... (keep existing helper functions: calculatePosition, handleClickOutside) ...
  function calculatePosition(forceCenter = false) {
    const PANEL_WIDTH = 400;
    const PANEL_HEIGHT = 400;
    const MARGIN = 10;

    if (
      forceCenter ||
      (lastMousePosition.x === 0 && lastMousePosition.y === 0)
    ) {
      // Center on screen if no mouse data
      position = {
        x: (window.innerWidth - PANEL_WIDTH) / 2,
        y: (window.innerHeight - PANEL_HEIGHT) / 2,
      };
      return;
    }

    // Use last known mouse position as primary positioning method
    let x = lastMousePosition.x;
    let y = lastMousePosition.y + 10; // Offset below cursor

    // Check if there's enough space below cursor
    const spaceBelow = window.innerHeight - lastMousePosition.y;
    const spaceAbove = lastMousePosition.y;

    // If not enough space below but enough above, open above cursor
    if (
      spaceBelow < PANEL_HEIGHT + MARGIN &&
      spaceAbove > PANEL_HEIGHT + MARGIN
    ) {
      y = lastMousePosition.y - PANEL_HEIGHT - 10;
    }

    // Adjust horizontal position if needed
    if (x + PANEL_WIDTH > window.innerWidth - MARGIN) {
      x = window.innerWidth - PANEL_WIDTH - MARGIN;
    }
    if (x < MARGIN) {
      x = MARGIN;
    }

    // Adjust vertical position if still out of bounds
    if (y + PANEL_HEIGHT > window.innerHeight - MARGIN) {
      y = window.innerHeight - PANEL_HEIGHT - MARGIN;
    }
    if (y < MARGIN) {
      y = MARGIN;
    }

    position = { x, y };
  }

  function handleClickOutside(e: MouseEvent) {
    if (!visible) return;
    const path = e.composedPath();
    const host = document.getElementById("ecm-cb-palette-host");
    if (host && path.includes(host)) return;
    closePanel();
  }

  // ... (keep search/input handlers) ...
  async function handleSearch() {
    isLoading = true;
    try {
      if (!searchQuery.trim()) {
        const recent = await clipboardService.getRecentItems(20);
        items = Array.isArray(recent) ? recent : [];
      } else {
        const { typeFilter, searchKeyword } = parseSmartSearch(searchQuery);

        if (typeFilter === ClipboardItemType.IMAGE) {
          const images = await clipboardService.getImages(20);
          items = Array.isArray(images) ? images : [];
        } else {
          const results = await clipboardService.searchItems(
            searchKeyword,
            typeFilter,
            50,
            0,
          );
          items = Array.isArray(results) ? results : [];
        }
      }
      selectedIndex = 0;
    } catch (err) {
      console.error(err);
    } finally {
      isLoading = false;
    }
  }

  let debounceTimer: any;
  function onInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleSearch, 300);
  }

  function parseSmartSearch(query: string): {
    typeFilter: ClipboardItemType | null;
    searchKeyword: string;
  } {
    const trimmedQuery = query.trim();

    // Check if query starts with @
    if (!trimmedQuery.startsWith("@")) {
      return { typeFilter: null, searchKeyword: trimmedQuery };
    }

    // Find the first colon
    const colonIndex = trimmedQuery.indexOf(":");
    if (colonIndex === -1) {
      // No colon found, treat as regular search
      return { typeFilter: null, searchKeyword: trimmedQuery };
    }

    // Extract type and keyword
    const typeStr = trimmedQuery.substring(1, colonIndex).toLowerCase();
    const keyword = trimmedQuery.substring(colonIndex + 1).trim();

    // Map type string to ClipboardItemType enum
    const typeMap: Record<string, ClipboardItemType> = {
      text: ClipboardItemType.TEXT,
      json: ClipboardItemType.JSON,
      phone: ClipboardItemType.PHONE,
      ip: ClipboardItemType.IP,
      otp: ClipboardItemType.OTP,
      url: ClipboardItemType.URL,
      emoji: ClipboardItemType.EMOJI,
      image: ClipboardItemType.IMAGE,
      img: ClipboardItemType.IMAGE,
      email: ClipboardItemType.EMAIL,
    };

    const mappedType = typeMap[typeStr.toLowerCase()];

    // For images, we ignore the search keyword
    const finalKeyword = mappedType === ClipboardItemType.IMAGE ? "" : keyword;

    return {
      typeFilter: mappedType || null,
      searchKeyword: finalKeyword,
    };
  }

  async function selectItem(item: any) {
    if (!item) return;
    try {
      let content = item.content;

      if (item.type === "image" && (!content || content.length < 100)) {
        isLoading = true;
        try {
          const fullItem: any = await clipboardService.getItem(item.id);
          if (fullItem && fullItem.content) {
            content = fullItem.content;
          }
        } catch (e) {
          console.error("Failed to fetch full item", e);
          isLoading = false;
          return;
        }
        if (!content || content.length < 100) {
          isLoading = false;
          return;
        }
        isLoading = false;
      }

      if (item.type === "image" && (content || "").startsWith("data:")) {
        const res = await fetch(content);
        if (!res.ok) {
          console.error(
            "Failed to fetch image blob:",
            res.status,
            res.statusText,
          );
          isLoading = false;
          return;
        }
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
      } else if (item.richContent) {
        const htmlBlob = new Blob([item.richContent], { type: "text/html" });
        const plainBlob = new Blob([content || ""], { type: "text/plain" });

        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": htmlBlob,
            "text/plain": plainBlob,
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(content || "");
      }

      closePanel();
    } catch (err) {
      console.error("Failed to copy", err);
      isLoading = false;
    }
  }

  function closePanel() {
    visible = false;
    searchQuery = "";
    isUpgradeRequired = false;
    isLoginRequired = false;
    isLoading = false;

    if (
      previouslyFocusedElement &&
      previouslyFocusedElement.isConnected &&
      typeof previouslyFocusedElement.focus === "function"
    ) {
      try {
        previouslyFocusedElement.focus();

        if (savedSelection) {
          restoreSelection(previouslyFocusedElement, savedSelection);
        }
      } catch (err) {}
      previouslyFocusedElement = null;
      savedSelection = null;
    }
  }

  function scrollToSelected() {
    if (!panelElement) return;

    const selectedEl = panelElement.querySelector(
      `.item:nth-child(${selectedIndex + 1})`,
    );

    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }

  function focusInput() {
    // Blur the previously focused element to break any focus traps
    if (
      previouslyFocusedElement &&
      typeof previouslyFocusedElement.blur === "function"
    ) {
      try {
        previouslyFocusedElement.blur();
      } catch (e) {
        // Ignore errors
      }
    }

    // Focus panel first, then input
    panelElement?.focus({ preventScroll: true });

    setTimeout(() => {
      const input = panelElement?.querySelector<HTMLInputElement>(
        "#ecm-cb-palette-search-input",
      );
      if (input) {
        input.focus();
      }
    }, 50);
  }
</script>

{#if visible}
  <div
    class="floating-panel"
    bind:this={panelElement}
    style:top="{position.y}px"
    style:left="{position.x}px"
    role="dialog"
    tabindex="0"
    onclick={(e) => e.stopPropagation()}
  >
    {#if isUpgradeRequired}
      <div class="upgrade-state">
        <div class="icon-wrapper">
          <!-- Crown or Lock icon -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lock-icon"
            ><rect x="3" y="11" width="18" height="11" rx="2" ry="2"
            ></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg
          >
        </div>
        <h3>Premium Feature</h3>
        <p>
          Upgrade to any paid plan to access your clipboard instantly with
          Alt+V.
        </p>
        <button
          class="upgrade-btn"
          onclick={() => {
            // Open settings or upgrade page
            window.open("https://encryptedclipboard.app/pricing", "_blank");
            closePanel();
          }}>Upgrade Now</button
        >
      </div>
    {:else if isLoginRequired}
      <div class="upgrade-state">
        <div class="icon-wrapper">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lock-icon"
            ><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle
              cx="8.5"
              cy="7"
              r="4"
            ></circle><line x1="20" y1="8" x2="20" y2="14"></line><line
              x1="23"
              y1="11"
              x2="17"
              y2="11"
            ></line></svg
          >
        </div>
        <h3>Create account to unlock all features</h3>
        <p>Sign in or create an account to use the Floating Window.</p>
        <button
          class="upgrade-btn"
          onclick={() => {
            window.open(
              "https://encryptedclipboard.app/auth?mode=signup",
              "_blank",
            );
            closePanel();
          }}>Sign Up Free</button
        >
      </div>
    {:else}
      <div class="search-bar">
        <input
          id="ecm-cb-palette-search-input"
          type="text"
          placeholder="Search clipboard..."
          maxlength="500"
          bind:value={searchQuery}
          oninput={onInput}
          onclick={() => focusInput()}
        />
        {#if isLoading}
          <Spinner size={14} />
        {/if}
      </div>
      <div class="search-hint">
        Tip: Type <code>@img:</code>,
        <code>@url:</code>, or
        <code>@json:</code> to filter specific types.
      </div>

      {#if searchQuery.startsWith("@img") || searchQuery.startsWith("@image")}
        <div class="search-hint secondary">
          Showing only the last 20 images for performance.
        </div>
      {/if}

      <div class="item-list">
        {#if items.length === 0}
          <div class="empty-state">
            {#if searchQuery.trim()}
              No items found for keyword '{searchQuery.trim()}'
            {:else}
              No items found
            {/if}
          </div>
        {:else}
          {#each items as item, i (item.id)}
            <div
              class="item"
              class:selected={i === selectedIndex}
              role="button"
              tabindex="0"
              onclick={() => selectItem(item)}
              onkeydown={(e) => e.key === "Enter" && selectItem(item)}
            >
              <div class="item-content">
                {#if item.thumbnail}
                  <img src={item.thumbnail} alt="" class="thumbnail" />
                {:else if item.type === "color"}
                  <div
                    class="color-preview"
                    style:background-color={item.content}
                  ></div>
                {/if}

                <span
                  class="text-preview"
                  class:blurred={shouldBlurItem(item) && i !== selectedIndex}
                >
                  {#if item.type === "image" || (item.content && item.content.startsWith("data:image"))}
                    Image
                  {:else if item.type === "env" || item.type === "ssh_key"}
                    {formatTypeLabel(item.type)}
                  {:else}
                    {item.content?.substring(0, 50) || "Content"}
                  {/if}
                </span>
              </div>
              <div class="item-meta">
                <span class="date"
                  >{formatDate(item.createdAt, "relative")}</span
                >
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  @use "./styles/app" as *;
</style>
