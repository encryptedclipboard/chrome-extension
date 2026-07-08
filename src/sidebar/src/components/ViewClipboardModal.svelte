<script lang="ts">
  import {
    X,
    Image as ImageIcon,
    Maximize2,
    Minimize2,
    Copy,
    Check,
  } from "lucide-svelte";
  import type { ClipboardItem } from "@shared/services/clipboard-db.service";
  import { ClipboardItemType } from "@shared/services/clipboard-db.service";
  import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
  import { formatTypeLabel } from "@shared/utils/format.util";
  import { sanitizeHtml } from "@shared/utils/html-sanitizer.util";
  import { toast } from "svelte-sonner";
  import "@/styles/components/view-clipboard-modal.scss";

  export let show = false;
  export let item: ClipboardItem | null = null;
  export let onClose: () => void;

  let content: string = "";
  let richContent: string | undefined = "";
  let type: ClipboardItemType = ClipboardItemType.TEXT;
  let modalRef: HTMLDivElement;
  let isExpanded = false;
  let copied = false;

  // Types that can be expanded (larger content types)
  const expandableTypes = [
    ClipboardItemType.TEXT,
    ClipboardItemType.HTML,
    ClipboardItemType.MARKDOWN,
    ClipboardItemType.JSON,
    ClipboardItemType.ENV,
  ];

  // Reactive state management
  $: if (item && show) {
    content = typeof item.content === "string" ? item.content : "";
    richContent = item.richContent;
    type = item.type;
    isExpanded = false;
    copied = false;
  }

  $: canExpand = expandableTypes.includes(type);

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

  async function handleCopy() {
    // Copy rich content if available, otherwise copy plain content
    const textToCopy = richContent || content;
    try {
      await navigator.clipboard.writeText(textToCopy);
      copied = true;
      toast.success("Copied to clipboard");
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
  }

  async function handleCopyAndClose() {
    await handleCopy();
    handleClose();
  }

  $: displayContent = richContent ? sanitizeHtml(richContent) : content;

  $: hasRichContent = !!richContent && richContent.length > 0;

  // Calculate editor height based on expanded state
  $: editorHeight = isExpanded ? "calc(100vh - 150px)" : "300px";
</script>

{#if show && item}
  <div class="modal-overlay view-clipboard-modal-wrapper">
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
          View {type === ClipboardItemType.IMAGE
            ? "Image"
            : formatTypeLabel(type)}
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
        {#if type === ClipboardItemType.JSON}
          <CodeMirrorEditor
            bind:value={content}
            lang="json"
            height={editorHeight}
            readonly={true}
          />
        {:else if type === ClipboardItemType.MARKDOWN}
          <CodeMirrorEditor
            bind:value={content}
            lang="markdown"
            height={editorHeight}
            readonly={true}
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
          </div>
        {:else}
          <div class="text-content" class:has-rich-content={hasRichContent}>
            {#if richContent}
              <div class="rich-text-display">
                {@html sanitizeHtml(richContent)}
              </div>
            {:else}
              <textarea
                value={content}
                readonly
                class="text-editor"
                style="cursor: default; height: {editorHeight};"></textarea>
            {/if}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={handleCopy}>
          {#if copied}
            <Check size={14} />
            Copied
          {:else}
            <Copy size={14} />
            Copy
          {/if}
        </button>
        <button class="btn btn-secondary" on:click={handleCopyAndClose}>
          <Copy size={14} />
          Copy & Close
        </button>
        <button class="btn btn-primary" on:click={handleClose}> Close </button>
      </div>
    </div>
  </div>
{/if}
