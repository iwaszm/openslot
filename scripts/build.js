const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.resolve(root, process.env.OPENSLOT_BUILD_DIR || "dist");
const turnstileSiteKey = process.env.OPENSLOT_TURNSTILE_SITE_KEY || "0x4AAAAAAEsrM-tkdjA40QZH";
const buildId = `${process.env.CF_PAGES_COMMIT_SHA || "local"}-${Date.now().toString(36)}`;
const shops = JSON.parse(fs.readFileSync(path.join(root, "config", "shops.json"), "utf8"));
const debug = (...values) => { if (process.env.OPENSLOT_BUILD_DEBUG) console.log(...values); };

const requiredEnv = ["OPENSLOT_SUPABASE_URL", "OPENSLOT_SUPABASE_ANON_KEY"];
const missing = requiredEnv.filter((key) => !process.env[key]);

validateTemplateIsolation();

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

fs.rmSync(dist, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
fs.mkdirSync(dist, { recursive: true });
debug("build: initialized", dist);

for (const file of [
  "booking-theme.js",
  "customer.js",
  "admin.js",
  "confirm-dialog.js",
  "i18n.js",
  "robots.txt",
  "sitemap.xml",
]) {
  copyFile(file);
}

for (const file of ["index.html", "home.css", "home.js", "home-i18n.js", "site.webmanifest"]) {
  copyFile(path.join("home", file), file);
}
copyFile(path.join("home", "assets", "icons", "favicon.ico"), "favicon.ico");

for (const dir of ["datenschutz", "stornierung", ...shops.map((shop) => shop.slug)]) {
  debug("build: copying", dir);
  copyDir(dir);
}
debug("build: copying shared sources");
copyDir("shared");
copyDir("src");
copyDir("styles");
copyDir(path.join("home", "assets"), path.join("assets", "home"));
replaceTurnstileSiteKeys(dist);
debug("build: stamping assets");
stampJavaScriptModuleImports();
stampAdminAssetUrls();
stampCustomerAssetUrls();
stampSettingsAssetUrls();
writeShopManifests();
debug("build: complete");

writeFile(
  "config.js",
  `window.OPENSLOT_SUPABASE = ${JSON.stringify(
    {
      url: process.env.OPENSLOT_SUPABASE_URL,
      anonKey: process.env.OPENSLOT_SUPABASE_ANON_KEY,
      turnstileSiteKey,
      vapidPublicKey: process.env.OPENSLOT_VAPID_PUBLIC_KEY || "",
      buildId,
    },
    null,
    2,
  )};\n`,
);

writeFile("version.json", `${JSON.stringify({ buildId })}\n`);

writeFile(
  "_redirects",
  `/lisa /lisa/index.html 200
/lisa/admin /lisa/admin/index.html 200
/lisa/settings /lisa/settings/index.html 200
/demo /demo/index.html 200
/demo/admin /demo/admin/index.html 200
/demo/settings /demo/settings/index.html 200
/liyong /demo 301
/liyong/admin /demo/admin 301
/stornierung /stornierung/index.html 200
`,
);

function copyFile(relativePath, outputPath = relativePath) {
  const target = path.join(dist, outputPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, relativePath), target);
}

function copyDir(relativePath, outputPath = relativePath) {
  fs.cpSync(path.join(root, relativePath), path.join(dist, outputPath), {
    recursive: true,
  });
}

function writeFile(relativePath, content) {
  const target = path.join(dist, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function stampAdminAssetUrls() {
  for (const salon of shops.map((shop) => shop.slug)) {
    const file = path.join(dist, salon, "admin", "index.html");
    const html = fs.readFileSync(file, "utf8");
    let count = 0;
    const updated = html.replace(/((?:src|href)=")(\.\.\/\.\.\/(?:config\.js|admin\.js|shared\/(?:admin-pwa\.js|admin-push\.js)|styles\/(?:shared\/theme-presets\.css|admin\/(?:admin\.css|pwa\.css))))(?:\?v=[^"]+)?"/g, (_match, prefix, asset) => {
      count += 1;
      return `${prefix}${asset}?v=${buildId}"`;
    });
    const expectedCount = 7;
    if (count !== expectedCount) throw new Error(`Expected ${expectedCount} admin assets in ${file}, found ${count}`);
    fs.writeFileSync(file, updated, "utf8");
  }
}

function stampCustomerAssetUrls() {
  for (const salon of shops.map((shop) => shop.slug)) {
    const file = path.join(dist, salon, "index.html");
    const html = fs.readFileSync(file, "utf8");
    let count = 0;
    const updated = html.replace(/((?:src|href)="\.\.\/(?:customer\.js|booking-theme\.js|styles\/(?:shared\/(?:base\.css|theme-presets\.css)|booking\/booking\.css)))(?:\?v=[^"]+)?"/g, (_match, asset) => {
      count += 1;
      return `${asset}?v=${buildId}"`;
    });
    if (count !== 5) throw new Error(`Expected five booking assets in ${file}, found ${count}`);
    fs.writeFileSync(file, updated, "utf8");
  }
}

function stampSettingsAssetUrls() {
  for (const salon of shops.map((shop) => shop.slug)) {
    const file = path.join(dist, salon, "settings", "index.html");
    const html = fs.readFileSync(file, "utf8");
    let count = 0;
    const updated = html.replace(/((?:src|href)="\.\.\/\.\.\/(?:config\.js|shared\/settings-ui\.js|styles\/(?:shared\/theme-presets\.css|settings\/settings\.css)))(?:\?v=[^"]+)?"/g, (_match, asset) => {
      count += 1;
      return `${asset}?v=${buildId}"`;
    });
    if (count !== 4) throw new Error(`Expected four settings assets in ${file}, found ${count}`);
    fs.writeFileSync(file, updated, "utf8");
  }
}

function writeShopManifests() {
  for (const shop of shops) {
    writeFile(path.join(shop.slug, "admin", "manifest.webmanifest"), `${JSON.stringify({
      id: `/${shop.slug}/admin/`,
      name: shop.pwaName,
      short_name: shop.pwaShortName,
      description: shop.pwaDescription,
      start_url: `/${shop.slug}/admin/`,
      scope: `/${shop.slug}/admin/`,
      display: "standalone",
      theme_color: "#202020",
      background_color: "#ffffff",
      icons: [
        { src: "./icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "./icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    }, null, 2)}\n`);
  }
}

function stampJavaScriptModuleImports() {
  const files = [
    path.join(dist, "customer.js"),
    path.join(dist, "admin.js"),
    path.join(dist, "shared", "settings-ui.js"),
  ];
  collectModuleFiles(path.join(dist, "src"), files);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const updated = source.replace(
      /(from\s+["'])(\.\.?\/[^"']+\.mjs)(?:\?v=[^"']+)?(["'])/g,
      `$1$2?v=${buildId}$3`,
    );
    fs.writeFileSync(file, updated, "utf8");
  }
}

function collectModuleFiles(directory, files) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectModuleFiles(entryPath, files);
    else if (entry.name.endsWith(".mjs")) files.push(entryPath);
  }
}

function replaceTurnstileSiteKeys(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      replaceTurnstileSiteKeys(entryPath);
      continue;
    }
    if (!entry.name.endsWith(".html")) continue;
    const html = fs.readFileSync(entryPath, "utf8");
    fs.writeFileSync(
      entryPath,
      html.replace(/data-sitekey="[^"]*"/g, `data-sitekey="${escapeHtmlAttribute(turnstileSiteKey)}"`),
      "utf8",
    );
  }
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function validateTemplateIsolation() {
  const forbidden = ["../config.js", "/config.js", "supabase-js", "challenges.cloudflare.com"];
  for (const file of ["index.html", "admin.html", "settings.html"]) {
    const source = fs.readFileSync(path.join(root, "template", file), "utf8").toLowerCase();
    for (const marker of forbidden) {
      if (source.includes(marker)) {
        throw new Error(`Template isolation failed: template/${file} references ${marker}`);
      }
    }
  }
}
