<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Quill from "quill";

  let {
    value = $bindable(""),
    height = "300px",
    theme = "light",
    ontextChange,
  }: {
    value?: string;
    height?: string;
    theme?: "light" | "dark";
    ontextChange?: (detail: { html: string; text: string }) => void;
  } = $props();

  let editorElement = $state<HTMLDivElement>();
  let quill: Quill | null = $state(null);
  let isInternalUpdate = $state(false);

  const imageHandler = function (this: any) {
    const range = this.quill.getSelection();
    const url = prompt("Enter image URL:");
    if (url) {
      this.quill.insertEmbed(range.index, "image", url, "user");
    }
  };

  const toolbarOptions = [
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["link", "image"],
    ["clean"],
  ];

  onMount(() => {
    if (!editorElement) return;
    const q = new Quill(editorElement, {
      theme: "snow",
      modules: {
        toolbar: {
          container: toolbarOptions,
          handlers: {
            image: imageHandler,
          },
        },
        history: {
          delay: 500,
          maxStack: 100,
          userOnly: true,
        },
      },
    });

    if (value) {
      q.clipboard.dangerouslyPasteHTML(value, "user");
    }

    q.on("text-change", () => {
      isInternalUpdate = true;
      try {
        const html = q.getSemanticHTML();
        const text = q.getText().trim();
        value = html;
        ontextChange?.({ html, text });
      } finally {
        isInternalUpdate = false;
      }
    });

    quill = q;
  });

  onDestroy(() => {
    if (quill) {
      quill.off("text-change");
    }
  });

  $effect(() => {
    if (quill && !isInternalUpdate) {
      const current = quill.getSemanticHTML();
      if (current !== value) {
        quill.clipboard.dangerouslyPasteHTML(value || "", "user");
      }
    }
  });
</script>

<div
  class="quill-premium-wrapper"
  class:dark-mode={theme === "dark"}
  style="--editor-height: {height}"
>
  <div bind:this={editorElement} class="quill-editor"></div>
</div>

<style lang="scss">
  @use "../styles/components/quill-editor" as *;
</style>
