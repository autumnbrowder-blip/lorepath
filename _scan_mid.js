const fs = require("fs");
const transcript = "C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/08f6b391-350a-4ae1-8772-dcc2a89e3c66.jsonl";
const outDir = "C:/Users/autum/Projects/LorePath/_restore_extract";
const lines = fs.readFileSync(transcript, "utf8").split(/\r?\n/);
let sr = 0;
for (let i = 539; i < 845; i++) { // lines 540..844 (0-indexed 539..843)
  const n = i + 1;
  if (!lines[i]) continue;
  let obj;
  try { obj = JSON.parse(lines[i]); } catch { continue; }
  const content = obj.message?.content || [];
  for (const part of content) {
    if (part.type !== "tool_use") continue;
    const name = part.name;
    const inp = part.input || {};
    const p = String(inp.path || "");
    if (name === "Write" && (p.includes("rating-categories") || (inp.contents||"").includes("PREFERENCE_CATEGORIES"))) {
      console.log("WRITE L" + n + " path=" + p + " len=" + (inp.contents||"").length);
      fs.writeFileSync(outDir + "/L" + n + "_write.ts", inp.contents || "");
    }
    if (name === "StrReplace" && p.includes("rating-categories")) {
      sr++;
      console.log("SR L" + n + " #" + sr + " oldLen=" + (inp.old_string||"").length + " newLen=" + (inp.new_string||"").length);
      console.log("  old head: " + JSON.stringify(inp.old_string).slice(0, 180));
      fs.writeFileSync(outDir + "/mid_L" + n + "_sr_" + sr + ".json", JSON.stringify({ path: p, old: inp.old_string, new: inp.new_string }, null, 2));
    }
  }
}
console.log("total SR", sr);
