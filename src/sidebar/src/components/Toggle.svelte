<script lang="ts">
  interface Props {
    checked: boolean;
    disabled?: boolean;
    size?: "sm" | "md";
    title?: string;
    onClick?: () => void;
    onChange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    size = "md",
    title = "Toggle",
    onClick,
    onChange,
  }: Props = $props();

  function toggle() {
    if (!disabled) {
      checked = !checked;
      onClick?.();
      onChange?.(checked);
    }
  }
</script>

<button
  {title}
  type="button"
  class="toggle-switch toggle-switch-wrapper {size}"
  class:checked
  class:disabled
  onclick={toggle}
  role="switch"
  aria-checked={checked}
  {disabled}
>
  <div class="toggle-thumb"></div>
</button>

<style lang="scss">
  @use "../styles/theme" as *;
  @use "../styles/components/toggle" as *;
</style>
