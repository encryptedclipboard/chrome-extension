<script lang="ts">
  import type { ClipboardItem as DbClipboardItem } from "@shared/services/clipboard-db.service";
  import { ClipboardItemType } from "@shared/services/clipboard-db.service";
  import { clipboardDBService } from "@shared/services";
  import {
    Star,
    Copy,
    PencilLine,
    Trash2,
    CircleAlert,
    LoaderCircle,
    CloudUpload,
    CloudOff,
    Eye,
    Download,
    Share2,
    FileText,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import Checkbox from "./Checkbox.svelte";
  import LinkifiedText from "./LinkifiedText.svelte";
  import {
    isConfidential,
    detectColor,
    SSH_PRIVATE_KEY_REGEX,
    SSH_PUBLIC_KEY_REGEX,
  } from "../utils/detector.util";
  import { formatTypeLabel } from "@shared/utils/format.util";
  import { teleport } from "../utils/teleport";
  import Spinner from "./Spinner.svelte";
  import "@/styles/components/clipboard-item.scss";

  interface Props {
    item: DbClipboardItem;
    selected?: boolean;
    showSyncStatus?: boolean;
    smartBlurEnabled?: boolean;
    onCopy?: (id: string) => void;
    onDelete?: (id: string) => void;
    onToggleFavorite?: (id: string) => void;
    onEdit?: (id: string) => void;
    onView?: (id: string) => void;
    onShare?: (id: string) => void;
    onSelect?: (data: { id: string; selected: boolean }) => void;
    onSync?: (data: { item: DbClipboardItem }) => void;
    onLongPress?: (id: string) => void;
    isSelectionMode?: boolean;
    isSyncing?: boolean;
    mpcInProgress?: boolean;
    smartBlurImagesEnabled?: boolean;
  }

  const {
    item,
    selected = false,
    showSyncStatus = true,
    smartBlurEnabled = true,
    onCopy,
    onDelete,
    onToggleFavorite,
    onEdit,
    onView,
    onShare,
    onSelect,
    onSync,
    onLongPress,
    isSelectionMode = false,
    isSyncing = false,
    mpcInProgress = false,
    smartBlurImagesEnabled = false,
  }: Props = $props();

  // Copy debounce
  let lastCopyTime = 0;
  const COPY_DEBOUNCE_MS = 500;
  let copyButtonElement: HTMLButtonElement;
  // Handle sync badge click
  function handleSyncClick() {
    console.log("[sync] handleSyncClick called", {
      syncBadge,
      displayedSyncBadge,
    });
    if (!displayedSyncBadge) {
      console.log("[sync] no displayedSyncBadge");
      return;
    }
    if (displayedSyncBadge.disabled) {
      console.log("[sync] disabled, showing toast");
      toast.error(displayedSyncBadge.title);
      return;
    }
    if (!syncBadge || !syncBadge.clickable || syncBadge.disabled) {
      console.log("[sync] syncBadge not clickable");
      return;
    }

    // Call sync callback
    console.log("[sync] calling onSync");
    onSync?.({ item });
  }

  // ... (lines 48-118 skipped)

  // Get sync status icon and color
  const syncBadge = $derived.by(() => {
    if (!item.syncStatus) return null;

    switch (item.syncStatus) {
      case "synced":
        return {
          icon: CloudOff,
          colorClass: "synced",
          title: "Un-sync (Remove from cloud, keep local)",
          clickable: true,
          disabled: false,
        };
      case "pending":
        return {
          icon: LoaderCircle,
          colorClass: "pending",
          title: "Syncing...",
          spin: true,
          clickable: false,
          disabled: true,
        };
      case "pending_delete":
        return {
          icon: LoaderCircle,
          colorClass: "pending",
          title: "Deleting from cloud...",
          spin: true,
          clickable: false,
          disabled: true,
        };
      case "error":
        let errorMsg = "Sync failed - click to retry";
        if (item.lastSyncError) {
          if (item.lastSyncError.toLowerCase().includes("too large")) {
            errorMsg = "Item too large to sync";
          } else if (
            item.lastSyncError.toLowerCase().includes("unauthorized")
          ) {
            errorMsg = "Please login again to sync";
          } else if (item.lastSyncError.toLowerCase().includes("network")) {
            errorMsg = "Network error - click to retry";
          } else if (item.lastSyncError.toLowerCase().includes("password")) {
            errorMsg = "Master password not set";
          } else {
            errorMsg = "Sync failed - click to retry";
          }
        }

        return {
          icon: CircleAlert,
          colorClass: "error",
          title: errorMsg,
          clickable: true,
          disabled: false,
        };
      case "local":
      default:
        return {
          icon: CloudUpload,
          colorClass: "local",
          title: "Not synced - click to sync",
          clickable: true,
          disabled: false,
        };
    }
  });

  // Override sync badge interactivity in selection mode
  const displayedSyncBadge = $derived.by(() => {
    const badge = syncBadge;
    if (!badge) return null;

    if (isSelectionMode || mpcInProgress) {
      return {
        ...badge,
        clickable: false,
        disabled: true,
        title: isSelectionMode
          ? "Sync disabled in selection mode"
          : "Sync unavailable during master password change",
      };
    }
    return badge;
  });

  // Memoized formatted size (combined content + richContent)
  const formattedSize = $derived.by(() => {
    // 1. Try to use metadata size if available (e.g., images)
    let sizeInBytes = item.metadata?.size;

    // 2. Calculate from content + richContent using actual byte length
    if (!sizeInBytes) {
      const encoder = new TextEncoder();
      const contentBytes = encoder.encode(item.content || "").length;
      const richBytes = item.richContent
        ? encoder.encode(item.richContent).length
        : 0;
      sizeInBytes = contentBytes + richBytes;
    }

    if (!sizeInBytes) {
      return "";
    }

    if (sizeInBytes < 1024) {
      return `${sizeInBytes} B`;
    } else if (sizeInBytes < 1024 * 1024) {
      return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  });

  // Character count (only for single-version items without richContent)
  const showCharCount = $derived.by(() => {
    return !item.richContent && (item.content?.length || 0) > 0;
  });

  const charCount = $derived.by(() => {
    if (!showCharCount) return 0;
    return item.content?.length || 0;
  });

  // Memoized formatted date
  const formattedDate = $derived.by(() => {
    const date = new Date(item.createdAt);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  });

  // Memoized preview text
  const previewText = $derived.by(() => {
    if (typeof item.content === "string") {
      return item.content.length > 100
        ? item.content.substring(0, 100) + "..."
        : item.content;
    }
    return "";
  });

  // Color detection logic
  const detectedColor = $derived(detectColor(item.content));

  // Copy to clipboard - always writes all available formats
  async function copyToClipboard(event?: MouseEvent) {
    event?.stopPropagation();

    const now = Date.now();
    if (now - lastCopyTime < COPY_DEBOUNCE_MS) {
      return;
    }
    lastCopyTime = now;

    await doCopy();
  }

  // Do the actual copy - always write both formats if richContent exists
  async function doCopy() {
    try {
      const isImage =
        item.type === ClipboardItemType.IMAGE ||
        (typeof item.content === "string" &&
          item.content.trim().startsWith("data:image"));

      if (isImage) {
        // For images, we need to fetch the full content from DB first
        const fullItem = await clipboardDBService.getItem(item.id);

        if (fullItem && fullItem.content) {
          try {
            // Convert base64 to Blob
            const res = await fetch(fullItem.content);
            let blob = await res.blob();

            // Browser Clipboard API typically requires image/png
            if (blob.type !== "image/png") {
              try {
                blob = await new Promise((resolve, reject) => {
                  const img = new Image();
                  img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                      reject(new Error("Failed to get canvas context"));
                      return;
                    }
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((b) => {
                      if (b) resolve(b);
                      else reject(new Error("Canvas to Blob failed"));
                    }, "image/png");
                  };
                  img.onerror = (e) => reject(new Error("Image load failed"));
                  img.src = URL.createObjectURL(blob);
                });
              } catch (conversionErr) {
                console.warn(
                  "Failed to convert image to PNG, trying original format",
                  conversionErr,
                );
              }
            }

            // Use the clipboard API to write the blob
            await navigator.clipboard.write([
              new window.ClipboardItem({
                [blob.type]: blob,
              }),
            ]);
          } catch (err) {
            console.warn(
              "Failed to write image to clipboard as Blob, falling back to text",
              err,
            );
            throw err;
          }
        }
      } else {
        // For text and other types - always write both formats if richContent exists
        if (typeof item.content === "string") {
          const hasRichContent =
            (item.richContent && item.richContent.length > 0) ||
            item.type === ClipboardItemType.HTML;

          if (hasRichContent) {
            const htmlToUse = item.richContent || item.content;
            const plainToUse = item.content;

            const htmlBlob = new Blob([htmlToUse], { type: "text/html" });
            const plainBlob = new Blob([plainToUse], { type: "text/plain" });

            await navigator.clipboard.write([
              new window.ClipboardItem({
                "text/html": htmlBlob,
                "text/plain": plainBlob,
              }),
            ]);
          } else {
            // No rich content - just write plain text
            await navigator.clipboard.writeText(item.content);
          }
        }
      }
      onCopy?.(item.id);
      toast.success("Copied to clipboard");
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy to clipboard");
    }
  }

  function handleDelete(event: MouseEvent) {
    event.stopPropagation();
    onDelete?.(item.id);
  }

  function handleToggleFavorite() {
    onToggleFavorite?.(item.id);
  }

  function handleEdit(event: MouseEvent) {
    event.stopPropagation();
    onEdit?.(item.id);
  }

  function handleView(event: MouseEvent) {
    event.stopPropagation();
    onView?.(item.id);
  }

  function handleShare(event: MouseEvent) {
    event.stopPropagation();
    onShare?.(item.id);
  }

  function handleSelect() {
    if (isSyncing) return;
    onSelect?.({ id: item.id, selected: !selected });
  }

  function handleCheckboxClick(event: Event) {
    event.stopPropagation();
    if (isSyncing) return;
    handleSelect();
  }

  // Long press to enter selection mode
  let pressTimer: ReturnType<typeof setTimeout> | null = null;

  function handlePressStart(e: MouseEvent | TouchEvent) {
    if (isSyncing) return;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      onLongPress?.(item.id);
    }, 500);
  }

  function handlePressEnd() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function handleClick(event: MouseEvent | KeyboardEvent) {
    if (isSyncing) return;
    if (isSelectionMode || event.ctrlKey || event.metaKey) {
      onSelect?.({ id: item.id, selected: !selected });
    }
  }

  function handleDoubleClick(event: MouseEvent) {
    event.stopPropagation();
    const target = event.target as HTMLElement;
    if (target.closest(".item-actions, .header-left, .header-right")) return;
    copyToClipboard();
  }

  async function handleDownload(event: MouseEvent) {
    event.stopPropagation();
    if (item.type !== ClipboardItemType.IMAGE) return;

    try {
      // Fetch full content
      const fullItem = await clipboardDBService.getItem(item.id);
      if (fullItem && fullItem.content) {
        const link = document.createElement("a");
        link.href = fullItem.content;
        // Use a nice name if possible, or reliable timestamp/ID
        link.download = `clipboard-image-${item.createdAt}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Download started");
      } else {
        toast.error("Image content not found");
      }
    } catch (err) {
      console.error("Download failed", err);
      toast.error("Download failed");
    }
  }

  // --- Smart Blur Logic ---

  // Whether this item is a confidential text item
  const isConfidentialText = $derived(
    item.type === ClipboardItemType.TEXT && isConfidential(item.content || ""),
  );

  // ENV items are always considered confidential and should always be blurred
  const isEnvType = $derived(item.type === ClipboardItemType.ENV);

  // SSH private keys are ALWAYS blurred (unconditional, like ENV)
  const isSshPrivateKey = $derived(
    item.type === ClipboardItemType.SSH_KEY &&
      SSH_PRIVATE_KEY_REGEX.test(item.content || ""),
  );

  // SSH public keys are blurred only when smart blur setting is enabled
  const isSshPublicKey = $derived(
    item.type === ClipboardItemType.SSH_KEY &&
      SSH_PUBLIC_KEY_REGEX.test(item.content || ""),
  );

  // Whether the user has hovered long enough to temporarily reveal the content
  let isRevealedByHover = $state(false);
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;

  // Text blur: requires smartBlurEnabled
  // Image blur: requires smartBlurImagesEnabled - fully independent of smartBlurEnabled
  // ENV blur: always enabled regardless of settings
  // SSH private key blur: always enabled regardless of settings
  // SSH public key blur: requires smartBlurEnabled
  const isBlurred = $derived(
    !isRevealedByHover &&
      ((isConfidentialText && smartBlurEnabled) ||
        (item.type === ClipboardItemType.IMAGE && smartBlurImagesEnabled) ||
        isEnvType ||
        isSshPrivateKey ||
        (isSshPublicKey && smartBlurEnabled)),
  );

  const shouldDisplayBlur = $derived(
    (isConfidentialText && smartBlurEnabled) ||
      (item.type === ClipboardItemType.IMAGE && smartBlurImagesEnabled) ||
      isEnvType ||
      isSshPrivateKey ||
      (isSshPublicKey && smartBlurEnabled),
  );

  function handleMouseEnter() {
    if (!shouldDisplayBlur) return;

    hoverTimer = setTimeout(() => {
      isRevealedByHover = true;
    }, 1000); // 1 second hover delay
  }

  function handleRevealClick(e: Event) {
    if (!isBlurred) return;

    // Stop propagation so clicking to reveal doesn't trigger other actions like copy or open edit
    e.stopPropagation();
    e.preventDefault();

    isRevealedByHover = true;

    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function handleMouseLeave() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }

    isRevealedByHover = false;
  }
</script>

<div
  class="clipboard-item"
  class:favorite={item.isFavorite}
  class:selected
  onclick={handleClick}
  ondblclick={handleDoubleClick}
  onkeydown={(e) => e.key === "Enter" && handleClick(e)}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onmousedown={handlePressStart}
  onmouseup={handlePressEnd}
  ontouchstart={handlePressStart}
  ontouchend={handlePressEnd}
  role="button"
  tabindex="0"
>
  <!-- Header: Checkbox, Metadata, Actions -->
  <div class="item-header">
    <div class="header-left">
      {#if isSelectionMode}
        <div
          class="selection-checkbox"
          role="checkbox"
          aria-checked={selected}
          tabindex="0"
          onclick={(e) => {
            e.stopPropagation();
          }}
          onkeydown={(e) => {
            if (e.key === "Enter") e.stopPropagation();
          }}
        >
          <Checkbox
            value={selected}
            disabled={isSyncing}
            onChange={() => handleSelect()}
          />
        </div>
      {/if}

      {#if item.type === ClipboardItemType.IMAGE}
        <div class="type-badge image">IMAGE</div>
      {:else if item.type !== ClipboardItemType.TEXT}
        <div class="type-badge">
          {formatTypeLabel(item.type)}
        </div>
      {/if}

      {#if item.type === ClipboardItemType.IMAGE}
        <span class="hostname" title={formattedSize}>
          {formattedSize}
        </span>
      {:else if showCharCount}
        <span class="hostname" title="{charCount} characters">
          {charCount} chars
        </span>
      {:else}
        <span class="hostname" title={formattedSize}>
          {formattedSize}
        </span>
      {/if}
    </div>

    <div class="header-right">
      <span class="time">{formattedDate}</span>
      {#if item.isFavorite}
        <div class="favorite-badge" title="Favorite">
          <Star class="w-2.5 h-2.5 text-yellow-500" fill="currentColor" />
        </div>
      {/if}
      {#if showSyncStatus && item.syncStatus === "synced"}
        <div class="synced-badge" title="Synced in cloud">
          <CloudOff class="w-2.5 h-2.5" />
        </div>
      {/if}
    </div>
  </div>

  <div class="item-actions">
    {#if !isSelectionMode}
      <button
        class="action-btn favorite-btn"
        class:active={item.isFavorite}
        onclick={handleToggleFavorite}
        title={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star size={14} fill={item.isFavorite ? "currentColor" : "none"} />
      </button>

      <div class="copy-dropdown-wrapper">
        <button
          class="action-btn copy-btn"
          bind:this={copyButtonElement}
          onclick={copyToClipboard}
          title="Copy to clipboard"
        >
          <Copy size={14} />
        </button>
      </div>

      {#if showSyncStatus && displayedSyncBadge}
        <button
          class="action-btn sync-action-btn"
          class:disabled={displayedSyncBadge.disabled}
          title={displayedSyncBadge.title}
          onclick={handleSyncClick}
          disabled={displayedSyncBadge.disabled}
        >
          {#if displayedSyncBadge.spin}
            <Spinner size={14} />
          {:else if displayedSyncBadge.icon}
            <displayedSyncBadge.icon size={14} />
          {/if}
        </button>
      {/if}

      {#if item.type === ClipboardItemType.IMAGE || item.type === ClipboardItemType.JSON}
        <button class="action-btn view-btn" onclick={handleView} title="View">
          <Eye size={14} />
        </button>
      {/if}

      {#if item.type === ClipboardItemType.IMAGE}
        <button
          class="action-btn download-btn"
          onclick={handleDownload}
          title="Download"
        >
          <Download size={14} />
        </button>
      {/if}

      {#if item.syncStatus === "synced"}
        <button
          class="action-btn share-btn"
          onclick={handleShare}
          title="Share"
        >
          <Share2 class="icon" />
        </button>
      {/if}

      {#if item.type !== ClipboardItemType.IMAGE && item.type !== ClipboardItemType.EMOJI}
        <button class="action-btn edit-btn" onclick={handleEdit} title="Edit">
          <PencilLine class="icon" />
        </button>
      {/if}

      <button
        class="action-btn delete-btn"
        onclick={handleDelete}
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    {/if}
  </div>

  <!-- Content -->
  <div class="item-content">
    <div class="text-preview">
      {#if detectedColor}
        <div
          class="color-preview-dot"
          style="background-color: {detectedColor}"
          title={detectedColor}
        ></div>
      {/if}
      {#if item.type === ClipboardItemType.IMAGE}
        {#if item.thumbnail && item.thumbnail !== "__FAILED__"}
          <div
            class="image-preview"
            class:confidential-blur={isBlurred}
            role="button"
            tabindex="0"
            onclick={handleRevealClick}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleRevealClick(e);
              }
            }}
          >
            <img src={item.thumbnail} alt="Preview" />
          </div>
        {:else if item.content?.startsWith("data:image")}
          <!-- No thumbnail or generation failed - show original image as fallback -->
          <div
            class="image-preview"
            class:confidential-blur={isBlurred}
            role="button"
            tabindex="0"
            onclick={handleRevealClick}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleRevealClick(e);
              }
            }}
          >
            <img src={item.content} alt="Preview" class="opacity-80" />
          </div>
        {:else}
          <!-- Async Generation State (Premium UI) -->
          <div class="image-preview skeleton-loader">
            <div class="skeleton-shimmer"></div>
            <div class="loading-state">
              <Spinner size={20} />
              <span class="text-xs text-muted-foreground/70 font-medium mt-2"
                >Generating preview...</span
              >
            </div>
          </div>
        {/if}
      {:else}
        <div
          class="text-content"
          class:confidential-blur={isBlurred}
          role="button"
          tabindex="0"
          onclick={(e) => {
            if (isBlurred) {
              handleRevealClick(e);
            }
          }}
        >
          <LinkifiedText text={previewText} itemType={item.type} />
        </div>
      {/if}
    </div>

    {#if item.tags && item.tags.length > 0}
      <div class="tags">
        {#each item.tags as tag}
          <span class="tag">{tag}</span>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  @use "../styles/components/clipboard-item" as *;
</style>
