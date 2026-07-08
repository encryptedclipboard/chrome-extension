<script lang="ts">
  import { ClipboardItemType } from "@shared/services/clipboard-db.service";

  interface Props {
    text: string;
    itemType: string;
  }

  const { text, itemType }: Props = $props();

  type SegmentType = "text" | "url" | "email";

  interface Segment {
    type: SegmentType;
    value: string;
  }

  function parseSegments(input: string, type: string): Segment[] {
    if (!input) return [];

    const segments: Segment[] = [];
    const isLinkable =
      type === ClipboardItemType.URL || type === ClipboardItemType.EMAIL;

    if (!isLinkable) {
      segments.push({ type: "text", value: input });
      return segments;
    }

    const urlRegex = /((https?:\/\/|www\.)[^\s<>"\']+)/g;
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g;

    let match;

    const allMatches: {
      type: SegmentType;
      value: string;
      index: number;
      length: number;
    }[] = [];

    while ((match = urlRegex.exec(input)) !== null) {
      allMatches.push({
        type: "url",
        value: match[0],
        index: match.index,
        length: match[0].length,
      });
    }

    while ((match = emailRegex.exec(input)) !== null) {
      allMatches.push({
        type: "email",
        value: match[0],
        index: match.index,
        length: match[0].length,
      });
    }

    allMatches.sort((a, b) => a.index - b.index);

    let lastIndex = 0;
    for (const m of allMatches) {
      if (m.index > lastIndex) {
        segments.push({ type: "text", value: input.slice(lastIndex, m.index) });
      }
      segments.push({ type: m.type, value: m.value });
      lastIndex = m.index + m.length;
    }

    if (lastIndex < input.length) {
      segments.push({ type: "text", value: input.slice(lastIndex) });
    }

    if (segments.length === 0) {
      segments.push({ type: "text", value: input });
    }

    return segments;
  }

  const segments = $derived(parseSegments(text, itemType));

  function handleLinkClick(e: MouseEvent, value: string, type: SegmentType) {
    e.preventDefault();
    e.stopPropagation();

    let url: string;
    if (type === "email") {
      url = `mailto:${value}`;
    } else {
      url = value.startsWith("www.") ? `http://${value}` : value;
    }

    chrome.tabs.create({ url }).catch(() => {
      window.open(url, "_blank");
    });
  }
</script>

{#each segments as segment}
  {#if segment.type === "text"}
    <span>{segment.value}</span>
  {:else}
    <a
      href={segment.type === "email"
        ? `mailto:${segment.value}`
        : segment.value.startsWith("www.")
          ? `http://${segment.value}`
          : segment.value}
      onclick={(e) => handleLinkClick(e, segment.value, segment.type)}
      >{segment.value}</a
    >
  {/if}
{/each}
