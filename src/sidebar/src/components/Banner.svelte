<script lang="ts">
  import {
    X,
    CircleAlert,
    Info,
    CheckCircle,
    AlertTriangle,
    ChevronUp,
    ChevronDown,
  } from "lucide-svelte";
  import { slide } from "svelte/transition";
  import type { ComponentType, Snippet } from "svelte";

  interface Props {
    variant?: "info" | "success" | "warning" | "error";
    message: string;
    icon?: ComponentType;
    dismissible?: boolean;
    onDismiss?: () => void;
    confirmLabel?: string;
    onConfirm?: () => void;
    class?: string;
    children?: Snippet;
    onclick?: () => void;
    isExpandable?: boolean;
    expanded?: boolean;
    loading?: boolean;
    disabled?: boolean;
  }

  const {
    variant = "info",
    message,
    icon,
    dismissible = false,
    onDismiss,
    confirmLabel,
    onConfirm,
    class: className = "",
    children,
    onclick,
    isExpandable = false,
    expanded = false,
    loading = false,
    disabled = false,
  }: Props = $props();

  const icons = {
    info: Info,
    success: CheckCircle,
    warning: AlertTriangle,
    error: CircleAlert,
  };

  const Icon = icon || icons[variant];
</script>

<div
  class="banner {variant} {className}"
  class:clickable={!!onclick && !loading}
  class:loading
  transition:slide
  role={onclick ? "button" : "status"}
  tabindex={onclick && !loading ? 0 : -1}
  onclick={loading ? undefined : onclick}
  onkeydown={(e) =>
    onclick && !loading && (e.key === "Enter" || e.key === " ") && onclick()}
>
  <div class="banner-content">
    <div class="message-row">
      <Icon class="icon" size="16" />
      <span class="message">{message}</span>
      {#if isExpandable}
        <div class="expand-icon">
          {#if expanded}
            <ChevronUp size="14" />
          {:else}
            <ChevronDown size="14" />
          {/if}
        </div>
      {/if}
    </div>

    {#if children}
      <div class="details-row">
        {@render children()}
      </div>
    {/if}

    {#if onConfirm && confirmLabel}
      <div class="actions-row">
        <button
          class="btn-confirm"
          disabled={loading || disabled}
          onclick={(e) => {
            e.stopPropagation();
            if (!loading && !disabled) onConfirm();
          }}
        >
          {loading ? "Please wait..." : confirmLabel}
        </button>
      </div>
    {/if}
  </div>

  {#if dismissible && onDismiss}
    <button
      class="btn-dismiss"
      disabled={loading}
      onclick={(e) => {
        e.stopPropagation();
        if (!loading) onDismiss();
      }}
      title="Dismiss"
    >
      <X size="14" />
    </button>
  {/if}
</div>

<style lang="scss">
  @use "../styles/components/banner" as *;
</style>
