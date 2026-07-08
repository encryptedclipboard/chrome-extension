<script lang="ts">
  import { onMount } from "svelte";
  import {
    Trash2,
    Edit2,
    Plus,
    Zap,
    Code,
    FileText,
    ChevronDown,
    Search,
    X,
  } from "lucide-svelte";
  import { snippetsDBService } from "@shared/services";
  import { toast } from "svelte-sonner";
  import type { SnippetItem } from "@shared/types/snippets.types";
  import type { KeyboardShortcut } from "@shared/types/shortcut.types";
  import {
    DEFAULT_FILTER_SHORTCUT,
    STORAGE_KEY_FILTER_SHORTCUT,
  } from "@shared/types/shortcut.types";
  import SnippetsModal from "./SnippetsModal.svelte";
  import ConfirmModal from "./ConfirmModal.svelte";
  import Spinner from "./Spinner.svelte";

  let items = $state<SnippetItem[]>([]);
  let isLoading = $state(true);
  let isLoadingMore = $state(false);
  let offset = $state(0);
  let hasMore = $state(true);
  let listContainer: HTMLDivElement;
  const PAGE_SIZE = 50;

  let activeTypes = $state<Set<"text" | "code">>(new Set(["text", "code"]));
  const typeFilter = $derived<"text" | "code" | undefined>(
    activeTypes.size === 2 ? undefined : [...activeTypes][0],
  );

  let showTypeDropdown = $state(false);
  let editingSnippetType = $state<"text" | "code">("text");

  let showModal = $state(false);
  let modalMode = $state<"add" | "edit">("add");
  let selectedItem = $state<SnippetItem | null>(null);

  let showDeleteModal = $state(false);
  let itemToDelete = $state<SnippetItem | null>(null);

  // Search state
  let searchQuery = $state(localStorage.getItem("snippets_search_query") || "");
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;
  let searchInput: HTMLInputElement;

  // Keyboard shortcut for search focus
  let filterShortcut = $state<KeyboardShortcut>(DEFAULT_FILTER_SHORTCUT);

  // Total count for stats
  let totalCount = $state(0);

  // Language filter state
  let selectedLanguage = $state<string | undefined>(undefined);

  const LANGUAGES = [
    { value: "javascript", label: "JavaScript" },
    { value: "typescript", label: "TypeScript" },
    { value: "python", label: "Python" },
    { value: "html", label: "HTML" },
    { value: "css", label: "CSS" },
    { value: "bash", label: "Bash" },
    { value: "markdown", label: "Markdown" },
    { value: "rust", label: "Rust" },
    { value: "go", label: "Go" },
    { value: "php", label: "PHP" },
    { value: "csharp", label: "C#" },
  ] as const;

  function timeAgo(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  const LANGUAGE_LABELS: Record<string, string> = {
    javascript: "JavaScript",
    typescript: "TypeScript",
    python: "Python",
    html: "HTML",
    css: "CSS",
    bash: "Bash",
    markdown: "Markdown",
    rust: "Rust",
    go: "Go",
    php: "PHP",
    csharp: "C#",
    text: "Plain Text",
  };

  function getLanguageLabel(value: string | undefined): string {
    return value ? LANGUAGE_LABELS[value] || value : "Code";
  }

  function countLabel(item: SnippetItem): string {
    if (item.type === "code") {
      const n = item.snippet.split("\n").length;
      return `${n} line${n !== 1 ? "s" : ""}`;
    }
    const n = item.snippet.split(/\s+/).filter(Boolean).length;
    return `${n} word${n !== 1 ? "s" : ""}`;
  }

  const LANG_MAP: Record<string, string> = {
    js: "javascript",
    javascript: "javascript",
    ts: "typescript",
    typescript: "typescript",
    py: "python",
    python: "python",
    php: "php",
    html: "html",
    css: "css",
    bash: "bash",
    sh: "bash",
    md: "markdown",
    markdown: "markdown",
    rust: "rust",
    rs: "rust",
    go: "go",
    golang: "go",
    csharp: "csharp",
    "c#": "csharp",
  };

  function parseSnippetSearch(query: string): {
    typeFilter?: "text" | "code";
    codeLanguageFilter?: string;
    keyword: string;
  } {
    const trimmed = query.trim();
    const match = trimmed.match(/^@(\w+):\s*(.*)/);
    if (match) {
      const prefix = match[1].toLowerCase();
      const rest = match[2].trim();
      if (prefix === "text" || prefix === "txt")
        return { typeFilter: "text", keyword: rest };
      if (prefix === "code") return { typeFilter: "code", keyword: rest };
      if (LANG_MAP[prefix])
        return {
          typeFilter: "code",
          codeLanguageFilter: LANG_MAP[prefix],
          keyword: rest,
        };
    }
    return { keyword: trimmed };
  }

  function handleSearchChange() {
    localStorage.setItem("snippets_search_query", searchQuery);
    const parsed = parseSnippetSearch(searchQuery);
    if (parsed.typeFilter) {
      activeTypes = new Set([parsed.typeFilter]);
    } else if (!searchQuery.trim()) {
      activeTypes = new Set(["text", "code"]);
    }
    if (parsed.codeLanguageFilter) {
      selectedLanguage = parsed.codeLanguageFilter;
    } else if (!parsed.codeLanguageFilter && !searchQuery.trim()) {
      selectedLanguage = undefined;
    }
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadItems(true), 300);
  }

  function clearSearch() {
    searchQuery = "";
    localStorage.setItem("snippets_search_query", "");
    activeTypes = new Set(["text", "code"]);
    selectedLanguage = undefined;
    loadItems(true);
  }

  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    isLoading = false;
    await loadItems(true);
    await loadFilterShortcut();
  });

  async function loadFilterShortcut() {
    try {
      const data = await chrome.storage.local.get([
        STORAGE_KEY_FILTER_SHORTCUT,
      ]);
      if (data[STORAGE_KEY_FILTER_SHORTCUT]) {
        filterShortcut = data[STORAGE_KEY_FILTER_SHORTCUT] as KeyboardShortcut;
      }
    } catch (error) {
      console.error("[SnippetsPage] Failed to load filter shortcut:", error);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === "/") {
      event.preventDefault();
      if (searchInput) {
        searchInput.focus();
      }
    }
  }

  function isNearBottom(): boolean {
    if (!listContainer) return false;
    return (
      listContainer.scrollTop + listContainer.clientHeight >=
      listContainer.scrollHeight - 100
    );
  }

  function handleScroll() {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;
      if (isNearBottom()) {
        loadItems(false);
      }
    }, 150);
  }

  async function loadItems(reset = true) {
    if (isLoading || isLoadingMore) return;
    if (!reset && !hasMore) return;

    if (reset) {
      if (items.length === 0) isLoading = true;
      offset = 0;
      hasMore = true;
      if (listContainer) listContainer.scrollTo({ top: 0 });
    } else {
      isLoadingMore = true;
    }

    try {
      const parsed = parseSnippetSearch(searchQuery);
      const effectiveType = parsed.typeFilter ?? typeFilter;
      const effectiveLanguage = selectedLanguage ?? parsed.codeLanguageFilter;

      const [newItems, count] = await Promise.all([
        snippetsDBService.searchItemsPaginated(PAGE_SIZE, offset, {
          type: effectiveType,
          codeLanguage: effectiveLanguage,
          keyword: parsed.keyword,
        }),
        reset
          ? snippetsDBService.searchCount({
              type: effectiveType,
              codeLanguage: effectiveLanguage,
              keyword: parsed.keyword,
            })
          : Promise.resolve(undefined),
      ]);

      if (count !== undefined) totalCount = count;

      if (newItems.length < PAGE_SIZE) hasMore = false;
      offset += newItems.length;

      if (reset) {
        items = newItems;
      } else {
        const existingIds = new Set(items.map((i) => i.id));
        const filtered = newItems.filter((i) => !existingIds.has(i.id));
        items = [...items, ...filtered];
      }

      if (!reset && hasMore && isNearBottom()) {
        loadItems(false);
      }
    } catch (e) {
      toast.error("Failed to load snippets");
    } finally {
      isLoading = false;
      isLoadingMore = false;
    }
  }

  function toggleType(t: "text" | "code") {
    const parsed = parseSnippetSearch(searchQuery);
    if (parsed.typeFilter || parsed.codeLanguageFilter) {
      searchQuery = "";
      localStorage.setItem("snippets_search_query", "");
    }
    const next = new Set(activeTypes);
    if (next.has(t)) {
      if (next.size > 1) {
        next.delete(t);
        activeTypes = next;
        if (t === "text") selectedLanguage = undefined;
        loadItems(true);
      }
    } else {
      next.add(t);
      activeTypes = next;
      if (t === "text") selectedLanguage = undefined;
      loadItems(true);
    }
  }

  function toggleLanguage(lang: string | undefined) {
    if (selectedLanguage === lang) {
      selectedLanguage = undefined;
    } else {
      selectedLanguage = lang;
    }
    loadItems(true);
  }

  function openAddModal(snippetType: "text" | "code") {
    selectedItem = null;
    modalMode = "add";
    editingSnippetType = snippetType;
    showModal = true;
  }

  function openEditModal(item: SnippetItem) {
    selectedItem = item;
    modalMode = "edit";
    editingSnippetType = item.type || "text";
    showModal = true;
  }

  function openDeleteModal(item: SnippetItem) {
    itemToDelete = item;
    showDeleteModal = true;
  }

  async function handleSave(
    keyword: string,
    snippet: string,
    richContent: string | undefined,
    snippetType: "text" | "code",
    codeLanguage: string | undefined,
  ) {
    try {
      if (modalMode === "edit" && selectedItem) {
        const isDuplicate = items.some(
          (i) => i.keyword === keyword && i.id !== selectedItem!.id,
        );
        if (isDuplicate) throw new Error(`Keyword /${keyword} already exists`);

        const updates: Partial<SnippetItem> = {
          keyword,
          snippet,
          type: snippetType,
        };
        if (richContent !== undefined) updates.richContent = richContent;
        if (codeLanguage !== undefined) updates.codeLanguage = codeLanguage;
        await snippetsDBService.updateItem(selectedItem.id, updates);
        toast.success("Keyword updated");
      } else {
        const isDuplicate = items.some((i) => i.keyword === keyword);
        if (isDuplicate) throw new Error(`Keyword /${keyword} already exists`);

        const item = await snippetsDBService.addItem(
          keyword,
          snippet,
          snippetType,
          codeLanguage,
        );
        if (snippetType === "text" && richContent) {
          await snippetsDBService.updateItem(item.id, { richContent });
        }
        toast.success("Keyword added");
      }
      showModal = false;
      await loadItems(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
  }

  async function handleDelete() {
    if (!itemToDelete) return;
    try {
      await snippetsDBService.deleteItem(itemToDelete.id);
      toast.success("Keyword deleted");
      await loadItems(true);
    } catch (e) {
      toast.error("Failed to delete");
    } finally {
      showDeleteModal = false;
      itemToDelete = null;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="page-container">
  <div class="header-section">
    <div class="text-content">
      <div class="title-row">
        <h3>Snippets</h3>
      </div>
      <p>Type <code>/[keyword]</code> anywhere to expand text instantly.</p>
    </div>
    <div class="add-dropdown-wrapper">
      <button
        class="btn btn-primary add-btn"
        onclick={() => (showTypeDropdown = !showTypeDropdown)}
      >
        <Plus size="16" class="mr-2" />
        <span>Add New</span>
        <ChevronDown size="14" />
      </button>
      {#if showTypeDropdown}
        <div
          class="add-dropdown-overlay"
          onclick={() => (showTypeDropdown = false)}
        />
        <div class="dropdown-menu">
          <button
            onclick={() => {
              showTypeDropdown = false;
              openAddModal("text");
            }}
            class="dropdown-item"
          >
            <FileText size="16" />
            <span>Text Snippet</span>
          </button>
          <button
            onclick={() => {
              showTypeDropdown = false;
              openAddModal("code");
            }}
            class="dropdown-item"
          >
            <Code size="16" />
            <span>Code Snippet</span>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <div class="search-row">
    <div class="search-bar">
      <Search size="14" />
      <input
        type="text"
        placeholder="Search snippets..."
        maxlength="500"
        bind:value={searchQuery}
        bind:this={searchInput}
        oninput={handleSearchChange}
      />
      {#if searchQuery}
        <button class="clear-search visible" onclick={clearSearch}>
          <X size="14" />
        </button>
      {/if}
    </div>
  </div>
  <div class="search-hint">
    Tip: Type <code>@code:</code>, <code>@text:</code>,
    <code>@js:</code>, <code>@python:</code> etc. to filter.
  </div>

  <div class="filter-bar">
    <button
      class="filter-btn"
      class:active={activeTypes.has("text")}
      onclick={() => toggleType("text")}
    >
      <FileText size="14" />
      <span>Text</span>
    </button>
    <button
      class="filter-btn"
      class:active={activeTypes.has("code")}
      onclick={() => toggleType("code")}
    >
      <Code size="14" />
      <span>Code</span>
    </button>
  </div>

  {#if activeTypes.has("code") && !activeTypes.has("text")}
    <div class="language-filter-bar">
      <button
        class="lang-filter-btn"
        class:active={!selectedLanguage}
        onclick={() => toggleLanguage(undefined)}>All</button
      >
      {#each LANGUAGES as lang (lang.value)}
        <button
          class="lang-filter-btn"
          class:active={selectedLanguage === lang.value}
          onclick={() => toggleLanguage(lang.value)}>{lang.label}</button
        >
      {/each}
    </div>
  {/if}

  <div class="stats-bar">
    {#if searchQuery || activeTypes.size < 2 || selectedLanguage}
      {items.length} of {totalCount} matching items
    {:else}
      {totalCount} items
    {/if}
  </div>

  <div class="content-area" bind:this={listContainer} onscroll={handleScroll}>
    {#if isLoading}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading snippets...</p>
      </div>
    {:else if items.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <Zap class="w-10 h-10 text-muted" />
        </div>
        <h4>No snippets yet</h4>
      </div>
    {:else}
      <div class="keywords-list">
        {#each items as item (item.id)}
          <div class="keyword-item" class:is-code={item.type === "code"}>
            <div class="keyword-header">
              <div class="header-left">
                <span class="prefix">/</span>
                <span class="keyword-key">{item.keyword}</span>
                <span class="type-badge" class:code-type={item.type === "code"}>
                  {#if item.type === "code"}
                    <Code size="12" />
                    <span>{getLanguageLabel(item.codeLanguage)}</span>
                  {:else}
                    <FileText size="12" />
                    <span>Text</span>
                  {/if}
                </span>
              </div>

              <div class="header-right">
                <span class="word-count">{countLabel(item)}</span>
                <span class="time-ago">{timeAgo(item.createdAt)}</span>
              </div>

              <div class="item-actions">
                <button
                  class="action-btn"
                  onclick={() => openEditModal(item)}
                  aria-label="Edit"
                  title="Edit"
                >
                  <Edit2 size="14" class="icon" />
                </button>
                <button
                  class="action-btn delete"
                  onclick={() => openDeleteModal(item)}
                  aria-label="Delete"
                  title="Delete"
                >
                  <Trash2 size="14" class="icon" />
                </button>
              </div>
            </div>

            <div class="snippet-content" title={item.snippet}>
              {item.snippet}
            </div>
          </div>
        {/each}
      </div>

      {#if isLoadingMore}
        <div class="loading-more">
          <Spinner size={16} />
          <span>Loading more...</span>
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if showModal}
  <SnippetsModal
    mode={modalMode}
    snippetType={editingSnippetType}
    initialKeyword={selectedItem?.keyword}
    initialSnippet={selectedItem?.snippet}
    initialRichContent={selectedItem?.richContent}
    initialCodeLanguage={selectedItem?.codeLanguage}
    existingKeywords={items}
    editId={selectedItem?.id}
    onsave={handleSave}
    oncancel={() => (showModal = false)}
  />
{/if}

<ConfirmModal
  show={showDeleteModal}
  title="Delete Keyword?"
  message={`Are you sure you want to delete /${itemToDelete?.keyword}?`}
  variant="danger"
  confirmText="Delete"
  onConfirm={handleDelete}
  onCancel={() => (showDeleteModal = false)}
/>

<style lang="scss">
  @use "../styles/theme" as *;
  @use "../styles/components/snippets-page" as *;
</style>
