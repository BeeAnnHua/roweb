const fs=require('fs');
function assert(v,m){if(!v)throw new Error(m);}
const css=fs.readFileSync('css/style.css','utf8');
assert(/\.item-detail-card\s*\{[\s\S]*?width:min\(458px,[\s\S]*?border:2px solid #d8a94f;/.test(css),'compact item card and gold border required');
assert(/\.item-detail-body\s*\{[\s\S]*?overflow:hidden;[\s\S]*?display:flex;/.test(css),'outer item body must not own the scrollbar');
assert(/\.item-detail-description\s*\{[\s\S]*?max-height:min\(240px, 38vh\);[\s\S]*?overflow-y:auto;/.test(css),'middle description must scroll independently');
assert(/\.item-detail-socket-section,[\s\S]*?flex:0 0 auto;/.test(css),'socket section must remain fixed outside description scroller');
console.log('PASS 0.9.82EV compact gold item detail dialog with independent description scroll');
