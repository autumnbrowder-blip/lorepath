const fs = require("fs");
const outDir = "C:/Users/autum/Projects/LorePath/_restore_extract";
let content = fs.readFileSync(outDir + "/L540_write.ts", "utf8");
const patches = [
  "mid_L544_sr_1.json",
  "mid_L544_sr_2.json",
  "mid_L821_sr_3.json",
  "mid_L824_sr_4.json",
  "mid_L829_sr_5.json",
  "mid_L833_sr_6.json",
  "mid_L837_sr_7.json",
  "mid_L840_sr_8.json",
];
for (const f of patches) {
  const p = JSON.parse(fs.readFileSync(outDir + "/" + f, "utf8"));
  if (!content.includes(p.old)) {
    console.error("FAIL:", f);
    console.error("old:", JSON.stringify(p.old).slice(0, 400));
    // find hintLow around sexual
    const i = content.indexOf('key: "sexual_content"');
    console.error("sexual block:", JSON.stringify(content.slice(i, i+500)));
    process.exit(1);
  }
  const count = content.split(p.old).length - 1;
  if (count !== 1) {
    console.error("FAIL count", count, f);
    process.exit(1);
  }
  content = content.replace(p.old, p.new);
  console.log("OK", f);
}
const dest = "C:/Users/autum/Projects/LorePath/lib/rating-categories.ts";
fs.writeFileSync(dest, content);
console.log("Wrote", dest, "bytes", Buffer.byteLength(content));
console.log("---FILE---");
console.log(content);
