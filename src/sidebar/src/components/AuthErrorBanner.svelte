<script lang="ts">
  import { CircleAlert, X } from "lucide-svelte";

  const { message, ondismiss }: { message: string; ondismiss: () => void } =
    $props();
</script>

<div class="auth-error-banner" role="alert">
  <div class="content">
    <CircleAlert size={16} class="icon" />
    <span>{message}</span>
  </div>
  <button class="dismiss-btn" onclick={ondismiss} aria-label="Dismiss">
    <X size={14} />
  </button>
</div>

<style lang="scss">
  @use "../styles/components/auth-error-banner" as *;
</style>
