const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const turnstileSiteKey = process.env.OPENSLOT_TURNSTILE_SITE_KEY || "0x4AAAAAAEsrM-tkdjA40QZH";
const buildId = `${process.env.CF_PAGES_COMMIT_SHA || "local"}-${Date.now().toString(36)}`;

const requiredEnv = ["OPENSLOT_SUPABASE_URL", "OPENSLOT_SUPABASE_ANON_KEY"];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of [
  "styles.css",
  "booking-theme.css",
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

for (const dir of ["datenschutz", "stornierung", "lisa", "demo"]) {
  copyDir(dir);
}
copyDir(path.join("home", "assets"), path.join("assets", "home"));
replaceTurnstileSiteKeys(dist);
stampAdminAssetUrls();
stampCustomerAssetUrls();

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
/demo /demo/index.html 200
/demo/admin /demo/admin/index.html 200
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
  for (const salon of ["lisa", "demo"]) {
    const file = path.join(dist, salon, "admin", "index.html");
    const html = fs.readFileSync(file, "utf8");
    let count = 0;
    const updated = html.replace(/((?:src|href)=")(\.\.\/\.\.\/(?:config\.js|admin\.js|styles\.css)|\.\/(?:pwa\.js|pwa\.css|push\.js))(?:\?v=[^"]+)?"/g, (_match, prefix, asset) => {
      count += 1;
      return `${prefix}${asset}?v=${buildId}"`;
    });
    const expectedCount = 5;
    if (count !== expectedCount) throw new Error(`Expected ${expectedCount} admin assets in ${file}, found ${count}`);
    fs.writeFileSync(file, updated, "utf8");
  }
}

function stampCustomerAssetUrls() {
  for (const salon of ["lisa", "demo"]) {
    const file = path.join(dist, salon, "index.html");
    const html = fs.readFileSync(file, "utf8");
    let count = 0;
    const updated = html.replace(/((?:src|href)="\.\.\/(?:customer\.js|booking-theme\.css|booking-theme\.js))(?:\?v=[^"]+)?"/g, (_match, asset) => {
      count += 1;
      return `${asset}?v=${buildId}"`;
    });
    if (count !== 3) throw new Error(`Expected three booking assets in ${file}, found ${count}`);
    fs.writeFileSync(file, updated, "utf8");
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
