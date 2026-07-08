<script lang="ts">
  import { tick } from "svelte";
  import { Search, X } from "lucide-svelte";

  interface Props {
    show: boolean;
    value: string;
    onclose?: () => void;
  }

  let { show, value = $bindable(""), onclose }: Props = $props();

  let searchInputRef = $state<HTMLInputElement | null>(null);

  // Auto-focus when shown
  $effect(() => {
    if (show) {
      tick().then(() => {
        searchInputRef?.focus();
      });
    }
  });

  function handleClear() {
    value = "";
  }

  function handleClose() {
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.stopPropagation();
      e.preventDefault();
    } else if (e.key === "Escape") {
      handleClose();
    }
  }
</script>

{#if show}
  <div class="search-bar-overlay">
    <div class="search-input-wrapper">
      <Search class="w-4 h-4 search-icon" />
      <input
        bind:value
        bind:this={searchInputRef}
        type="text"
        placeholder="Search keys and values..."
        class="search-input"
        onkeydown={handleKeydown}
      />
      {#if value}
        <button
          onclick={handleClear}
          class="search-clear"
          title="Clear search"
          type="button"
        >
          <X class="w-3 h-3" />
        </button>
      {/if}
      <button
        onclick={handleClose}
        class="search-close"
        title="Close search"
        type="button"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  </div>
{/if}

<style lang="scss">
  @use "../styles/components/search-bar.scss" as *;
</style>
