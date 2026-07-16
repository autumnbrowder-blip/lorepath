const fs = require('fs');
const path = require('path');
const base = 'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66';

function walk(dir, acc=[]) {
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith('.jsonl')) acc.push(p);
  }
  return acc;
}

const patterns = [
  /side[- ]profile.*griffin|griffin.*side[- ]profile/i,
  /castle.*griffin|griffin.*castle/i,
  /gold armor.*griffin|griffin.*gold armor|chest armor.*griffin|griffin.*chest armor/i,
  /griffin.*landscape|landscape.*griffin/i,
];

const hits = [];
for (const p of walk(base)) {
  const rel = path.relative(base, p);
  const lines = fs.readFileSync(p, 'utf8').split(/\n/);
  lines.forEach((line, i) => {
    if (!/griffin/i.test(line)) return;
    if (!/(side[- ]profile|castle|gold armor|chest armor|ornate.*armor|landscape)/i.test(line)) return;
    // find longest string fields
    let obj; try { obj = JSON.parse(line); } catch { return; }
    const stack = [obj];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== 'object') continue;
      for (const [k,v] of Object.entries(n)) {
        if (typeof v === 'string' && /griffin/i.test(v) && /(side[- ]profile|castle|gold armor|chest armor|landscape)/i.test(v) && v.length > 50) {
          hits.push({file:rel, line:i+1, field:k, len:v.length, text:v});
        } else if (v && typeof v === 'object') stack.push(v);
      }
    }
  });
}

const seen = new Set();
for (const h of hits.sort((a,b)=>b.len-a.len)) {
  if (seen.has(h.text)) continue;
  seen.add(h.text);
  // skip huge code dumps unless they clearly contain a standalone prompt
  if (h.len > 4000 && !/^Exact same|^Fantasy|^Square|^Circular|^A |^Create |^Generate /i.test(h.text.trim())) {
    // still print first 400 chars if it looks like it contains description
    if (/description["']?\s*:\s*["']/i.test(h.text) || /GenerateImage/i.test(h.text)) {
      console.log('\n## LARGE WITH PROMPT', h.file, 'L', h.line, 'field', h.field, 'len', h.len);
      // extract description strings
      const re = /"description"\s*:\s*"((?:\\.|[^"\\])*)"/g;
      let m;
      while ((m = re.exec(h.text))) {
        const un = JSON.parse('"' + m[1] + '"');
        if (/griffin/i.test(un)) {
          console.log('EXTRACTED DESC:', un);
        }
      }
    }
    continue;
  }
  console.log('\n##', h.file, 'L', h.line, 'field', h.field, 'len', h.len);
  console.log(h.text);
}
console.log('\nTotal unique:', seen.size);
