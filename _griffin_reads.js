const fs = require('fs');
const path = require('path');
// Search for Read tool results / image media descriptions of griffin.jpg
const files = [
  'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/subagents/c54c7c81-f726-4453-801f-4024d185041f.jsonl',
  'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/subagents/0baf8f50-5f31-4c61-b7b7-d996db9c2c54.jsonl',
  'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/subagents/6924681e-5a5c-4976-8b7f-df54fdf5a2da.jsonl',
  'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/subagents/670beb0a-16a0-4b07-a95f-a676bfd5520b.jsonl',
  'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/subagents/86d52d43-6232-4336-88a7-c4f9c9df99ed.jsonl',
  'C:/Users/autum/.cursor/projects/c-Users-autum-Projects-LorePath/agent-transcripts/08f6b391-350a-4ae1-8772-dcc2a89e3c66/08f6b391-350a-4ae1-8772-dcc2a89e3c66.jsonl',
];
function visit(obj, fn) {
  if (!obj || typeof obj !== 'object') return;
  fn(obj);
  if (Array.isArray(obj)) obj.forEach(x => visit(x, fn));
  else Object.values(obj).forEach(v => visit(v, fn));
}
for (const p of files) {
  if (!fs.existsSync(p)) { console.log('missing', p); continue; }
  const lines = fs.readFileSync(p, 'utf8').split(/\n/);
  lines.forEach((line, i) => {
    if (!line || !/griffin\.jpg/i.test(line)) return;
    let obj; try { obj = JSON.parse(line); } catch { return; }
    visit(obj, (node) => {
      // Look for image read descriptions
      const keys = Object.keys(node);
      if (node.image_data || node.imageUrl || node.mediaType || (typeof node.type === 'string' && /image/i.test(node.type))) {
        // dump string fields that look like descriptions
        for (const [k,v] of Object.entries(node)) {
          if (typeof v === 'string' && v.length > 80 && /griffin|armor|castle|eagle|lion/i.test(v)) {
            console.log('\n===', path.basename(p), 'L', i+1, 'field', k, 'len', v.length);
            console.log(v.slice(0, 500));
          }
        }
      }
      if (typeof node === 'object' && node.path && /griffin\.jpg/i.test(String(node.path))) {
        console.log('\nPATH HIT', path.basename(p), 'L', i+1, JSON.stringify(node).slice(0,300));
      }
    });
  });
}
