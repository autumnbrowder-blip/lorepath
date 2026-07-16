const fs = require("fs");
const outDir = "C:/Users/autum/Projects/LorePath/_restore_extract";
let content = fs.readFileSync(outDir + "/L540_write.ts", "utf8");
const patches = [
  "L821_sr_6.json",
  "L824_sr_7.json",
  "L829_sr_8.json",
  "L833_sr_9.json",
  "L837_sr_10.json",
  "L840_sr_11.json",
];
for (const f of patches) {
  const p = JSON.parse(fs.readFileSync(outDir + "/" + f, "utf8"));
  if (!content.includes(p.old)) {
    console.error("FAIL: old_string not found in", f);
    console.error("Looking for:", JSON.stringify(p.old).slice(0, 300));
    // try to show nearby
    process.exit(1);
  }
  const count = content.split(p.old).length - 1;
  if (count !== 1) {
    console.error("FAIL: old_string found", count, "times in", f);
    process.exit(1);
  }
  content = content.replace(p.old, p.new);
  console.log("Applied", f);
}
const dest = "C:/Users/autum/Projects/LorePath/lib/rating-categories.ts";
fs.writeFileSync(dest, content);
console.log("Wrote", dest, "len=", content.length);

// Summarize LGBTQ and Social & Political
const lgbtMatch = content.match(/key: \"lgbt\"[\s\S]*?(?=\n  \{|\n\];)/);
const ideoMatch = content.match(/key: \"ideology\"[\s\S]*?(?=\n  \{|\n\];)/);
console.log("\n=== LGBT block ===\n", lgbtMatch && lgbtMatch[0]);
console.log("\n=== ideology block (prefs) ===\n", ideoMatch && ideoMatch[0].slice(0, 1500));
