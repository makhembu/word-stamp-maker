/* eslint-disable */
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const devCerts = require("office-addin-dev-certs");

const fs = require("fs");

const HOST = "localhost";
const PORT = 3000;

// Where the add-in will be served from when distributed. Set BUILD_URL when building
// for release, e.g. BUILD_URL=https://yourname.github.io/stamp-maker npm run build
const BASE_URL = (process.env.BUILD_URL || "https://localhost:3000").replace(/\/+$/, "");

async function getHttpsOptions() {
  const httpsOptions = await devCerts.getHttpsServerOptions();
  return { ca: httpsOptions.ca, key: httpsOptions.key, cert: httpsOptions.cert };
}

module.exports = async (env, argv) => {
  const isDev = argv.mode !== "production";
  if (!isDev && !process.env.BUILD_URL) {
    console.warn(
      "⚠  BUILD_URL not set — manifest.xml will still point to https://localhost:3000.\n" +
      "    Set BUILD_URL=https://your.host/path when building for distribution."
    );
  }
  return {
    entry: { taskpane: "./src/taskpane.ts", commands: "./src/commands.ts" },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      clean: true,
    },
    devtool: isDev ? "source-map" : false,
    resolve: { extensions: [".ts", ".js"] },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane.html",
        chunks: ["taskpane"],
      }),
      new HtmlWebpackPlugin({
        filename: "commands.html",
        template: "./src/commands.html",
        chunks: ["commands"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: "assets", to: "assets" },
          { from: "src/index.html", to: "index.html" },
        ],
      }),
      // Emit dist/manifest.xml with every localhost URL rewritten to BASE_URL, so the
      // built folder is directly deployable and the manifest can be handed to users.
      {
        apply(compiler) {
          compiler.hooks.emit.tapAsync("StampMakerManifest", (compilation, callback) => {
            try {
              const src = fs.readFileSync(path.resolve(__dirname, "manifest.xml"), "utf8");
              const out = src.split("https://localhost:3000").join(BASE_URL);
              compilation.assets["manifest.xml"] = {
                source: () => out,
                size: () => Buffer.byteLength(out),
              };
            } catch (err) {
              compilation.errors.push(new Error(`Failed to emit manifest.xml: ${err.message}`));
            }
            callback();
          });
        },
      },
    ],
    devServer: {
      host: HOST,
      port: PORT,
      static: { directory: path.resolve(__dirname, "dist") },
      server: isDev
        ? { type: "https", options: await getHttpsOptions() }
        : undefined,
      hot: true,
      headers: { "Access-Control-Allow-Origin": "*" },
      allowedHosts: "all",
    },
  };
};
