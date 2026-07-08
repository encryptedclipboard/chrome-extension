<script lang="ts">
  import {
    X,
    Image as ImageIcon,
    AlertCircle,
    Minus,
    Plus,
    Maximize2,
    Minimize2,
    Copy,
    Sun,
    Moon,
  } from "lucide-svelte";
  import type { ClipboardItem } from "@shared/services/clipboard-db.service";
  import { ClipboardItemType } from "@shared/services/clipboard-db.service";
  import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
  import QuillEditor from "./QuillEditor.svelte";
  import { detectColor } from "../utils/detector.util";
  import { formatTypeLabel } from "@shared/utils/format.util";
  import "@/styles/components/edit-clipboard-modal.scss";

  export let show = false;
  export let item: ClipboardItem | null = null;
  export let onSave: (
    id: string,
    newContent: string,
    newRichContent?: string,
  ) => void;
  export let onClose: () => void;

  let content: string = "";
  let richContent: string | undefined = undefined;
  let type: ClipboardItemType = ClipboardItemType.TEXT;
  let error = "";
  let fontSize = 14;
  let isExpanded = false;
  let useRichEditor = false;
  let hasRichContent = false;
  let quillTheme: "light" | "dark" = "dark";

  let modalRef: HTMLDivElement;
  let lastItemId: string | null = null;
  $: if (!show) lastItemId = null;

  // Reactive state management
  $: if (item && show && item.id !== lastItemId) {
    lastItemId = item.id;
    content = typeof item.content === "string" ? item.content : "";
    richContent = item.richContent;
    type = item.type;
    hasRichContent = !!item.richContent;
    useRichEditor = !!item.richContent;
    error = "";
    isExpanded = false;
  }

  function handleClose() {
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      handleClose();
      return;
    }
    if (e.key === "Tab" && modalRef) {
      const focusable = modalRef.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  async function handleSave() {
    if (!item) return;
    if (type === ClipboardItemType.IMAGE) {
      handleClose();
      return;
    }

    try {
      if (type === ClipboardItemType.JSON && !useRichEditor) {
        // Validate JSON
        JSON.parse(content);
      }

      let finalContent = content;
      let finalRichContent = richContent;

      // If we are using the rich editor, the richContent is bound to the editor.
      // We should extract the plain text version from the HTML if possible.
      if (useRichEditor && richContent) {
        // Create a temporary element to extract innerText
        const temp = document.createElement("div");
        temp.innerHTML = richContent;
        finalContent = temp.innerText || temp.textContent || "";
        finalRichContent = richContent;
      } else {
        finalRichContent = undefined;
      }

      onSave(item.id, finalContent, finalRichContent);
      onClose();
    } catch (e) {
      error = "Invalid JSON format";
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  // Determine input field attributes based on type
  function getInputType(itemType: ClipboardItemType): string {
    switch (itemType) {
      case ClipboardItemType.URL:
        return "url";
      case ClipboardItemType.EMAIL:
        return "email";
      case ClipboardItemType.PHONE:
        return "tel";
      case ClipboardItemType.OTP:
      case ClipboardItemType.IP:
        return "text";
      default:
        return "text";
    }
  }

  function getPlaceholder(itemType: ClipboardItemType): string {
    switch (itemType) {
      case ClipboardItemType.URL:
        return "https://example.com";
      case ClipboardItemType.EMAIL:
        return "user@example.com";
      case ClipboardItemType.PHONE:
        return "+1234567890";
      case ClipboardItemType.OTP:
        return "123456";
      case ClipboardItemType.IP:
        return "192.168.1.1";
      default:
        return "Enter content...";
    }
  }

  // Color preview handled by utility function call in reactive statement below

  $: detectedColor = detectColor(content);
  $: canExpand =
    type !== ClipboardItemType.URL &&
    type !== ClipboardItemType.OTP &&
    type !== ClipboardItemType.EMAIL &&
    type !== ClipboardItemType.EMOJI;

  function handleRichTextChange(detail: { html: string; text: string }) {
    content = detail.text;
    richContent = detail.html;
  }

  const togglePlainMode = () => {
    useRichEditor = false;
    richContent = "";
  };

  const toggleRichMode = () => {
    useRichEditor = true;
    if (content && !richContent) {
      richContent = content;
    }
  };
</script>

{#if show && item}
  <div class="modal-overlay edit-clipboard-modal-wrapper">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal-content"
      class:expanded={isExpanded}
      bind:this={modalRef}
      on:click|stopPropagation
      on:keydown={handleKeydown}
    >
      <div class="modal-header">
        <h2>
          {#if type === ClipboardItemType.IMAGE}
            View Image
          {:else}
            Edit {formatTypeLabel(type)}
          {/if}
        </h2>
        <div class="header-right">
          {#if canExpand}
            <button
              class="icon-btn"
              on:click={() => (isExpanded = !isExpanded)}
              title={isExpanded ? "Minimize" : "Maximize"}
            >
              {#if isExpanded}
                <Minimize2 size={14} />
              {:else}
                <Maximize2 size={14} />
              {/if}
            </button>
          {/if}
          <button class="close-btn" on:click={handleClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div class="modal-body">
        {#if error}
          <div class="error-message">{error}</div>
        {/if}

        {#if detectedColor}
          <div class="color-preview-banner">
            <div
              class="color-preview-dot large"
              style="background-color: {detectedColor}"
            ></div>
            <span class="color-value">{detectedColor}</span>
          </div>
        {/if}

        <!-- Editor Options Bar -->
        {#if type === ClipboardItemType.TEXT || type === ClipboardItemType.JSON || type === ClipboardItemType.MARKDOWN || type === ClipboardItemType.HTML || type === ClipboardItemType.ENV}
          <div class="editor-options-bar">
            <div class="options-left">
              <span class="options-label">Editor</span>
              {#if type === ClipboardItemType.TEXT && hasRichContent}
                <div class="mode-toggle">
                  <button
                    class="toggle-btn"
                    class:active={!useRichEditor}
                    on:click={togglePlainMode}
                  >
                    Plain
                  </button>
                  <button
                    class="toggle-btn"
                    class:active={useRichEditor}
                    on:click={toggleRichMode}
                  >
                    Rich
                  </button>
                </div>
              {/if}
            </div>
            <div class="options-right">
              {#if !useRichEditor}
                <div class="font-size-controls">
                  <button
                    class="icon-btn"
                    on:click={() => (fontSize = Math.max(10, fontSize - 1))}
                  >
                    <Minus size={14} />
                  </button>
                  <span class="font-size-value">{fontSize}px</span>
                  <button
                    class="icon-btn"
                    on:click={() => (fontSize = Math.min(30, fontSize + 1))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              {/if}

              {#if useRichEditor}
                <button
                  class="icon-btn theme-toggle"
                  on:click={() =>
                    (quillTheme = quillTheme === "light" ? "dark" : "light")}
                  title="Toggle editor theme"
                >
                  {#if quillTheme === "light"}
                    <Moon size={14} />
                  {:else}
                    <Sun size={14} />
                  {/if}
                </button>
              {/if}
            </div>
          </div>
        {/if}

        {#if useRichEditor}
          <div class="rich-editor-container" class:flex-fill={isExpanded}>
            <QuillEditor
              bind:value={richContent}
              height={isExpanded ? "calc(100vh - 120px)" : "300px"}
              theme={quillTheme}
              ontextChange={handleRichTextChange}
            />
          </div>
        {:else if type === ClipboardItemType.JSON || type === ClipboardItemType.MARKDOWN || type === ClipboardItemType.HTML || type === ClipboardItemType.TEXT || type === ClipboardItemType.ENV}
          <CodeMirrorEditor
            bind:value={content}
            lang={type === ClipboardItemType.JSON
              ? "json"
              : type === ClipboardItemType.MARKDOWN
                ? "markdown"
                : type === ClipboardItemType.HTML
                  ? "html"
                  : type === ClipboardItemType.ENV
                    ? "bash"
                    : "text"}
            height={isExpanded ? "calc(100vh - 120px)" : "300px"}
            {fontSize}
          />
        {:else if type === ClipboardItemType.IMAGE}
          <div class="image-preview-container">
            {#if content.startsWith("data:image")}
              <img src={content} alt="Preview" class="image-preview" />
            {:else}
              <div class="no-preview">
                <ImageIcon class="w-12 h-12 mb-2 opacity-50" />
                <p>Preview not available</p>
              </div>
            {/if}
            <div class="info-banner">
              <AlertCircle size={14} />
              <span>Image editing is not supported in the extension.</span>
            </div>
          </div>
        {:else}
          <!-- Generic Input for URL, Email, Phone, OTP, IP -->
          <div class="input-container">
            <input
              type={getInputType(type)}
              bind:value={content}
              class="input-field"
              placeholder={getPlaceholder(type)}
            />
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <div class="footer-spacer"></div>
        <div class="footer-buttons">
          {#if type === ClipboardItemType.IMAGE}
            <button class="btn btn-secondary" on:click={handleCopy}>
              <Copy size={14} />
              Copy
            </button>
            <button class="btn btn-danger" on:click={handleClose}>Close</button>
          {:else}
            <button class="btn btn-secondary" on:click={handleCopy}>
              <Copy size={14} />
              Copy
            </button>
            <button class="btn btn-danger" on:click={handleClose}>Cancel</button
            >
            <button class="btn btn-primary" on:click={handleSave}>Save</button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use "../styles/theme" as *;
  @use "../styles/components/edit-clipboard-modal" as *;
</style>
