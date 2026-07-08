import { ClipboardItemType, PlanAbility } from "@shared/enums";
import {
  cbItemService,
  cleanupService,
  lockService,
  clipboardSyncQueueService,
  clipboardDBService,
  thumbnailService,
  notificationService,
  syncUploadService,
} from "../services";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { StorageUtil } from "@shared/utils/extension-storage.util";
import { detectClipboardItemType } from "@/shared/utils/clipboard-type.util";
import { updateBadge } from "../utils/badge.util";
import { MessageType } from "@shared/types";
import {
  sendUpdated,
  sendItemUpdated,
  sendSyncItem,
  sendCaptured,
  sendToast,
} from "@shared/utils/message.utils";

// In-memory cache to prevent rapid duplicate processing (Race Condition fix)
let lastProcessedContent: string | null = null;
let lastProcessedType: ClipboardItemType | null = null;
let lastProcessedTime: number = 0;
const processingKeys = new Set<string>();

export async function handleClipboardCaptured(data: any) {
  if ((await lockService.isLockActive()) || lockService.isLockInProgress())
    return;

  if (data?.source !== "context_menu" && data?.source !== "element_picker") {
    try {
      const settings = await StorageUtil.getSettings();
      if (settings?.monitoringEnabled === false) {
        console.log(
          "[CaptureGuard] BLOCKED monitoring=off source=" +
            (data?.source || data?.metadata?.source || "unknown") +
            " content=" +
            (typeof data?.content === "string"
              ? data.content.slice(0, 40)
              : ""),
        );
        return;
      }
    } catch (e) {
      console.log("[CaptureGuard] getSettings threw:", e);
    }
  }

  let processingKeyAdded = false;
  let processingKey = "";

  try {
    // Validate data parameter
    if (!data || typeof data !== "object") {
      console.warn("[Background] Invalid clipboard data received:", data);
      return;
    }

    let { content, metadata } = data;

    if (typeof content === "string") {
      content = content.trim();
      if (!content) return;

      // [Detect Local Image File]
      // Check if it's a file:// URI with an image extension
      const isLocalFile = content.startsWith("file://");
      const isImageExtension = /\.(png|jpe?g|gif|webp|bmp|ico|tiff?)$/i.test(
        content,
      );

      if (isLocalFile && isImageExtension) {
        try {
          const response = await fetch(content);

          if (response.ok) {
            const blob = await response.blob();
            const base64Data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            content = base64Data;
          } else {
            console.warn(
              `[Background] Failed to fetch local image: ${response.status}`,
            );
          }
        } catch (err) {
          console.error(`[Background] Error fetching local image:`, err);
        }
      }
    } else if (content !== undefined && content !== null) {
      // Non-string content (Blob, ArrayBuffer, etc.) - attempt to coerce
      // This handles cases where clipboard API returns non-string data
      if (
        typeof content === "object" &&
        typeof content.arrayBuffer === "function"
      ) {
        // It's a Blob-like object
        try {
          const arrayBuffer = await content.arrayBuffer();
          const base64 = btoa(
            String.fromCharCode(...new Uint8Array(arrayBuffer)),
          );
          content = `data:image/png;base64,${base64}`;
        } catch (err) {
          console.warn("[Background] Failed to convert Blob to base64:", err);
          content = String(content);
        }
      } else {
        content = String(content);
      }
    }

    const type =
      data.type ||
      (typeof content === "string"
        ? detectClipboardItemType(content)
        : ClipboardItemType.TEXT);

    // [User Request] Write to OS Clipboard (e.g. from Element Picker Screenshot)

    // [Rapid Deduplication] Check in-memory cache first to stop event loops
    // Consider same content within 2 seconds as duplicate (debouncing)
    // extend to indefinitely if it matches exactly?
    // If the user copies "A", then "B", then "A". The memory cache "A" would block the second "A" if we don't clear it.
    // So we update it on every successful process.
    if (
      content === lastProcessedContent &&
      type === lastProcessedType &&
      Date.now() - lastProcessedTime < 2000
    ) {
      return;
    }

    // [Concurrent Processing Guard] Skip if already processing this exact content
    processingKey = `${type}:${content}`;
    if (processingKeys.has(processingKey)) {
      return;
    }
    processingKeys.add(processingKey);
    processingKeyAdded = true;

    // [ABILITY CHECK] Enforce Image Support
    if (type === ClipboardItemType.IMAGE) {
      const authData = await StorageUtil.getAuthData();
      const abilities = authData?.subscription?.planDetails?.abilities || [];

      if (!abilities.includes(PlanAbility.IMAGE_SUPPORT)) {
        // Optional: Notify user upgrade required?
        return;
      }
    }

    // 1. Check strict duplicate against latest item (Fast & handles Images correctly)
    const latestItem = await cbItemService.getLatestItem();

    if (
      latestItem &&
      latestItem.content === content &&
      latestItem.type === type &&
      latestItem.richContent === data.richContent
    ) {
      // Patch richContent if the incoming message has it but the stored item doesn't
      const incomingRichContent = data.richContent;
      const needsRichUpdate = incomingRichContent && !latestItem.richContent;

      if (metadata.source !== "OS" && !latestItem.metadata.hostname) {
        await cbItemService.updateItem(latestItem.id, {
          metadata: { ...latestItem.metadata, ...metadata },
          ...(needsRichUpdate ? { richContent: incomingRichContent } : {}),
        });
      } else if (needsRichUpdate) {
        await cbItemService.updateItem(latestItem.id, {
          richContent: incomingRichContent,
          metadata: { ...latestItem.metadata, hasRichContent: true },
        });
      }

      sendUpdated({ itemId: latestItem.id });

      updateBadge(clipboardDBService, lockService);

      // Update cache so the offscreen 1-second poll doesn't re-process the same content
      lastProcessedContent = content;
      lastProcessedType = type;
      lastProcessedTime = Date.now();

      // [User Request] Write to OS Clipboard (duplicate item - moved to top)
      if (metadata?.writeToOSClipboard) {
        const writeType = type === ClipboardItemType.IMAGE ? "image" : "text";
        thumbnailService.writeToClipboard(writeType, content).catch((err) => {
          console.error("[Background] Failed to write to OS clipboard:", err);
        });
      }

      return;
    }

    // 2. Check duplicates against all history (Slower, mainly for Text)
    // Note: getAllItems() does NOT populate Image content, so image duplicates
    // are only caught by the latestItem check above (consecutive only).
    const allItems = await cbItemService.getAllItems();
    const existingDuplicate = allItems.find(
      (item) =>
        item.content === content &&
        item.type === type &&
        item.richContent === data.richContent,
    );

    if (existingDuplicate) {
      // Move to top: Update timestamps
      const now = Date.now();

      // Also patch richContent if the incoming message has it but the stored item doesn't
      const incomingRichContent = data.richContent;
      const needsRichUpdate =
        incomingRichContent && !existingDuplicate.richContent;

      await cbItemService.updateItem(existingDuplicate.id, {
        updatedAt: now,
        createdAt: now,
        ...(needsRichUpdate
          ? {
              richContent: incomingRichContent,
              metadata: { ...existingDuplicate.metadata, hasRichContent: true },
            }
          : {}),
      });

      sendUpdated({ itemId: existingDuplicate.id });

      updateBadge(clipboardDBService, lockService);

      // Update cache
      lastProcessedContent = content;
      lastProcessedType = type;
      lastProcessedTime = Date.now();

      // [User Request] Write to OS Clipboard (duplicate item - moved to top in history)
      if (metadata?.writeToOSClipboard) {
        const writeType = type === ClipboardItemType.IMAGE ? "image" : "text";
        thumbnailService.writeToClipboard(writeType, content).catch((err) => {
          console.error("[Background] Failed to write to OS clipboard:", err);
        });
      }

      return; // Stop here. Do NOT auto-sync duplicates if not strictly required, or handle below.
      // NOTE: Original code synced duplicates. If we want to sync, we must check settings.
      /*
      // Trigger sync for the updated (now newer) item
      const authData = await StorageUtil.getAuthData();
      const abilities = authData?.subscription?.planDetails?.abilities || [];
      const hasAutoSyncAbility = abilities.includes(PlanAbility.AUTO_SYNC);
      const settings = await StorageUtil.get(["clipboardAutoSync", "clipboardMasterPasswordSet"]);

      if (hasAutoSyncAbility && settings.clipboardAutoSync && settings.clipboardMasterPasswordSet) {
         clipboardSyncQueueService.addToQueue(existingDuplicate.id);
      }
      */
    }
    // 3. Save immediately (Async Thumbnail)
    // We do NOT await thumbnail generation here. We save undefined/null first.
    // This allows the item to appear in the UI instantly.

    // Calculate metadata size if missing (especially for Images where content isn't loaded in lists)
    if (
      type === ClipboardItemType.IMAGE &&
      !metadata?.size &&
      typeof content === "string"
    ) {
      // Base64 uses 4 chars for 3 bytes. Padding '=' is at the end.
      let sizeInBytes: number;
      try {
        const padding = content.endsWith("==")
          ? 2
          : content.endsWith("=")
            ? 1
            : 0;
        sizeInBytes = Math.floor((content.length * 3) / 4) - padding;
      } catch {
        sizeInBytes = content.length;
      }
      metadata = { ...metadata, size: sizeInBytes };

      const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
      if (sizeInBytes > MAX_IMAGE_SIZE_BYTES) {
        console.warn(
          `[ClipboardCapturedHandler] Image exceeds 20MB limit (${(sizeInBytes / 1024 / 1024).toFixed(2)}MB). Rejecting.`,
        );
        sendToast({
          message: "Image exceeds 20MB limit. Please resize and try again.",
          type: "error",
        });
        return;
      }
    }

    // Save first
    const { richContent } = data;

    const item = await cbItemService.addItem(
      type,
      content,
      metadata,
      undefined, // No thumbnail yet
      richContent, // HTML representation if available
    );

    // Notify UI immediately (shows "Generating..." state)
    sendUpdated({ itemId: item.id });

    updateBadge(clipboardDBService, lockService);

    // Trigger Async Thumbnail Generation (if image)
    if (type === ClipboardItemType.IMAGE) {
      thumbnailService
        .generateThumbnailForContent(content)
        .then(async (thumb) => {
          if (thumb) {
            await cbItemService.updateItem(item.id, {
              thumbnail: thumb,
            });

            sendItemUpdated({ itemId: item.id });
          } else {
            // Null/undefined response (generation failed inside service)
            await cbItemService.updateItem(item.id, {
              thumbnail: "__FAILED__",
            });

            sendItemUpdated({ itemId: item.id });
          }
        })
        .catch(async (err) => {
          console.warn("[Background] Async thumbnail failed:", err);
          await cbItemService.updateItem(item.id, {
            thumbnail: "__FAILED__",
          });

          sendItemUpdated({ itemId: item.id });
        });
    }

    // Update Activity for Auto-Lock
    await lockService.updateActivity();

    // Auto-Sync
    // [ABILITY CHECK] Enforce Auto-Sync Support
    const authData = await StorageUtil.getAuthData();
    const abilities = authData?.subscription?.planDetails?.abilities || [];
    const hasAutoSyncAbility = abilities.includes(PlanAbility.AUTO_SYNC);

    const autoSyncSettings = await StorageUtil.get([
      "clipboardAutoSync",
      "clipboardMasterPasswordSet",
    ]);

    // Explicitly check if auto-sync is disabled in settings
    if (!autoSyncSettings.clipboardAutoSync) {
      // We still trim history etc globally below? Yes.
    } else if (
      hasAutoSyncAbility &&
      // settings.clipboardAutoSync && // Already checked above essentially, but good to keep
      autoSyncSettings.clipboardMasterPasswordSet
    ) {
      syncUploadService.pushItem(item.id, true).catch(async (err) => {
        // Auto-sync failed
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";

        // Check for specific "Master password not set" error
        if (errorMessage.includes("Master password not set")) {
          console.warn(
            "[Background] Master password missing, disabling auto-sync.",
          );

          // Disable Auto-Sync
          await StorageUtil.set({
            clipboardAutoSync: false,
          });

          // Unset memory password specifically?
          // Actually MasterPassUtils.clearPassword() might be redundant if it's already missing,
          // but good for safety.
          MasterPassUtils.clearPassword();

          // Notify User
          const error = new Error("Master password not set");
          notificationService.show(notificationService.classifyError(error));
        } else {
          // Standard retry queue for other errors (network, server, etc.)
          clipboardSyncQueueService.addToQueue(item.id, err.message);
        }
      });
    }

    // Limits
    // User Request: Make history unlimited for now (next release will be fully functional)
    // We set a very high limit to effectively disable trimming.
    const unlimitedTarget = 1000000;
    await cleanupService.trimHistory(unlimitedTarget);

    // Notify
    sendUpdated({ itemId: item.id });

    updateBadge(clipboardDBService, lockService);

    // [User Request] Write to OS Clipboard (LAST step to ensure DB persistence first)
    if (metadata?.writeToOSClipboard) {
      const writeType = type === ClipboardItemType.IMAGE ? "image" : "text";
      thumbnailService.writeToClipboard(writeType, content).catch((err) => {
        console.error("[Background] Failed to write to OS clipboard:", err);
      });
    }

    // Update Cache
    lastProcessedContent = content;
    lastProcessedType = type;
    lastProcessedTime = Date.now();
  } catch (error) {
    console.error("[Background] Error saving item:", error);
  } finally {
    // Clean up processing key
    if (processingKeyAdded && processingKeys.has(processingKey)) {
      processingKeys.delete(processingKey);
    }
  }
}
