import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import checker from "vite-plugin-checker";
import path from "node:path";

// Determine target browser from environment variable
const TARGET_BROWSER = process.env.TARGET_BROWSER || "chrome";

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    svelte(),
    checker({
      typescript: true,
      overlay: {
        initialIsOpen: false,
        position: "br",
      },
      enableBuild: true,
    }),
  ],
  server: {
    fs: {
      allow: [path.resolve(__dirname, "../../../")],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/"),
      "@config": path.resolve(__dirname, "../config"),
      "@shared": path.resolve(__dirname, "../shared"),
      axios: path.resolve(__dirname, "node_modules/axios/index.js"),
    },
  },
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        sidebar: path.resolve(__dirname, "index.html"),
      },
      output: {
        format: "es",
        dir: `../../build/${TARGET_BROWSER}/sidebar`,
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name].[ext]",
        // Prevent Lodash's CSP-unsafe Function("return this")() by providing global
        banner: "if(typeof global==='undefined'){globalThis.global=globalThis}",
      },
    },
    // Configure esbuild to output ASCII-only for Chrome content script compatibility
    minify: "esbuild",
    target: "es2020",
    // Increase chunk-size warning limit (in KB) to avoid noisy warnings for large bundles
    chunkSizeWarningLimit: 1500,
  },
  // Top-level esbuild options (transform/minify). Keep charset configured and add drop.
  esbuild: {
    // Ensure all non-ASCII characters are escaped as \uXXXX
    charset: "ascii",
    // Drop console and debugger in production only
    drop:
      process.env.NODE_ENV === "production"
        ? ["console", "debugger"]
        : ["debugger"],
  },
});
