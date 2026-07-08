<script lang="ts">
  import { tick } from "svelte";
  import { X, Calendar, RotateCcw, Trash2, Check } from "lucide-svelte";
  import Toggle from "./Toggle.svelte";
  import Spinner from "./Spinner.svelte";
  import { ClipboardItemType } from "@shared/services/clipboard-db.service";
  import { clipboardDBService } from "@shared/services";
  import "@/styles/components/filter-modal.scss";

  interface FilterState {
    dateFrom: number | null;
    dateTo: number | null;
    selectedTypes: Set<ClipboardItemType>;
    showFavoritesOnly: boolean;
    showSyncedOnly: boolean;
  }

  interface Props {
    show: boolean;
    filterState: FilterState;
    onApply: (filters: FilterState) => void;
    onClose: () => void;
  }

  const { show, filterState, onApply, onClose }: Props = $props();

  let dateFrom = $state<number | null>(filterState.dateFrom);
  let dateTo = $state<number | null>(filterState.dateTo);
  let selectedTypes = $state<Set<ClipboardItemType>>(
    new Set(filterState.selectedTypes),
  );
  let showFavoritesOnly = $state(filterState.showFavoritesOnly);
  let showSyncedOnly = $state(filterState.showSyncedOnly);

  let dateFromInput = $state<HTMLInputElement>();
  let dateToInput = $state<HTMLInputElement>();
  let modalRef = $state<HTMLDivElement>();
  let previousFocus = $state<HTMLElement | null>(null);

  let matchCount = $state<number | null>(null);
  let isCounting = $state(false);
  let countTimeout: ReturnType<typeof setTimeout> | null = null;

  const STORAGE_KEY = "clipboard_filters";

  const typeOptions: { type: ClipboardItemType; label: string }[] = [
    { type: ClipboardItemType.TEXT, label: "Text" },
    { type: ClipboardItemType.IMAGE, label: "Image" },
    { type: ClipboardItemType.MARKDOWN, label: "MD" },
    { type: ClipboardItemType.HTML, label: "HTML" },
    { type: ClipboardItemType.JSON, label: "JSON" },
    { type: ClipboardItemType.ENV, label: "ENV" },
    { type: ClipboardItemType.SSH_KEY, label: "SSH Key" },
    { type: ClipboardItemType.URL, label: "URL" },
    { type: ClipboardItemType.PHONE, label: "Phone" },
    { type: ClipboardItemType.EMAIL, label: "Email" },
    { type: ClipboardItemType.IP, label: "IP" },
    { type: ClipboardItemType.OTP, label: "OTP" },
    { type: ClipboardItemType.EMOJI, label: "Emoji" },
  ];

  function formatDate(timestamp: number | null): string {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toISOString().split("T")[0];
  }

  function parseDate(dateStr: string): number | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function getEndOfDay(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  }

  const datePresets: {
    label: string;
    action: () => void;
    isActive: () => boolean;
  }[] = [
    {
      label: "Today",
      action: () => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        dateFrom = now.getTime();
        dateTo = getEndOfDay(now.getTime());
      },
      isActive: () => {
        if (!dateFrom || !dateTo) return false;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return (
          dateFrom === now.getTime() && dateTo === getEndOfDay(now.getTime())
        );
      },
    },
    {
      label: "This Week",
      action: () => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);
        dateFrom = startOfWeek.getTime();
        dateTo = getEndOfDay(now.getTime());
      },
      isActive: () => {
        if (!dateFrom) return false;
        const now = new Date();
        const dayOfWeek = now.getDay();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);
        return dateFrom === startOfWeek.getTime();
      },
    },
    {
      label: "This Month",
      action: () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);
        dateFrom = startOfMonth.getTime();
        dateTo = getEndOfDay(now.getTime());
      },
      isActive: () => {
        if (!dateFrom) return false;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);
        return dateFrom === startOfMonth.getTime();
      },
    },
    {
      label: "Last 7 Days",
      action: () => {
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        dateFrom = sevenDaysAgo.getTime();
        dateTo = now.getTime();
      },
      isActive: () => {
        if (!dateFrom || !dateTo) return false;
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        return dateFrom === sevenDaysAgo.getTime();
      },
    },
    {
      label: "Last 30 Days",
      action: () => {
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        dateFrom = thirtyDaysAgo.getTime();
        dateTo = now.getTime();
      },
      isActive: () => {
        if (!dateFrom || !dateTo) return false;
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        return dateFrom === thirtyDaysAgo.getTime();
      },
    },
    {
      label: "All Time",
      action: () => {
        dateFrom = null;
        dateTo = null;
      },
      isActive: () => !dateFrom && !dateTo,
    },
  ];

  async function updateMatchCount() {
    if (countTimeout) clearTimeout(countTimeout);
    countTimeout = setTimeout(async () => {
      isCounting = true;
      try {
        matchCount = await clipboardDBService.getFilteredCount({
          selectedTypes,
          showFavoritesOnly,
          showSyncedOnly,
          dateFrom,
          dateTo,
        });
      } catch (e) {
        console.error("[FilterModal] Count error:", e);
      } finally {
        isCounting = false;
      }
    }, 300);
  }

  function toggleType(type: ClipboardItemType) {
    if (selectedTypes.has(type)) {
      selectedTypes.delete(type);
    } else {
      selectedTypes.add(type);
    }
    selectedTypes = new Set(selectedTypes);
  }

  function clearTypes() {
    selectedTypes.clear();
    selectedTypes = new Set();
  }

  function handleApply() {
    const filters: FilterState = {
      dateFrom,
      dateTo,
      selectedTypes,
      showFavoritesOnly,
      showSyncedOnly,
    };

    saveFiltersToStorage(filters);
    onApply(filters);
    onClose();
  }

  function handleClearAndApply() {
    handleClearFilters();
    handleApply();
  }

  function handleClearFilters() {
    dateFrom = null;
    dateTo = null;
    selectedTypes = new Set();
    showFavoritesOnly = false;
    showSyncedOnly = false;
  }

  function handleReset() {
    dateFrom = filterState.dateFrom;
    dateTo = filterState.dateTo;
    selectedTypes = new Set(filterState.selectedTypes);
    showFavoritesOnly = filterState.showFavoritesOnly;
    showSyncedOnly = filterState.showSyncedOnly;
  }

  function saveFiltersToStorage(filters: FilterState) {
    const storageData = {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      selectedTypes: Array.from(filters.selectedTypes),
      showFavoritesOnly: filters.showFavoritesOnly,
      showSyncedOnly: filters.showSyncedOnly,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
  }

  function loadFiltersFromStorage(): FilterState {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        return {
          dateFrom: data.dateFrom ?? null,
          dateTo: data.dateTo ?? null,
          selectedTypes: new Set(data.selectedTypes || []),
          showFavoritesOnly: data.showFavoritesOnly ?? false,
          showSyncedOnly: data.showSyncedOnly ?? false,
        };
      }
    } catch (e) {
      console.error("[FilterModal] Failed to load filters from storage:", e);
    }
    return {
      dateFrom: null,
      dateTo: null,
      selectedTypes: new Set(),
      showFavoritesOnly: false,
      showSyncedOnly: false,
    };
  }

  $effect(() => {
    if (show) {
      const stored = loadFiltersFromStorage();
      dateFrom = stored.dateFrom;
      dateTo = stored.dateTo;
      selectedTypes = new Set(stored.selectedTypes);
      showFavoritesOnly = stored.showFavoritesOnly;
      showSyncedOnly = stored.showSyncedOnly;
      matchCount = null;

      tick().then(() => {
        previousFocus = document.activeElement as HTMLElement;
        const firstFocusable = modalRef?.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        firstFocusable?.focus();
      });
    } else {
      if (countTimeout) clearTimeout(countTimeout);
      previousFocus?.focus();
    }
  });

  $effect(() => {
    if (show) {
      void dateFrom;
      void dateTo;
      void selectedTypes;
      void showFavoritesOnly;
      void showSyncedOnly;
      updateMatchCount();
    }
  });

  function handleDateFromChange(e: Event) {
    const target = e.target as HTMLInputElement;
    dateFrom = parseDate(target.value);
  }

  function handleDateToChange(e: Event) {
    const target = e.target as HTMLInputElement;
    dateTo = parseDate(target.value);
  }

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleFocusTrap(e: KeyboardEvent) {
    if (e.key !== "Tab" || !modalRef) return;

    const focusable = modalRef.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }

  function handlePresetKeydown(e: KeyboardEvent, index: number) {
    const presets =
      modalRef?.querySelectorAll<HTMLButtonElement>(".preset-btn");
    if (!presets) return;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = presets[index + 1] || presets[0];
      next?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = presets[index - 1] || presets[presets.length - 1];
      prev?.focus();
    }
  }

  function handleToggleKeydown(e: KeyboardEvent, index: number) {
    const toggles =
      modalRef?.querySelectorAll<HTMLButtonElement>(".toggle-btn");
    if (!toggles) return;
    const cols = 6;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = toggles[index + 1] || toggles[0];
      next?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = toggles[index - 1] || toggles[toggles.length - 1];
      prev?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = toggles[index + cols] || toggles[index];
      next?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = toggles[index - cols] || toggles[index];
      prev?.focus();
    }
  }

  const activeFilterCount = $derived(() => {
    let count = 0;
    if (dateFrom || dateTo) count += 1;
    if (selectedTypes.size > 0) count += selectedTypes.size;
    if (showFavoritesOnly) count += 1;
    if (showSyncedOnly) count += 1;
    return count;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
  <div class="dark dark-contents">
    <div
      class="filter-modal-wrapper modal-overlay"
      onclick={handleBackdropClick}
      role="dialog"
      tabindex="0"
      aria-modal="true"
      aria-labelledby="filter-modal-title"
      aria-describedby="filter-modal-desc"
    >
      <div class="modal" bind:this={modalRef} onkeydown={handleFocusTrap}>
        <div class="modal-header">
          <h3 id="filter-modal-title">Filters</h3>
          <div class="header-right">
            <button
              class="close-btn"
              onclick={onClose}
              aria-label="Close filters"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div class="modal-body" id="filter-modal-desc">
          <div class="filter-section" role="group" aria-labelledby="type-label">
            <div class="section-header" id="type-label">
              <span>Type</span>
            </div>
          </div>

          <div class="type-toggles" role="group" aria-label="Item type filters">
            <button
              class="toggle-btn"
              class:active={selectedTypes.size === 0}
              onclick={clearTypes}
              onkeydown={(e) => handleToggleKeydown(e, 0)}
            >
              All
            </button>
            {#each typeOptions as option, i}
              <button
                class="toggle-btn"
                class:active={selectedTypes.has(option.type)}
                onclick={() => toggleType(option.type)}
                onkeydown={(e) => handleToggleKeydown(e, i + 1)}
              >
                {option.label}
              </button>
            {/each}
          </div>

          <div
            class="filter-section"
            role="group"
            aria-labelledby="date-range-label"
          >
            <div class="section-header" id="date-range-label">
              <Calendar size={14} />
              <span>Date Range</span>
            </div>

            <div
              class="date-presets"
              role="toolbar"
              aria-label="Date range presets"
            >
              {#each datePresets as preset, i}
                <button
                  class="preset-btn"
                  class:active={preset.isActive()}
                  onclick={preset.action}
                  onkeydown={(e) => handlePresetKeydown(e, i)}
                >
                  {preset.label}
                </button>
              {/each}
            </div>

            <div class="date-inputs">
              <div class="date-input-group">
                <label for="date-from">From</label>
                <input
                  type="date"
                  id="date-from"
                  bind:this={dateFromInput}
                  value={formatDate(dateFrom)}
                  onchange={handleDateFromChange}
                />
              </div>
              <div class="date-input-group">
                <label for="date-to">To</label>
                <input
                  type="date"
                  id="date-to"
                  bind:this={dateToInput}
                  value={formatDate(dateTo)}
                  onchange={handleDateToChange}
                />
              </div>
            </div>
          </div>

          <div
            class="filter-section"
            role="group"
            aria-labelledby="status-label"
          >
            <div class="section-header" id="status-label">
              <span>Status</span>
            </div>

            <div class="status-toggles">
              <label class="toggle-label">
                <Toggle
                  checked={showFavoritesOnly}
                  onChange={(checked) => {
                    showFavoritesOnly = checked;
                  }}
                  title="Show only favorites"
                />
                <span>Favorites</span>
              </label>

              <label class="toggle-label">
                <Toggle
                  checked={showSyncedOnly}
                  onChange={(checked) => {
                    showSyncedOnly = checked;
                  }}
                  title="Show only synced items"
                />
                <span>Synced</span>
              </label>
            </div>
          </div>

          <div class="match-count" aria-live="polite" aria-atomic="true">
            {#if isCounting}
              <Spinner size={14} />
              <span>Counting...</span>
            {:else if matchCount !== null}
              <span>{matchCount} item{matchCount !== 1 ? "es" : ""} match</span>
            {/if}
          </div>
        </div>

        <div class="modal-footer">
          <div class="footer-actions">
            <button class="btn btn-danger cancel-btn" onclick={handleReset}>
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              class="btn btn-secondary clear-btn"
              onclick={handleClearAndApply}
            >
              <Trash2 size={14} />
              Clear Filters
              {#if activeFilterCount() > 0}
                <span class="filter-count">{activeFilterCount()}</span>
              {/if}
            </button>
            <button class="btn btn-primary apply-btn" onclick={handleApply}>
              <Check size={14} />
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
