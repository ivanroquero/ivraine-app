import { writeFileSync, readFileSync } from 'fs';

const extra = `
/* Location status bar shown while slot spins after YES */
.ivraine-loc-status {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f9f4fb;
  border: 1px solid #e9d5f7;
  border-radius: 12px;
  padding: 10px 14px;
  margin-top: 14px;
  font-size: 12.5px;
  color: #7c3aed;
  font-weight: 600;
  text-align: left;
}
.ivraine-loc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7c3aed;
  flex-shrink: 0;
  animation: ivraineDotPulse 1s infinite ease-in-out;
}
@keyframes ivraineDotPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}
`;

const current = readFileSync('frontend/src/proposal.css', 'utf8');
writeFileSync('frontend/src/proposal.css', current + extra, { encoding: 'utf8' });

const buf = readFileSync('frontend/src/proposal.css');
let bad = -1;
for (let i = 0; i < buf.length; i++) {
  const b = buf[i];
  if (b > 0x7F) {
    if ((b & 0xE0) === 0xC0 && i+1 < buf.length && (buf[i+1] & 0xC0) === 0x80) { i+=1; continue; }
    if ((b & 0xF0) === 0xE0 && i+2 < buf.length) { i+=2; continue; }
    if ((b & 0xF8) === 0xF0 && i+3 < buf.length) { i+=3; continue; }
    bad = i; break;
  }
}
console.log('Valid UTF-8:', bad === -1 ? 'YES - clean' : 'NO at byte ' + bad, '| Total bytes:', buf.length);
