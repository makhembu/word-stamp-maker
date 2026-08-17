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
      // Emit dist/sitemap.xml at the site root so Google Search Console has a sitemap
      // to point at (Sitemaps -> sitemap.xml).
      {
        apply(compiler) {
          compiler.hooks.emit.tapAsync("StampMakerSitemap", (compilation, callback) => {
            try {
              const xml =
                `<?xml version="1.0" encoding="UTF-8"?>\n` +
                `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
                `  <url>\n` +
                `    <loc>${BASE_URL}/</loc>\n` +
                `    <changefreq>weekly</changefreq>\n` +
                `    <priority>1.0</priority>\n` +
                `  </url>\n` +
                `</urlset>\n`;
              compilation.assets["sitemap.xml"] = {
                source: () => xml,
                size: () => Buffer.byteLength(xml),
              };
            } catch (err) {
              compilation.errors.push(new Error(`Failed to emit sitemap.xml: ${err.message}`));
            }
            callback();
          });
        },
      },
      // Emit dist/robots.txt pointing crawlers at the sitemap (GitHub Pages serves
      // no robots.txt by default, so Google needs this hint to find the sitemap).
      {
        apply(compiler) {
          compiler.hooks.emit.tapAsync("StampMakerRobots", (compilation, callback) => {
            try {
              const robots =
                `User-agent: *\n` +
                `Allow: /\n` +
                `\n` +
                `Sitemap: ${BASE_URL}/sitemap.xml\n`;
              compilation.assets["robots.txt"] = {
                source: () => robots,
                size: () => Buffer.byteLength(robots),
              };
            } catch (err) {
              compilation.errors.push(new Error(`Failed to emit robots.txt: ${err.message}`));
            }
            callback();
          });
        },
      },
      // Rewrite __BASE_URL__ placeholders in the copied landing page so the canonical
      // URL, og:url, og:image, and JSON-LD all point at the real deployed origin.
      {
        apply(compiler) {
          compiler.hooks.emit.tapAsync("StampMakerIndexRewrite", (compilation, callback) => {
            try {
              const asset = compilation.assets["index.html"];
              if (asset) {
                const out = asset.source().toString().split("__BASE_URL__").join(BASE_URL);
                compilation.assets["index.html"] = {
                  source: () => out,
                  size: () => Buffer.byteLength(out),
                };
              }
            } catch (err) {
              compilation.errors.push(new Error(`Failed to rewrite index.html: ${err.message}`));
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
