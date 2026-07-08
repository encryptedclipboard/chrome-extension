<script lang="ts">
  interface Props {
    name: string;
    value: string;
    checked?: boolean;
    disabled?: boolean;
    onchange?: (value: string) => void;
  }

  const {
    name,
    value,
    checked = false,
    disabled = false,
    onchange,
  }: Props = $props();

  function handleChange() {
    if (!disabled && onchange) {
      onchange(value);
    }
  }
</script>

<label class="radio-wrapper" class:disabled>
  <input
    type="radio"
    {name}
    {value}
    {checked}
    {disabled}
    onchange={handleChange}
  />
  <span class="radio-custom"></span>
  <span class="radio-label">
    <slot />
  </span>
</label>

<style lang="scss">
  @use "../styles/components/radio" as *;
</style>
