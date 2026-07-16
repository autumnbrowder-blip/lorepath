const fs = require('fs');
const path = require('path');
const base = 'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66';

function walk(dir, acc=[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith('.jsonl')) acc.push(p);
  }
  return acc;
}

function visit(obj, fn) {
  if (!obj || typeof obj !== 'object') return;
  fn(obj);
  if (Array.isArray(obj)) obj.forEach((x) => visit(x, fn));
  else Object.values(obj).forEach((v) => visit(v, fn));
}

const results = [];
for (const p of walk(base)) {
  const rel = path.relative(base, p);
  const lines = fs.readFileSync(p, 'utf8').split(/\n/);
  lines.forEach((line, i) => {
    if (!line || (!/GenerateImage/i.test(line) && !( /griffin/i.test(line) && /description/i.test(line)))) return;
    let obj;
    try { obj = JSON.parse(line); } catch { return; }
    visit(obj, (node) => {
      const name = node.name || node.toolName || '';
      const isGen = typeof name === 'string' && /GenerateImage/i.test(name);
      // Cursor often stores: { type, name, input/arguments }
      let args = node.arguments || node.input || node.args || node.parameters;
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch {}
      }
      if (isGen && args && typeof args === 'object') {
        const desc = args.description || args.prompt || '';
        const fn = args.filename || args.fileName || args.path || '';
        if (/griffin/i.test(desc + fn) || /griffin\.jpg/i.test(fn)) {
          results.push({
            file: rel,
            line: i + 1,
            tool: name,
            filename: fn,
            description: desc,
            otherKeys: Object.keys(args),
          });
        }
      }
      // Also catch bare description fields next to griffin.jpg filename in same object
      if (!isGen && node.description && typeof node.description === 'string' && /griffin/i.test(node.description + (node.filename||''))) {
        if ((node.filename && /griffin/i.test(node.filename)) || /griffin/i.test(node.description)) {
          if (node.description.length > 80) {
            results.push({
              file: rel,
              line: i + 1,
              tool: 'bare-description',
              filename: node.filename || node.fileName || '',
              description: node.description,
            });
          }
        }
      }
    });
  });
}

 // Also search Read tool image descriptions mentioning side profile armor castle griffin
const imageReads = [];
for (const p of walk(base)) {
  const rel = path.relative(base, p);
  const lines = fs.readFileSync(p, 'utf8').split(/\n/);
  lines.forEach((line, i) => {
    if (!line || !/griffin/i.test(line)) return;
    if (!/(side[- ]profile|gold armor|castle|ornate frame|armou?r)/i.test(line)) return;
    let obj;
    try { obj = JSON.parse(line); } catch { return; }
    visit(obj, (node) => {
      for (const [k,v] of Object.entries(node)) {
        if (typeof v === 'string' && /griffin/i.test(v) && /(side[- ]profile|gold armor|castle|ornate frame)/i.test(v) && v.length > 100) {
          imageReads.push({ file: rel, line: i+1, field: k, len: v.length, text: v });
        }
      }
    });
  });
}

const seen = new Set();
const uniq = [];
for (const r of results) {
  const key = (r.filename||'') + '|' + r.description;
  if (seen.has(key)) continue;
  seen.add(key);
  uniq.push(r);
}

const seen2 = new Set();
const uniqReads = [];
for (const r of imageReads) {
  if (seen2.has(r.text)) continue;
  seen2.add(r.text);
  uniqReads.push(r);
}

const outPath = 'C:/Users/autum/Projects/LorePath/_griffin_prompts.json';
fs.writeFileSync(outPath, JSON.stringify({ generateImage: uniq, relatedReads: uniqReads }, null, 2));
console.log('GenerateImage hits:', uniq.length);
for (const r of uniq) {
  console.log('\n======== GENERATE ========');
  console.log('file:', r.file);
  console.log('line:', r.line);
  console.log('filename:', r.filename);
  console.log('description FULL:');
  console.log(r.description);
}
console.log('\n\nRelated image/read texts:', uniqReads.length);
for (const r of uniqReads) {
  console.log('\n======== READ/DESC ========');
  console.log('file:', r.file, 'line:', r.line, 'field:', r.field, 'len:', r.len);
  console.log(r.text);
}
