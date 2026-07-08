/**
 * Svelte Action for teleporting an element to another part of the DOM.
 */
export function teleport(
  node: HTMLElement,
  target: string | HTMLElement = "body",
) {
  const targetEl =
    typeof target === "string" ? document.querySelector(target) : target;

  if (!targetEl) {
    console.warn(`[Teleport] Target element "${target}" not found.`);
    return;
  }

  targetEl.appendChild(node);

  return {
    destroy() {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    },
  };
}
