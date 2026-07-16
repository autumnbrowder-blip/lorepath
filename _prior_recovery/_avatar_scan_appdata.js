const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const NAMES = ["gorgon", "phoenix", "griffin", "amphiptere"];
const LIVE = {
  gorgon: "b0a53fa04f3661e66f6d45a7935d94f0",
  phoenix: "dab69b561a9d935fc9720a6696c67d6c",
  griffin: "c9f06010f283080bacc3a7ff64586b92",
  amphiptere: "288320dee7dc0bf9371dea4683d32c0f",
};

function md5(p) {
  const h = crypto.createHash("md5");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
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
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, maxDepth, depth + 1, onFile);
    else if (ent.isFile()) onFile(p, ent.name);
  }
}

function isImg(n) {
  return /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(n);
}

const findings = [];
function consider(label, p) {
  try {
    const s = fs.statSync(p);
    if (s.size < 20000) return;
    const h = md5(p);
    const low = p.toLowerCase();
    const creature = NAMES.find((n) => low.includes(n)) || null;
    const same = creature ? LIVE[creature] === h : false;
    findings.push({
      label,
      path: p,
      size: s.size,
      md5: h,
      mtime: s.mtime.toISOString(),
      ctime: s.birthtime.toISOString(),
      creature,
      sameAsLive: same,
    });
  } catch (e) {
    findings.push({ label, path: p, error: e.message });
  }
}

const roots = [
  ["LocalCursor", path.join(process.env.LOCALAPPDATA, "Cursor"), 6],
  ["RoamingCursorUser", path.join(process.env.APPDATA, "Cursor", "User"), 5],
  ["TEMP", process.env.TEMP, 3],
  ["TMP", process.env.TMP, 3],
  ["workspaceStorage", path.join(process.env.APPDATA, "Cursor", "User", "workspaceStorage"), 6],
  ["agentTools", "C:\\\\Users\\\\autum\\\\.cursor\\\\projects\\\\c-Users-autum-Projects-LorePath\\\\agent-tools", 3],
  ["cursorProjectsAssets", "C:\\\\Users\\\\autum\\\\.cursor\\\\projects\\\\c-Users-autum-Projects-LorePath\\\\assets", 2],
];

const nameHits = [];
const generateHits = [];
const largeJpgHits = [];

for (const [label, root, depth] of roots) {
  console.log("SCAN", label, root, "exists", fs.existsSync(root));
  if (!fs.existsSync(root)) continue;
  walk(root, depth, 0, (p, name) => {
    const low = (name + " " + p).toLowerCase();
    if (NAMES.some((n) => low.includes(n)) && isImg(name)) {
      nameHits.push([label, p]);
      consider(label + "_named", p);
    }
    if (/generateimage|generated.?image|image.?cache/i.test(low) && isImg(name)) {
      generateHits.push([label, p]);
      consider(label + "_gen", p);
    }
    // large jpgs recently modified today that might be orphans
    if (/\.jpe?g$/i.test(name)) {
      try {
        const s = fs.statSync(p);
        if (s.size > 800000 && s.mtime > new Date("2026-07-15T00:00:00")) {
          largeJpgHits.push({ label, p, size: s.size, mtime: s.mtime.toISOString() });
        }
      } catch {}
    }
  });
}

// Recycle Bin for this user SIDs
const rb = "C:\\\\$Recycle.Bin";
console.log("Recycle exists", fs.existsSync(rb));
const recycleHits = [];
if (fs.existsSync(rb)) {
  walk(rb, 4, 0, (p, name) => {
    const low = name.toLowerCase();
    if (NAMES.some((n) => low.includes(n)) || /\.(jpe?g|png|webp)$/i.test(name)) {
      try {
        const s = fs.statSync(p);
        if (s.size > 50000) {
          recycleHits.push({ p, size: s.size, mtime: s.mtime.toISOString(), name });
          if (NAMES.some((n) => low.includes(n))) consider("recycle", p);
        }
      } catch {}
    }
  });
}

// OneDrive LorePath mirrors
const odCandidates = [
  path.join(process.env.USERPROFILE, "OneDrive", "Projects", "LorePath"),
  path.join(process.env.USERPROFILE, "OneDrive", "LorePath"),
  path.join(process.env.USERPROFILE, "OneDrive - Personal", "Projects", "LorePath"),
];
for (const od of odCandidates) {
  console.log("OneDrive path", od, fs.existsSync(od));
  if (fs.existsSync(od)) {
    walk(path.join(od, "public", "avatars"), 2, 0, (p, name) => {
      if (NAMES.some((n) => name.toLowerCase().includes(n))) consider("onedrive", p);
    });
  }
}

const report = {
  nameHits,
  generateHits: generateHits.slice(0, 100),
  largeJpgHits: largeJpgHits.slice(0, 80),
  recycleHits: recycleHits.slice(0, 50),
  findingsDifferent: findings.filter((f) => f.creature && f.sameAsLive === false),
  findingsSame: findings.filter((f) => f.creature && f.sameAsLive === true),
  findingsAllNamed: findings.filter((f) => f.creature),
};
fs.writeFileSync(
  "C:\\\\Users\\\\autum\\\\Projects\\\\LorePath\\\\_prior_recovery\\\\_avatar_scan_appdata.json",
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify({
  nameHitsCount: nameHits.length,
  genHits: generateHits.length,
  largeJpg: largeJpgHits.length,
  recycle: recycleHits.length,
  different: report.findingsDifferent,
  same: report.findingsSame,
  largeJpgSample: largeJpgHits.slice(0, 40),
  recycleSample: recycleHits.slice(0, 20),
}, null, 2));
