const fs = require('fs');
const path = require('path');
const base = 'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66';
const out = [];

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.jsonl')) processFile(p);
  }
}

function extractStrings(obj, acc = []) {
  if (obj == null) return acc;
  if (typeof obj === 'string') {
    acc.push({ field: null, text: obj });
    return acc;
  }
  if (Array.isArray(obj)) {
    obj.forEach((x) => extractStrings(x, acc));
    return acc;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') acc.push({ field: k, text: v });
      else extractStrings(v, acc);
    }
  }
  return acc;
}

function processFile(p) {
  const rel = path.relative(base, p);
  const text = fs.readFileSync(p, 'utf8');
  if (!/griffin/i.test(text)) return;
  const lines = text.split(/\n/).filter(Boolean);
  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    if (!/griffin/i.test(line)) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const allStrs = extractStrings(obj);
    for (const s of allStrs) {
      const body = s.text;
      if (!/griffin/i.test(body)) continue;
      // keep substantial descriptions / prompts / tool args
      if (body.length < 60 && !/griffin\.jpg/i.test(body)) continue;
      out.push({
        file: rel,
        line: lineNo,
        field: s.field,
        len: body.length,
        text: body,
      });
    }
  }
}

walk(base);

const seen = new Set();
const unique = [];
for (const item of out) {
  const key = item.text;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(item);
}

const reportPath = 'C:/Users/autum/Projects/LorePath/_griffin_extract.json';
fs.writeFileSync(reportPath, JSON.stringify(unique, null, 2), 'utf8');
console.log('Wrote', unique.length, 'unique hits');
for (const u of unique) {
  console.log('\n==========');
  console.log('FILE:', u.file);
  console.log('LINE:', u.line, 'FIELD:', u.field, 'LEN:', u.len);
  console.log(u.text);
}
