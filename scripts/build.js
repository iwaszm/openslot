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
  "index.html",
  "home.css",
  "home.js",
  "home-i18n.js",
  "styles.css",
  "customer.js",
  "admin.js",
  "confirm-dialog.js",
  "i18n.js",
]) {
  copyFile(file);
}

for (const dir of ["assets", "datenschutz", "stornierung", "lisa", "liyong"]) {
  copyDir(dir);
}
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
/liyong /liyong/index.html 200
/liyong/admin /liyong/admin/index.html 200
/stornierung /stornierung/index.html 200
`,
);

function copyFile(relativePath) {
  fs.copyFileSync(path.join(root, relativePath), path.join(dist, relativePath));
}

function copyDir(relativePath) {
  fs.cpSync(path.join(root, relativePath), path.join(dist, relativePath), {
    recursive: true,
  });
}

function writeFile(relativePath, content) {
  const target = path.join(dist, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function stampAdminAssetUrls() {
  for (const salon of ["lisa", "liyong"]) {
    const file = path.join(dist, salon, "admin", "index.html");
    const html = fs.readFileSync(file, "utf8");
    let count = 0;
    const updated = html.replace(/((?:src|href)=")(\.\.\/\.\.\/(?:config\.js|admin\.js|styles\.css)|\.\/(?:pwa\.js|pwa\.css|push\.js))(?:\?v=[^"]+)?"/g, (_match, prefix, asset) => {
      count += 1;
      return `${prefix}${asset}?v=${buildId}"`;
    });
    const expectedCount = salon === "lisa" ? 5 : 6;
    if (count !== expectedCount) throw new Error(`Expected ${expectedCount} admin assets in ${file}, found ${count}`);
    fs.writeFileSync(file, updated, "utf8");
  }
}

function stampCustomerAssetUrls() {
  for (const salon of ["lisa", "liyong"]) {
    const file = path.join(dist, salon, "index.html");
    const html = fs.readFileSync(file, "utf8");
    let count = 0;
    const updated = html.replace(/((?:src)="\.\.\/customer\.js)(?:\?v=[^"]+)?"/g, (_match, asset) => {
      count += 1;
      return `${asset}?v=${buildId}"`;
    });
    if (count !== 1) throw new Error(`Expected one customer.js asset in ${file}, found ${count}`);
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
