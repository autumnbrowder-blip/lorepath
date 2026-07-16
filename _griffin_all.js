const fs = require('fs');
const path = require('path');

// Dump ALL unique GenerateImage descriptions for griffin from ALL agent-transcripts
const root = 'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts';

function walk(dir, acc=[]) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith('.jsonl')) acc.push(p);
  }
  return acc;
}

function visit(obj, fn) {
  if (!obj || typeof obj !== 'object') return;
  fn(obj);
  if (Array.isArray(obj)) obj.forEach(x => visit(x, fn));
  else Object.values(obj).forEach(v => visit(v, fn));
}

const results = [];
for (const p of walk(root)) {
  const text = fs.readFileSync(p, 'utf8');
  if (!/griffin/i.test(text) || !/GenerateImage/i.test(text)) continue;
  const lines = text.split(/\n/);
  lines.forEach((line, i) => {
    if (!line || !/GenerateImage/i.test(line)) return;
    let obj; try { obj = JSON.parse(line); } catch { return; }
    visit(obj, (node) => {
      const name = node.name || node.toolName || '';
      if (!(typeof name === 'string' && /GenerateImage/i.test(name))) return;
      let args = node.arguments || node.input || node.args || node.parameters;
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch {} }
      if (!args || typeof args !== 'object') return;
      const desc = args.description || '';
      const fn = args.filename || args.fileName || '';
      if (/griffin/i.test(desc + fn)) {
        results.push({
          file: path.relative(root, p),
          line: i+1,
          filename: fn,
          description: desc,
          refs: args.reference_image_paths || args.referenceImagePaths || null,
        });
      }
    });
  });
}

const seen = new Set();
console.log('ALL griffin GenerateImage across ALL transcripts:', results.length);
for (const r of results) {
  const key = r.description;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log('\n========');
  console.log(r.file, 'L'+r.line);
  console.log('filename:', r.filename);
  console.log('refs:', JSON.stringify(r.refs));
  console.log(r.description);
}
