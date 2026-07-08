import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import checker from "vite-plugin-checker";
import path from "node:path";
import fs from "node:fs";

// Determine target browser from environment variable
const TARGET_BROWSER = process.env.TARGET_BROWSER || "chrome";

const CSP_POLYFILL = `if(typeof global==='undefined'){(function(){if(typeof window!=='undefined'&&window.trustedTypes){var original=window.trustedTypes.createPolicy.bind(window.trustedTypes);var cache=new Map();window.trustedTypes.createPolicy=function(name,rules){if(cache.has(name))return cache.get(name);try{var p=original(name,rules);cache.set(name,p);return p;}catch(e){var pt={createHTML:function(s){return s;},createScript:function(s){return s;},createScriptURL:function(s){return s;}};cache.set(name,pt);return pt;}};}})()}globalThis.global=globalThis;`;

function cspPolyfillPlugin(): Plugin {
  return {
    name: "csp-polyfill",
    apply: "build" as const,
    writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) return;
      const jsFiles = fs
        .readdirSync(outDir)
        .filter((f) => f.endsWith(".js") && !f.startsWith("chunks/"));
      for (const file of jsFiles) {
        const filePath = path.join(outDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        fs.writeFileSync(filePath, CSP_POLYFILL + content);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    svelte({
      compilerOptions: {
        customElement: false,
        css: "injected",
      },
    }),
    checker({
      typescript: true,
      overlay: false,
      enableBuild: true,
    }),
    cspPolyfillPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/"),
      "@config": path.resolve(__dirname, "../config"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  build: {
    cssCodeSplit: true,
    target: "es2020",
    rollupOptions: {
      input: {
        "clipboard-palette": path.resolve(__dirname, "src/main.ts"),
      },
      output: {
        format: "iife",
        dir: `../../build/${TARGET_BROWSER}/clipboard-palette`,
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name].[ext]",
        name: "ClipboardPalette",
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  esbuild: {
    charset: "ascii",
    drop:
      process.env.NODE_ENV === "production"
        ? ["console", "debugger"]
        : ["debugger"],
  },
});
