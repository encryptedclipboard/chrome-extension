<script lang="ts">
  import { Star, ExternalLink, X } from "lucide-svelte";
  import { ratingModalStore } from "@/stores/rating-modal.svelte";
  import { ratingService } from "@shared/services";
  import "@/styles/components/rating-modal.scss";

  const CHROME_WEB_STORE_URL =
    "https://chromewebstore.google.com/detail/encrypted-clipboard-manag/hplfhaecbalimhnmlacdbmecldhpjgli";

  let isAlreadyRated = $state(false);

  const handleRate = () => {
    window.open(CHROME_WEB_STORE_URL, "_blank");
    isAlreadyRated = true;
  };

  const handleNotNow = () => {
    ratingService.setRatingModalNotNow(Date.now());
    ratingModalStore.close();
  };

  const handleDismissForever = () => {
    ratingService.setRatingModalDismissed();
    ratingModalStore.close();
  };

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      ratingModalStore.close();
    }
  };
</script>

{#if ratingModalStore.isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="rating-modal modal-overlay"
    onclick={handleOverlayClick}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="modal-content" role="document">
      <button
        type="button"
        class="close-btn"
        onclick={() => ratingModalStore.close()}
        aria-label="Close"
      >
        <X class="icon" />
      </button>

      <div class="modal-header">
        <div class="stars">
          <Star class="star-icon filled" />
          <Star class="star-icon filled" />
          <Star class="star-icon filled" />
          <Star class="star-icon filled" />
          <Star class="star-icon filled" />
        </div>
        <h2>Love Encrypted Clipboard Manager?</h2>
      </div>

      <div class="modal-body">
        <p class="description">
          Your rating helps us grow and improve the extension for everyone. If
          you're enjoying it, would you mind taking a moment to leave a review?
        </p>
      </div>

      <div class="modal-footer">
        <button type="button" class="rate-btn" onclick={handleRate}>
          <Star class="icon" />
          Rate on Chrome Web Store
          <ExternalLink class="icon external" />
        </button>
      </div>

      <div class="modal-actions">
        <button type="button" class="not-now-btn" onclick={handleNotNow}>
          Remind me later
        </button>
        <button
          type="button"
          class="dismiss-btn"
          onclick={handleDismissForever}
        >
          Don't show again
        </button>
      </div>
    </div>
  </div>
{/if}
