const fs=require('fs');
const name=process.argv[2];
const xml=fs.readFileSync(name+'/word/document.xml','utf8');
const body=xml.split('<w:body>')[1];
const out=[];
// walk paragraphs; mark tables
const re=/<w:tbl>|<\/w:tbl>|<w:tr[ >]|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g;
let m;
const dec=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
while((m=re.exec(body))){
  const t=m[0];
  if(t==='<w:tbl>'){out.push('[[TBL]]');continue;}
  if(t==='</w:tbl>'){out.push('[[/TBL]]');continue;}
  if(t.startsWith('<w:tr')){out.push('[[TR]]');continue;}
  if(t==='<w:p/>'){continue;}
  const st=(t.match(/<w:pStyle w:val="([^"]+)"/)||[])[1]||'';
  let txt='';
  t.replace(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g,(a,b)=>{txt+= b!==undefined?dec(b):(a==='<w:tab/>'?'\t':'\n');});
  if(txt.trim()) out.push((st?'{'+st+'} ':'')+txt);
}
fs.writeFileSync(name+'.txt',out.join('\n'));
console.log(name,out.length);
