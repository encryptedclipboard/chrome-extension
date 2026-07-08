<script lang="ts">
  import Banner from "./Banner.svelte";

  const { ondismiss } = $props();
  let isExpanded = $state(false);

  function toggleExpand() {
    isExpanded = !isExpanded;
  }

  function handleDismiss() {
    if (ondismiss) {
      localStorage.setItem("push_warning_dismissed", "true");
      ondismiss();
    }
  }
</script>

<Banner
  variant="error"
  message="Enable Google Push Services for real-time sync"
  dismissible={!!ondismiss}
  onDismiss={handleDismiss}
  onclick={toggleExpand}
  isExpandable={true}
  expanded={isExpanded}
  class="push-warning-banner"
>
  {#if isExpanded}
    <div class="details">
      <p>Your browser is blocking push notifications needed for sync.</p>
      <p class="fix-title">How to fix (Brave):</p>
      <ol>
        <li>Go to <b>brave://settings/privacy</b></li>
        <li>Enable <b>Use Google Services for Push Messaging</b></li>
        <li>Restart your browser</li>
      </ol>
    </div>
  {/if}
</Banner>

<style lang="scss">
  @use "../styles/components/push-warning-banner" as *;
</style>
