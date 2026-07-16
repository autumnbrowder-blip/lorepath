const fs = require("fs");
const outDir = "C:/Users/autum/Projects/LorePath/_restore_extract";
const content = fs.readFileSync(outDir + "/L540_write.ts", "utf8");
const p = JSON.parse(fs.readFileSync(outDir + "/L821_sr_6.json", "utf8"));
console.log("content has hintLow None?", content.includes('hintLow: "0'));
const idx = content.indexOf("hintLow");
console.log("first hintLow context:");
console.log(JSON.stringify(content.slice(idx, idx+200)));
console.log("\nold from patch:");
console.log(JSON.stringify(p.old));
// compare codepoints around middle dot
function cps(s) {
  return [...s].map(c => c + " U+" + c.codePointAt(0).toString(16)).join(" | ");
}
const m1 = content.match(/0 .{1,3} None/);
const m2 = p.old.match(/0 .{1,3} None/);
console.log("\ncontent match:", m1 && cps(m1[0]));
console.log("patch match:", m2 && cps(m2[0]));
