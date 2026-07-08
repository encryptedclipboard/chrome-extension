<script lang="ts">
  const { size = 18 }: { size?: number } = $props();
</script>

<div class="spinner" style="width: {size}px; height: {size}px;"></div>

<style lang="scss">
  .spinner {
    border: 2px solid rgb(255, 255, 255, 0.1);
    border-top-color: hsl(145deg, 100%, 60%);
    border-radius: 50%;
    corner-shape: round;
    box-sizing: border-box;
    animation: spin 1s linear infinite;
    flex-shrink: 0;
    margin-left: 8px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
