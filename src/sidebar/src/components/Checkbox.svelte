<script lang="ts">
  interface Props {
    value: boolean;
    noMargin?: boolean;
    disabled?: boolean;
    onChange?: (newValue: boolean) => void;
  }

  let {
    value = $bindable(false),
    noMargin = false,
    disabled = false,
    onChange,
  }: Props = $props();

  function toggle(e?: Event) {
    if (disabled) return;
    if (e) {
      e.stopPropagation();
    }
    const newValue = !value;
    value = newValue;
    onChange?.(newValue);
  }
</script>

<div
  class="custom-checkbox"
  class:checked={value}
  class:no-margin={noMargin}
  class:disabled
  onclick={toggle}
  role="checkbox"
  tabindex="0"
  aria-checked={value}
  aria-disabled={disabled}
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  }}
>
  {#if value}
    <svg class="tick" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
      />
    </svg>
  {/if}
</div>

<style lang="scss">
  @use "../styles/components/checkbox.scss" as *;
</style>
