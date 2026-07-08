<script lang="ts">
  import { WifiOff, X } from "lucide-svelte";

  const { ondismiss } = $props();
</script>

<div class="offline-banner" role="alert">
  <div class="content">
    <WifiOff size={16} class="icon" />
    <span>Image copying disabled while offline</span>
  </div>
  {#if ondismiss}
    <button class="dismiss-btn" onclick={ondismiss} title="Dismiss">
      <X size={14} />
    </button>
  {/if}
</div>

<style lang="scss">
  @use "../styles/components/offline-banner" as *;
</style>
