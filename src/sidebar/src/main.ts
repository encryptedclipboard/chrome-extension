import { mount } from "svelte";
import App from "./App.svelte";

function initApp() {
  const target = document.getElementById("app");

  if (!target) {
    return;
  }

  try {
    const app = mount(App, { target });
    return app;
  } catch (_) {}
}

// Ensure DOM is ready before mounting
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
