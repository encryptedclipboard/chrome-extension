<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState, Compartment } from "@codemirror/state";
  import { markdown } from "@codemirror/lang-markdown";
  import { json } from "@codemirror/lang-json";
  import { html } from "@codemirror/lang-html";
  import { javascript } from "@codemirror/lang-javascript";
  import { python } from "@codemirror/lang-python";
  import { css } from "@codemirror/lang-css";
  import { rust } from "@codemirror/lang-rust";
  import { go } from "@codemirror/lang-go";
  import { php } from "@codemirror/lang-php";
  import { StreamLanguage } from "@codemirror/language";
  import { shell } from "@codemirror/legacy-modes/mode/shell";
  import { csharp } from "@codemirror/legacy-modes/mode/clike";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { keymap } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

  type SupportedLang =
    | "markdown"
    | "json"
    | "html"
    | "bash"
    | "text"
    | "javascript"
    | "typescript"
    | "python"
    | "css"
    | "rust"
    | "go"
    | "php"
    | "csharp";

  interface Props {
    value: string;
    lang: SupportedLang;
    readonly?: boolean;
    height?: string;
    fontSize?: number;
  }

  let {
    value = $bindable(),
    lang,
    readonly = false,
    height = "400px",
    fontSize = 14,
  }: Props = $props();

  let editorElement: HTMLElement;
  let view: EditorView;
  const fontSizeTheme = new Compartment();
  const languageCompartment = new Compartment();

  function getLanguageExtension(l: SupportedLang) {
    if (l === "markdown") return markdown();
    if (l === "json") return json();
    if (l === "html") return html();
    if (l === "bash") return StreamLanguage.define(shell);
    if (l === "javascript") return javascript();
    if (l === "typescript") return javascript({ typescript: true });
    if (l === "python") return python();
    if (l === "css") return css();
    if (l === "rust") return rust();
    if (l === "go") return go();
    if (l === "php") return php();
    if (l === "csharp") return StreamLanguage.define(csharp);
    return [];
  }

  function getFontSizeStyle(size: number) {
    return EditorView.theme({
      "&": { height, maxHeight: height },
      ".cm-scroller": { overflow: "auto" },
      ".cm-content, .cm-gutter": { fontSize: `${size}px` },
    });
  }

  onMount(() => {
    const startState = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        oneDark,
        languageCompartment.of(getLanguageExtension(lang)),
        EditorView.lineWrapping,
        fontSizeTheme.of(getFontSizeStyle(fontSize)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            value = update.state.doc.toString();
          }
        }),
        EditorView.editable.of(!readonly),
      ],
    });

    view = new EditorView({
      state: startState,
      parent: editorElement,
    });
  });

  onDestroy(() => {
    view?.destroy();
  });

  // Handle external value updates (if any)
  $effect(() => {
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  });

  // Handle font size updates
  $effect(() => {
    if (view) {
      view.dispatch({
        effects: fontSizeTheme.reconfigure(getFontSizeStyle(fontSize)),
      });
    }
  });

  // Handle language changes
  $effect(() => {
    if (view) {
      view.dispatch({
        effects: languageCompartment.reconfigure(getLanguageExtension(lang)),
      });
    }
  });
</script>

<div bind:this={editorElement} class="codemirror-wrapper"></div>

<style lang="scss">
  @use "../styles/components/code-mirror-editor" as *;
</style>
