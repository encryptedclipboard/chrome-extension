<script lang="ts">
  import {
    X,
    Minus,
    Plus,
    Maximize2,
    Minimize2,
    Upload,
    Sun,
    Moon,
  } from "lucide-svelte";
  import { ClipboardItemType } from "@shared/services/clipboard-db.service";
  import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
  import QuillEditor from "./QuillEditor.svelte";
  import { detectColor } from "../utils/detector.util";
  import { toast } from "svelte-sonner";
  import { authStore } from "../stores/auth.svelte";
  import { authModalStore } from "../stores/auth-modal.svelte";
  import { PlanAbility } from "@shared/enums";
  import "@/styles/components/edit-clipboard-modal.scss";

  export let show = false;
  export let onSave: (
    content: string,
    type: ClipboardItemType,
    richContent?: string,
  ) => void;
  export let onClose: () => void;

  let content: string = "";
  let richContent: string | undefined = undefined;
  let type: string = ClipboardItemType.TEXT;
  let error = "";
  let fontSize = 14;
  let isExpanded = false;
  let isDragging = false;
  let useRichEditor = false;
  let quillTheme: "light" | "dark" = "dark";
  let fileInput: HTMLInputElement;
  let modalRef: HTMLDivElement;

  const editableTypes = [
    ClipboardItemType.TEXT,
    ClipboardItemType.JSON,
    ClipboardItemType.MARKDOWN,
    ClipboardItemType.HTML,
    ClipboardItemType.ENV,
  ];

  $: if (show) {
    content = "";
    richContent = "";
    type = ClipboardItemType.TEXT;
    useRichEditor = false;
    error = "";
    isExpanded = false;
  }

  // Auto-toggle rich editor when type changes - Only allowed for TEXT
  $: if (type !== ClipboardItemType.TEXT) {
    useRichEditor = false;
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
    // Require authentication to add items
    if (authStore.isGuest) {
      authModalStore.open();
      return;
    }

    // Handle image type - save if content exists
    if (type === ClipboardItemType.IMAGE) {
      if (content) {
        onSave(content, type);
      }
      handleClose();
      return;
    }

    if (!content.trim()) {
      error = "Content is required";
      return;
    }

    try {
      if (type === ClipboardItemType.JSON && !useRichEditor) {
        JSON.parse(content);
      }

      let finalContent = content;
      let finalRichContent = richContent;
      const finalType = type as ClipboardItemType;

      // Extract plain text from rich content if needed
      if (useRichEditor && richContent) {
        const temp = document.createElement("div");
        temp.innerHTML = richContent;
        finalContent = temp.innerText || temp.textContent || "";
        finalRichContent = richContent;
      }

      onSave(finalContent, finalType, finalRichContent);
      handleClose();
    } catch (e) {
      error = "Invalid JSON format";
    }
  }

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
      case ClipboardItemType.ENV:
        return "DATABASE_URL=postgres://...\nAPI_KEY=your-key-here";
      default:
        return "Enter content...";
    }
  }

  $: detectedColor = detectColor(content);
  $: canExpand = editableTypes.includes(type as any);

  function getTypeLabel(t: string): string {
    const labels: Record<string, string> = {
      text: "Text",
      json: "JSON",
      url: "URL",
      email: "Email",
      phone: "Phone",
      otp: "OTP",
      ip: "IP Address",
      env: "Environment Variable",
      emoji: "Emoji",
      image: "Image",
      markdown: "Markdown",
      html: "HTML",
      ssh_key: "SSH Key",
    };
    return labels[t] || t.charAt(0).toUpperCase() + t.slice(1);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }

  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }

  function processFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      content = result;
      type = ClipboardItemType.IMAGE;
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
    };
    reader.readAsDataURL(file);
  }

  function triggerFileInput() {
    fileInput?.click();
  }

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

{#if show}
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
        <h2>Add New Item</h2>
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

        <!-- Type Selector -->
        <div class="controls-row">
          <select id="type-select" bind:value={type} class="type-select">
            {#each Object.values(ClipboardItemType).filter((t) => t !== ClipboardItemType.IMAGE || authStore.hasAbility(PlanAbility.IMAGE_SUPPORT)) as t}
              <option value={t}>{getTypeLabel(t)}</option>
            {/each}
          </select>
        </div>

        <!-- Editor Options Bar -->
        {#if type === "text"}
          <div class="editor-options-bar">
            <div class="options-left">
              <span class="options-label">Editor</span>
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

        {#if detectedColor && editableTypes.includes(type as any)}
          <div class="color-preview-banner">
            <div
              class="color-preview-dot large"
              style="background-color: {detectedColor}"
            ></div>
            <span class="color-value">{detectedColor}</span>
          </div>
        {/if}

        {#if type === ClipboardItemType.IMAGE}
          <div
            class="image-upload-zone"
            class:dragging={isDragging}
            on:dragover={handleDragOver}
            on:dragleave={handleDragLeave}
            on:drop={handleDrop}
            on:click={triggerFileInput}
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === "Enter" && triggerFileInput()}
          >
            <input
              bind:this={fileInput}
              type="file"
              accept="image/*"
              class="hidden"
              on:change={handleFileSelect}
            />
            {#if content}
              <img src={content} alt="Preview" class="image-preview" />
              <div class="image-overlay">
                <Upload class="w-6 h-6" />
                <span>Click or drop to replace</span>
              </div>
            {:else}
              <div class="upload-placeholder">
                <Upload class="w-10 h-10" />
                <p>Drag & drop an image here</p>
                <p class="text-sm">or click to browse</p>
              </div>
            {/if}
          </div>
        {:else if useRichEditor && type === "text"}
          <div class="rich-editor-container" class:flex-fill={isExpanded}>
            <QuillEditor
              bind:value={richContent}
              height={isExpanded ? "calc(100vh - 120px)" : "300px"}
              theme={quillTheme}
              ontextChange={handleRichTextChange}
            />
          </div>
        {:else if editableTypes.includes(type as any)}
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
        {:else}
          <div class="input-container">
            <input
              type={getInputType(type as any)}
              bind:value={content}
              class="input-field"
              placeholder={getPlaceholder(type as any)}
            />
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <div class="footer-spacer"></div>
        <div class="footer-buttons">
          <button class="btn btn-danger" on:click={handleClose}>Cancel</button>
          <button class="btn btn-primary" on:click={handleSave}>
            {type === ClipboardItemType.IMAGE && !content ? "Close" : "Save"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use "../styles/theme.scss" as *;

  .controls-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;

    .type-select {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid $border-dark;
      border-radius: 12px;
      corner-shape: squircle;
      background: $card-dark;
      color: white;
      font-size: 13px;
      cursor: pointer;
      outline: none;
      transition: all 0.2s;

      &:focus {
        border-color: $primary;
      }
    }
  }

  .icon-btn {
    background: transparent;
    border: none;
    color: $muted-foreground-dark;
    cursor: pointer;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    corner-shape: squircle;
    transition: all 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }

    &.theme-toggle {
      color: $primary;
      &:hover {
        background: rgba($primary, 0.15);
      }
    }
  }

  .editor-options-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: $card-dark;
    border: 1px solid $border-dark;
    border-radius: 12px;
    corner-shape: squircle;
    padding: 6px 12px;
    margin-bottom: 12px;

    .options-left,
    .options-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .options-label {
      font-size: 10px;
      font-weight: 700;
      color: $muted-foreground-dark;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .mode-toggle {
      display: flex;
      background: rgba(0, 0, 0, 0.2);
      padding: 3px;
      border-radius: 12px;
      corner-shape: squircle;
      border: 1px solid $border-dark;

      .toggle-btn {
        padding: 6px 16px;
        font-size: 12px;
        font-weight: 700;
        border: none;
        border-radius: 12px;
        corner-shape: squircle;
        background: transparent;
        color: $muted-foreground-dark;
        cursor: pointer;
        transition: all 0.2s;

        &.active {
          background: $primary !important;
          color: black !important;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
        }

        &:hover:not(.active) {
          color: white;
        }
      }
    }

    .control-divider {
      width: 1px;
      height: 14px;
      background: $border-dark;
    }
  }

  .font-size-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    corner-shape: squircle;
    padding: 2px;

    .font-size-value {
      font-size: 11px;
      min-width: 28px;
      text-align: center;
      color: $muted-foreground-dark;
    }
  }

  .image-upload-zone {
    border: 2px dashed $border-dark;
    border-radius: 12px;
    corner-shape: squircle;
    padding: 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover,
    &.dragging {
      border-color: $primary;
      background: rgba($primary, 0.05);
    }

    .hidden {
      display: none;
    }

    .image-preview {
      max-width: 100%;
      max-height: 200px;
      object-fit: contain;
      border-radius: 12px;
      corner-shape: squircle;
    }

    .image-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      opacity: 0;
      transition: opacity 0.2s ease;
      border-radius: 12px;
      corner-shape: squircle;
    }

    &:hover .image-overlay {
      opacity: 1;
    }

    .upload-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: $muted-foreground-dark;

      p {
        margin: 8px 0 0;
      }
    }
  }
</style>
