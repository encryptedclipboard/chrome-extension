<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { lockProgressStore } from "../stores/lock-progress.svelte";
  import { fade, fly } from "svelte/transition";
  import "@/styles/components/plan-details-modal.scss";

  const lockEmojis = [
    { emoji: "🔐", text: "Locking things up tight..." },
    { emoji: "🔒", text: "Activating security protocols..." },
    { emoji: "🛡️", text: "Shields are going up..." },
    { emoji: "⚡", text: "Zapping your data into the vault..." },
    { emoji: "💪", text: "Flexing those encryption muscles..." },
    { emoji: "🔥", text: "Burning through the encryption..." },
    { emoji: "✨", text: "Adding some magic dust..." },
    { emoji: "🚀", text: "Launching to secure orbit..." },
  ];

  const progress = $derived(lockProgressStore.progress);
  const visible = $derived(lockProgressStore.visible);

  let emojiIndex = $state(0);
  let intervalId: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    if (visible) {
      emojiIndex = 0;
      intervalId = setInterval(() => {
        emojiIndex = (emojiIndex + 1) % lockEmojis.length;
      }, 5000);
    } else {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    }
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });
</script>

{#if visible && progress}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-overlay dark blurry-overlay"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="modal-content lock-modal"
      role="document"
      in:fly={{ y: 20, duration: 300 }}
    >
      <div
        class="modal-body text-center flex flex-col items-center justify-center p-6"
      >
        <div class="emoji-wrapper mb-2 pulse">
          {lockEmojis[emojiIndex].emoji}
        </div>

        <p class="emoji-text text-sm font-semibold mb-3">
          {lockEmojis[emojiIndex].text}
        </p>

        <p class="text-sm text-muted-foreground mb-4">
          {#if progress.stage === "password"}
            Encrypting master password...
          {:else if progress.stage === "items"}
            Encrypting item {progress.current} of {progress.total}
          {:else if progress.message}
            {progress.message}
          {:else}
            Processing...
          {/if}
        </p>

        {#if progress.total && progress.total > 0 && progress.current !== undefined}
          <div
            class="w-full bg-secondary/50 h-2 rounded-full overflow-hidden mt-2"
          >
            <div
              class="h-full transition-all duration-300 ease-out bg-primary"
              style:width="{progress.total > 0
                ? (progress.current / progress.total) * 100
                : 0}%"
            ></div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use "../styles/components/lock-progress" as *;
</style>
