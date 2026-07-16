const fs = require('fs');
// Inspect Read results around griffin.jpg for vision captions in key files
const files = [
  'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/subagents/c54c7c81-f726-4453-801f-4024d185041f.jsonl',
  'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/subagents/6924681e-5a5c-4976-8b7f-df54fdf5a2da.jsonl',
  'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/subagents/86d52d43-6232-4336-88a7-c4f9c9df99ed.jsonl',
  'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/subagents/670beb0a-16a0-4b07-a95f-a676bfd5520b.jsonl',
  'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/subagents/0baf8f50-5f31-4c61-b7b7-d996db9c2c54.jsonl',
];

function summarize(obj, depth=0) {
  if (depth > 6 || obj == null) return typeof obj;
  if (typeof obj === 'string') return obj.length > 120 ? `str(${obj.length}):`+obj.slice(0,120) : `str:`+obj;
  if (typeof obj !== 'object') return typeof obj + ':' + String(obj).slice(0,80);
  if (Array.isArray(obj)) return obj.slice(0,5).map(x => summarize(x, depth+1));
  const out = {};
  for (const [k,v] of Object.entries(obj)) {
    if (['password','token','image_data','blob','data'].includes(k) && typeof v === 'string' && v.length > 200) {
      out[k] = `str(${v.length})`;
    } else if (typeof v === 'string') out[k] = v.length > 150 ? `str(${v.length}):`+v.slice(0,150) : v;
    else out[k] = summarize(v, depth+1);
  }
  return out;
}

for (const p of files) {
  console.log('\n\n########', require('path').basename(p));
  const lines = fs.readFileSync(p, 'utf8').split(/\n/);
  lines.forEach((line, i) => {
    if (!line || !/griffin/i.test(line)) return;
    // tool result or read
    if (!/(tool_result|Read|image|description|vision|media)/i.test(line) && !/GenerateImage/i.test(line)) return;
    let obj; try { obj = JSON.parse(line); } catch { return; }
    const role = obj.role || obj.type || obj.message?.role;
    // print compact structure for lines that read griffin image
    const s = JSON.stringify(obj);
    if (/griffin\.jpg/i.test(s) && ( /"Read"|toolName.:.Read|name.:.Read|GenerateImage|image_description|alt/i.test(s) || s.includes('"path"'))) {
      console.log('\n--- L'+(i+1), 'role/type', role, 'len', s.length);
      console.log(JSON.stringify(summarize(obj), null, 2).slice(0, 2500));
    }
  });
}
