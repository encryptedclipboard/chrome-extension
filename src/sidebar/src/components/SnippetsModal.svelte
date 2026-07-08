<script lang="ts">
  import { onMount, tick } from "svelte";
  import { X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import QuillEditor from "./QuillEditor.svelte";
  import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
  import "@/styles/components/edit-clipboard-modal.scss";
  import type { SnippetItem } from "@shared/types/snippets.types";

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
    { value: "text", label: "Plain Text" },
  ] as const;

  interface Props {
    mode: "add" | "edit";
    snippetType: "text" | "code";
    initialKeyword?: string;
    initialSnippet?: string;
    initialRichContent?: string;
    initialCodeLanguage?: string;
    existingKeywords?: SnippetItem[];
    editId?: string;
    onsave: (
      keyword: string,
      snippet: string,
      richContent: string | undefined,
      type: "text" | "code",
      codeLanguage: string | undefined,
    ) => void;
    oncancel: () => void;
  }

  const {
    mode,
    snippetType,
    initialKeyword = "",
    initialSnippet = "",
    initialRichContent = "",
    initialCodeLanguage,
    existingKeywords = [],
    editId,
    onsave,
    oncancel,
  }: Props = $props();

  let keyword = $state(initialKeyword);
  let richContent = $state(initialRichContent || initialSnippet);
  let snippetPlain = $state(initialSnippet);
  let keywordInputRef = $state<HTMLInputElement>();
  let error = $state("");
  let selectedLanguage = $state<string>(initialCodeLanguage || "javascript");

  const keywordDuplicate = $derived(
    keyword.trim().length > 0 &&
      existingKeywords.some(
        (i) => i.keyword === keyword.trim() && i.id !== editId,
      ),
  );

  onMount(() => {
    tick().then(() => {
      keywordInputRef?.focus();
      if (mode === "add") {
        keywordInputRef?.select();
      }
    });
  });

  function handleTextChange(detail: { html: string; text: string }) {
    snippetPlain = detail.text;
    richContent = detail.html;
  }

  function handleSave() {
    if (!keyword.trim()) {
      error = "Keyword is required";
      return;
    }
    if (keywordDuplicate) {
      toast.error(`Keyword /${keyword} already exists`);
      return;
    }
    if (!snippetPlain?.trim()) {
      error = "Snippet is required";
      return;
    }
    onsave(
      keyword.trim(),
      snippetPlain?.trim() || "",
      (snippetType === "text" && richContent?.trim()) || undefined,
      snippetType,
      snippetType === "code" ? selectedLanguage : undefined,
    );
  }

  function handleCancel() {
    oncancel();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) handleCancel();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") handleCancel();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
  }
</script>

<div
  class="modal-overlay edit-clipboard-modal-wrapper"
  role="dialog"
  aria-modal="true"
  onclick={handleOverlayClick}
  onkeydown={handleKeydown}
>
  <div class="modal-content" tabindex="-1">
    <div class="modal-header">
      <h2>
        {mode === "add"
          ? snippetType === "code"
            ? "New Code Snippet"
            : "New Keyword"
          : snippetType === "code"
            ? "Edit Code Snippet"
            : "Edit Keyword"}
      </h2>
      <div class="header-right">
        <button
          onclick={handleCancel}
          class="close-btn"
          aria-label="Close modal"
        >
          <X size={16} />
        </button>
      </div>
    </div>

    <div class="modal-body">
      <div class="field-group">
        <label for="keyword-input">Keyword</label>
        <div class="input-wrapper">
          <span class="prefix">/</span>
          <input
            id="keyword-input"
            bind:this={keywordInputRef}
            bind:value={keyword}
            type="text"
            class="input-field has-prefix"
            class:input-error={keywordDuplicate}
            placeholder="e.g. addr"
          />
        </div>
        {#if keywordDuplicate}
          <p class="field-error">Keyword /{keyword} is already in use</p>
        {:else}
          <p class="hint">Type /{keyword || "keyword"} to expand</p>
        {/if}
      </div>

      <div class="field-group editor-group">
        {#if snippetType === "code"}
          <div class="language-selector">
            <label for="lang-select">Language</label>
            <select
              id="lang-select"
              bind:value={selectedLanguage}
              class="lang-select"
            >
              {#each LANGUAGES as lang}
                <option value={lang.value}>{lang.label}</option>
              {/each}
            </select>
          </div>
          <label for="snippet-input">Snippet</label>
          <div class="code-editor-container">
            <CodeMirrorEditor
              bind:value={snippetPlain}
              lang={selectedLanguage as any}
              height="300px"
            />
          </div>
        {:else}
          <label for="snippet-input">Snippet</label>
          <div class="rich-editor-container">
            <QuillEditor
              bind:value={richContent}
              height="300px"
              theme="dark"
              ontextChange={handleTextChange}
            />
          </div>
        {/if}
      </div>

      {#if error}
        <div class="error-message">{error}</div>
      {/if}
    </div>

    <div class="modal-footer">
      <div class="footer-spacer"></div>
      <div class="footer-buttons">
        <button class="btn btn-danger" onclick={handleCancel} type="button">
          Cancel
        </button>
        <button class="btn btn-primary" onclick={handleSave} type="button">
          {mode === "add" ? "Add" : "Save"}
        </button>
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  @use "../styles/theme" as *;
  @use "../styles/components/snippets-modal" as *;
</style>
