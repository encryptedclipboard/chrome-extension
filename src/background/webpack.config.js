const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

// Determine target browser from environment variable
const TARGET_BROWSER = process.env.TARGET_BROWSER || "chrome";
const OUTPUT_DIR = path.resolve(__dirname, "../../build", TARGET_BROWSER);

module.exports = {
  mode: process.env.NODE_ENV || "production",
  entry: {
    background: "./src/index.ts",
    "crypto.worker": "../shared/utils/crypto.worker.ts",
    "content/auth-sync": "../content/auth-sync.ts",
    "content/element-picker": "../content/element-picker.ts",
    "content/github-url-copy": "../content/github-url-copy.ts",
    "content/linkedin-url-copy": "../content/linkedin-url-copy.ts",
    "content/twitter-url-copy": "../content/twitter-url-copy.ts",
    "content/youtube-url-copy": "../content/youtube-url-copy.ts",
    "content/ahrefs-backlinks-csv": "../content/ahrefs-backlinks-csv.ts",
    "content/snippets": "../content/snippets.ts",
    "content/snippets-inject": "../content/snippets-inject.ts",
    "offscreen/offscreen": "../offscreen/offscreen.ts",
  },
  output: {
    path: OUTPUT_DIR,
    filename: "[name].js",
    clean: false, // Don't clean build, other builds use it
    charset: true,
    libraryTarget: TARGET_BROWSER === "firefox" ? "umd" : undefined,
    globalObject: TARGET_BROWSER === "firefox" ? "this" : undefined,
    environment: {
      arrowFunction: true,
      const: true,
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "ts-loader",
        options: {
          configFile: "tsconfig.json",
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js", ".json"],
    // Add modules to ensure shared utils can find dependencies in the extension's node_modules
    modules: [path.resolve(__dirname, "../../node_modules"), "node_modules"],
    alias: {
      "@": path.resolve(__dirname, ".."),
      "@config": path.resolve(__dirname, "../config"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          parse: {
            ecma: 2020,
          },
          compress: {
            ecma: 2020,
            // Drop console logs in production only
            drop_console: process.env.NODE_ENV !== "development",
            drop_debugger: process.env.NODE_ENV !== "development",
            passes: 2,
          },
          mangle: {
            safari10: true,
            reserved: [
              "CryptoEngine",
              "PBKDF2_ITERATIONS",
              "SALT_LENGTH",
              "IV_LENGTH",
              "KEY_LENGTH",
              "encryptData",
              "decryptData",
              "hashPassword",
              "deriveKeyFromPassword",
              "validatePasswordStrength",
              "encryptPasswordForStorage",
              "decryptPasswordFromStorage",
              "encryptPasswordWithPin",
              "decryptPasswordWithPin",
            ],
          },
          format: {
            ecma: 2020,
            ascii_only: true,
            comments: process.env.NODE_ENV !== "development",
          },
        },
        extractComments: false,
      }),
    ],
  },
  performance: {
    maxAssetSize: 500000,
    maxEntrypointSize: 500000,
    hints: "warning",
  },
  devtool: false, // No source maps for background
};
