<script lang="ts">
  import {
    X,
    Share2,
    Copy,
    Lock,
    Clock,
    Eye,
    AlertCircle,
    Link,
  } from "lucide-svelte";
  import { shareService } from "@shared/services";
  import { EncryptionUtils } from "@shared/utils/encryption.utils";
  import { EXPIRY_OPTIONS, calculateExpiryDate, encryptToken } from "@shared";
  import { toast } from "svelte-sonner";
  import type { ClipboardItem as DbClipboardItem } from "@shared/services/clipboard-db.service";
  import "@/styles/components/edit-clipboard-modal.scss"; // Reuse existing modal styles
  import "@/styles/components/share-item-modal.scss"; // Specific share modal styles

  export let show = false;
  export let item: DbClipboardItem | null = null;
  export let onClose: () => void;

  let loading = false;
  let generatedLink = "";
  let copied = false;
  let linkInput: HTMLInputElement;

  // Real-time password inclusion state
  let originalShareUrl = "";
  let previewLink = "";
  let shortId = "";
  let baseUrl = "";

  let form = {
    expiry: "1h",
    hasPassword: true,
    password: "",
    includePassword: false,
  };

  // Reactive statement for password inclusion toggle (not on password keystroke)
  $: if (generatedLink && shortId && baseUrl) {
    if (form.includePassword && form.password) {
      encryptAndPreview();
    } else if (!form.includePassword) {
      // Remove password from URL
      previewLink = originalShareUrl;
    }
  }

  async function encryptAndPreview() {
    if (!shortId || !form.password) return;
    const token = await encryptToken(`${shortId}:${form.password}`);
    previewLink = baseUrl + token;
  }

  function handlePasswordBlur() {
    if (form.includePassword && form.password && shortId) {
      encryptAndPreview();
    }
  }

  $: if (show) {
    generatedLink = "";
    originalShareUrl = "";
    previewLink = "";
    shortId = "";
    baseUrl = "";
    copied = false;
    form = {
      expiry: "1h",
      hasPassword: true, // Default to secure
      password: "",
      includePassword: false,
    };
  }

  $: if (!form.hasPassword) {
    form.includePassword = false;
    form.password = "";
  }

  function handleClose() {
    onClose();
  }

  const handleShare = async () => {
    if (!item) return;

    if (form.hasPassword && !form.password) {
      toast.error("Please enter a password for encryption");
      return;
    }

    loading = true;

    try {
      let finalContent = item.content;
      let encryptionData = null;

      if (form.hasPassword) {
        const encrypted = await EncryptionUtils.encrypt(
          item.content,
          form.password,
        );
        finalContent = encrypted.ciphertext;
        encryptionData = {
          iv: encrypted.iv,
          salt: encrypted.salt,
          authTag: encrypted.authTag,
          version: encrypted.version || 1,
          iterations: encrypted.iterations,
        };
      }

      const payload = {
        itemId: item.id || item._id,
        content: finalContent,
        type: item.type,
        isEncrypted: form.hasPassword,
        encryptionData: encryptionData,
        expiresAt: calculateExpiryDate(form.expiry),
        metadata: item.metadata,
      };

      const resp = await shareService.createSharedLink(payload);
      const serverUrl = resp.data.url;
      shortId = resp.data.shortId;
      baseUrl = serverUrl.replace(shortId, "");
      originalShareUrl = serverUrl;
      generatedLink = serverUrl;

      if (form.includePassword && form.password) {
        const token = await encryptToken(`${shortId}:${form.password}`);
        const encryptedUrl = baseUrl + token;
        generatedLink = encryptedUrl;
        previewLink = encryptedUrl;
      } else {
        previewLink = serverUrl;
      }
      toast.success("Sharable link created!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to create share link");
    } finally {
      loading = false;
    }
  };

  const copyLink = () => {
    const linkToCopy = previewLink || generatedLink;
    if (!linkToCopy) return;

    navigator.clipboard.writeText(linkToCopy);
    copied = true;
    toast.success("Link copied to clipboard");

    if (linkInput) {
      linkInput.select();
    }

    setTimeout(() => {
      copied = false;
    }, 2000);
  };
</script>

{#if show}
  <div class="modal-overlay edit-clipboard-modal-wrapper share-item-modal">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <div class="flex-center">
          <Share2 size={20} class="header-icon" />
          <h2>Share Item</h2>
        </div>
        <div class="header-right">
          <button class="close-btn" on:click={handleClose}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div class="modal-body">
        <!-- Info Alert -->
        <div class="info-alert">
          <AlertCircle size={14} />
          <p>Create a secure, public link to share this item with others.</p>
        </div>

        <!-- Configuration Form -->
        <div class="form-section">
          <!-- Expiry -->
          <div class="form-group expiry-group">
            <label>
              <Clock size={14} />
              Link Expiry
            </label>
            <select bind:value={form.expiry}>
              {#each EXPIRY_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>

          <!-- Password Protection Toggle -->
          <div class="toggle-section">
            <div class="toggle-info">
              <div class="icon-container">
                <Lock size={14} />
              </div>
              <div>
                <h4>Password Protection</h4>
                <p>Re-encrypt with a specific password</p>
              </div>
            </div>
            <label class="checkbox-label checkbox-label-no-margin-top">
              <div class="checkbox-container">
                <input type="checkbox" bind:checked={form.hasPassword} />
                <svg
                  class:checked={form.hasPassword}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  ><polyline points="20 6 9 17 4 12"></polyline></svg
                >
              </div>
            </label>
          </div>

          {#if form.hasPassword}
            <!-- Password Input -->
            <div class="form-group slide-in">
              <input
                type="text"
                bind:value={form.password}
                placeholder="Enter a secure password"
                on:blur={handlePasswordBlur}
              />

              <!-- Include in Link Option -->
              <label class="checkbox-label">
                <div class="checkbox-container">
                  <input type="checkbox" bind:checked={form.includePassword} />
                  <svg
                    class:checked={form.includePassword}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><polyline points="20 6 9 17 4 12"></polyline></svg
                  >
                </div>
                <span class="label-text">Include password in the link</span>
              </label>

              {#if form.includePassword}
                <p class="password-subtext">
                  <AlertCircle size={14} />
                  Anyone with the link can view the content without entering a password.
                </p>
              {/if}
            </div>
          {/if}

          <!-- Link Preview (always visible) -->
          <div class="link-container">
            <label class="link-label" for="sharable-link">Share Link</label>
            <div class="link-input-wrapper">
              <input
                id="sharable-link"
                bind:this={linkInput}
                type="text"
                readonly
                placeholder="Click 'Generate Link' to create a shareable URL"
                value={previewLink || generatedLink}
              />
              <button
                on:click={copyLink}
                class="copy-btn"
                class:copied
                disabled={!generatedLink}
              >
                <Copy size={14} />
              </button>
            </div>
            {#if generatedLink && form.hasPassword && !form.includePassword}
              <p class="password-subtext">
                <AlertCircle size={14} />
                Don't forget to share the password separately.
              </p>
            {/if}
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary content-btn" on:click={handleClose}
            >Cancel</button
          >
          <button
            type="button"
            class="btn btn-primary content-btn flex-center"
            disabled={loading || (form.hasPassword && !form.password)}
            on:click={handleShare}
            style={loading || (form.hasPassword && !form.password)
              ? "opacity: 0.5; cursor: not-allowed;"
              : ""}
          >
            {#if loading}
              <div class="share-spinner"></div>
              Generating...
            {:else if generatedLink}
              <Share2 size={14} class="share-icon-margin" />
              Regenerate Link
            {:else}
              <Share2 size={14} class="share-icon-margin" />
              Generate Link
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use "../styles/components/share-item-modal" as *;
</style>
