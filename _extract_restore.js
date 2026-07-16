const fs = require("fs");
const transcript = "C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/08f6b391-350a-4ae1-8772-dcc2a89e3c66.jsonl";
const outDir = "C:/Users/autum/Projects/LorePath/_restore_extract";
fs.mkdirSync(outDir, { recursive: true });
const wanted = new Set([509, 510, 513, 538, 540, 821, 824, 829, 833, 837, 840, 845]);
const lines = fs.readFileSync(transcript, "utf8").split(/\r?\n/);
let srIndex = 0;
for (let i = 0; i < lines.length; i++) {
  const n = i + 1;
  if (!wanted.has(n) || !lines[i]) continue;
  const obj = JSON.parse(lines[i]);
  const content = obj.message?.content || [];
  for (const part of content) {
    if (part.type !== "tool_use") continue;
    const name = part.name;
    const inp = part.input || {};
    const p = inp.path || "";
    if (name === "Write") {
      const c = inp.contents || "";
      if (!c.includes("PREFERENCE_CATEGORIES") && !c.includes("RATING_CATEGORIES") && !String(p).includes("rating-categories")) continue;
      console.log("WRITE L" + n + " path=" + p + " len=" + c.length);
      fs.writeFileSync(outDir + "/L" + n + "_write.ts", c);
    } else if (name === "StrReplace") {
      if (!String(p).includes("rating-categories")) continue;
      srIndex++;
      console.log("StrReplace L" + n + " #" + srIndex);
      console.log("  old[:120]=" + JSON.stringify(inp.old_string).slice(0, 120));
      console.log("  new[:120]=" + JSON.stringify(inp.new_string).slice(0, 120));
      fs.writeFileSync(outDir + "/L" + n + "_sr_" + srIndex + ".json", JSON.stringify({ path: p, old: inp.old_string, new: inp.new_string }, null, 2));
    }
  }
}
console.log("done");
