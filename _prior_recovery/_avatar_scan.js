const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LIVE = {
  gorgon: "b0a53fa04f3661e66f6d45a7935d94f0",
  phoenix: "dab69b561a9d935fc9720a6696c67d6c",
  griffin: "c9f06010f283080bacc3a7ff64586b92",
  amphiptere: "288320dee7dc0bf9371dea4683d32c0f",
};
const NAMES = Object.keys(LIVE);

function md5(p) {
  const h = crypto.createHash("md5");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}

function creatureOf(p) {
  const l = p.toLowerCase();
  return NAMES.find((n) => l.includes(n)) || null;
}

function isImg(n) {
  return /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(n);
}

function walk(dir, maxDepth, depth, onFile) {
  if (depth > maxDepth) return;
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of ents) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, maxDepth, depth + 1, onFile);
    else if (ent.isFile()) onFile(p, ent.name);
  }
}

function meta(p) {
  const s = fs.statSync(p);
  const h = md5(p);
  const c = creatureOf(p);
  return {
    path: p,
    size: s.size,
    md5: h,
    mtime: s.mtime.toISOString(),
    ctime: s.birthtime.toISOString(),
    creature: c,
    sameAsLive: c ? LIVE[c] === h : false,
  };
}

const out = { assetsNamed: [], candidatesDifferent: [], candidatesSame: [], locations: {} };

// assets all name matches any ext
const assets = "C:\\\\Users\\\\autum\\\\.cursor\\\\projects\\\\c-Users-autum-Projects-LorePath\\\\assets";
if (fs.existsSync(assets)) {
  for (const f of fs.readdirSync(assets)) {
    if (NAMES.some((n) => f.toLowerCase().includes(n))) {
      out.assetsNamed.push(meta(path.join(assets, f)));
    }
  }
}

const searchRoots = [
  ["public_avatars", "C:\\\\Users\\\\autum\\\\Projects\\\\LorePath\\\\public\\\\avatars", 2],
  ["prior_recovery", "C:\\\\Users\\\\autum\\\\Projects\\\\LorePath\\\\_prior_recovery", 6],
  ["assets", assets, 2],
  ["agent_tools", "C:\\\\Users\\\\autum\\\\.cursor\\\\projects\\\\c-Users-autum-Projects-LorePath\\\\agent-tools", 4],
  ["next_cache", "C:\\\\Users\\\\autum\\\\Projects\\\\LorePath\\\\.next\\\\cache", 10],
  ["next_root_images", "C:\\\\Users\\\\autum\\\\Projects\\\\LorePath\\\\.next", 8],
];

for (const [label, root, depth] of searchRoots) {
  out.locations[label] = { exists: fs.existsSync(root), files: [] };
  if (!fs.existsSync(root)) continue;
  walk(root, depth, 0, (p, name) => {
    const c = creatureOf(p) || creatureOf(name);
    const want =
      (c && isImg(name)) ||
      (label.startsWith("next") && isImg(name) && fs.statSync(p).size > 50000) ||
      (label === "prior_recovery" && isImg(name) && fs.statSync(p).size > 50000);
    if (!want) return;
    const m = meta(p);
    out.locations[label].files.push(m);
    if (m.creature && !m.sameAsLive) out.candidatesDifferent.push(m);
    else if (m.creature && m.sameAsLive) out.candidatesSame.push(m);
  });
}

// Cursor History entries.json
const histRoot = "C:\\\\Users\\\\autum\\\\AppData\\\\Roaming\\\\Cursor\\\\User\\\\History";
out.history = { exists: fs.existsSync(histRoot), folders: [] };
if (fs.existsSync(histRoot)) {
  for (const folder of fs.readdirSync(histRoot)) {
    const ep = path.join(histRoot, folder, "entries.json");
    if (!fs.existsSync(ep)) continue;
    let t;
    try {
      t = fs.readFileSync(ep, "utf8");
    } catch {
      continue;
    }
    const found = NAMES.filter((n) => t.toLowerCase().includes(n));
    if (!found.length && !/avatars|gorgon|phoenix|griffin|amphiptere/i.test(t)) continue;
    const files = fs.readdirSync(path.join(histRoot, folder));
    const bins = files.filter((f) => f !== "entries.json");
    const imgBins = bins.filter((f) => isImg(f) || !f.includes("."));
    out.history.folders.push({
      id: folder,
      found: found.length ? found : ["path-match"],
      resource: t.slice(0, 600),
      files: bins,
      imageLike: imgBins,
    });
  }
}

fs.writeFileSync(
  "C:\\\\Users\\\\autum\\\\Projects\\\\LorePath\\\\_prior_recovery\\\\_avatar_scan_report.json",
  JSON.stringify(out, null, 2)
);
console.log("WROTE report");
console.log("assetsNamed", out.assetsNamed.length);
console.log("diff candidates", out.candidatesDifferent.length);
console.log("history folders", out.history.folders.length);
console.log(
  JSON.stringify(
    {
      assetsNamed: out.assetsNamed,
      different: out.candidatesDifferent,
      priorFiles: out.locations.prior_recovery && out.locations.prior_recovery.files,
      nextCount:
        out.locations.next_cache && out.locations.next_cache.files
          ? out.locations.next_cache.files.length
          : 0,
      history: out.history.folders.map((h) => ({
        id: h.id,
        found: h.found,
        files: h.files,
        imageLike: h.imageLike,
      })),
    },
    null,
    2
  )
);
