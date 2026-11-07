// 题库转换：读取 x2t.js 产出的 338生物化学.txt / 821食品工艺学.txt，生成 questions.js 与转换报告
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2];
const SUBJECTS = [
  { file: '338生物化学.txt', subject: '338生物化学', src: '打印版_338生物化学.docx' },
  { file: '821食品工艺学.txt', subject: '821食品工艺学', src: '打印版_821食品工艺学.docx' }
];
const CIRC = '①②③④⑤⑥⑦⑧';
const SHORT_TYPES = ['名词解释', '简答/问答题', '简答题', '论述题', '计算题', '论述/分析题', '综合题', '思考题/作业题'];

function readLines(file) {
  // 合并换行续行：不以 {样式} 开头的行属于上一段
  const raw = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  for (const l of raw) {
    const m = l.match(/^\{([^}]+)\} ?([\s\S]*)$/);
    if (m) out.push({ st: m[1], t: m[2] });
    else if (out.length) out[out.length - 1].t += '\n' + l;
  }
  return out;
}

// 按 A、B、C… 或 ①②③… 顺序切分选项
function splitOptions(text) {
  const t = text.replace(/\r/g, '');
  const tryKeys = (keys, sepRe) => {
    const pos = [];
    let from = 0;
    for (let i = 0; i < keys.length; i++) {
      const re = new RegExp('(^|[\\s　]|[)）。？?])' + keys[i] + sepRe, 'g');
      re.lastIndex = from;
      const m = re.exec(t);
      if (!m) break;
      const start = m.index + m[1].length;
      pos.push({ key: keys[i], start, textStart: start + m[0].length - m[1].length });
      from = start + 1;
    }
    if (pos.length < 2) return null;
    return pos.map((p, i) => ({
      key: p.key,
      text: t.slice(p.textStart, i + 1 < pos.length ? pos[i + 1].start : t.length).replace(/[\s　]+$/, '').replace(/^[\s　]+/, ''),
      start: p.start
    }));
  };
  return tryKeys('ABCDEFGH'.split(''), '[、.．:：]?') || tryKeys(CIRC.split(''), '');
}

function normAns(s) { return s.replace(/^答案[0-9]*：/, '').trim(); }

// 填空：根据题干空格位置，从“完整句”答案中截取每空内容
function extractBlanks(stem, ans) {
  const parts = stem.split(/[　]{2,}|_{3,}/);
  const n = parts.length - 1;
  if (n < 1) return null;
  const clean = s => s.replace(/[\s　]+/g, '');
  const A = clean(ans);
  const segs = parts.map(clean);
  // 方式1：完整句
  let cur = 0, res = [];
  let ok = A.startsWith(segs[0]);
  if (ok) {
    cur = segs[0].length;
    for (let i = 1; i <= n && ok; i++) {
      const seg = segs[i];
      let idx;
      if (i === n) idx = seg === '' ? A.length : (A.endsWith(seg) && A.length - seg.length >= cur ? A.length - seg.length : -1);
      else idx = seg === '' ? -1 : A.indexOf(seg, cur);
      if (idx < 0) { ok = false; break; }
      res.push(A.slice(cur, idx));
      cur = idx + seg.length;
    }
    if (ok && res.every(x => x.length > 0)) return res;
  }
  // 方式2：答案为以分隔符列出的各空
  const list = ans.split(/[、，,；;]|\s{1,}|　+/).map(x => x.trim()).filter(Boolean);
  if (list.length === n) return list;
  return null;
}

function judgeVal(a) {
  const s = a.replace(/[\s　（）()]/g, '');
  if (/^(√|对|正确|T|是)$/.test(s)) return true;
  if (/^(×|╳|X|x|错|错误|F|否)$/.test(s)) return false;
  return null;
}

const all = [];
const unparsed = [];
const report = { perSubject: {} };

for (const S of SUBJECTS) {
  const lines = readLines(path.join(process.cwd(), S.file));
  const outline = {}; // outlineId -> 章节名
  let chapter = '', outlineId = '', section = '', inBody = false, appendix = '', group = '';
  let q = null;
  const list = [];
  const flush = () => { if (q) list.push(q); q = null; };
  for (const L of lines) {
    if (L.st === '1') {
      flush();
      const t = L.t.trim();
      if (/^附录/.test(t)) { appendix = /历年真题/.test(t) ? 'A' : 'B'; chapter = t; inBody = true; }
      else if (/^(使用说明|大纲全文|考试说明)$/.test(t)) { inBody = false; appendix = ''; }
      else { chapter = t; appendix = ''; inBody = true; }
      outlineId = ''; group = '';
      continue;
    }
    if (!inBody) continue;
    if (L.st === '2' || L.st === '3') {
      flush();
      const m = L.t.match(/^(\d{3}-[0-9A-Za-zⅠ-Ⅹ.]+)[　 ]/);
      if (m && !appendix) { outlineId = m[1]; outline[outlineId] = chapter; }
      if (appendix) group = L.t.trim();
      continue;
    }
    if (L.st === 'sec') { flush(); section = L.t; continue; }
    if (L.st === 'q') {
      flush();
      const m = L.t.match(/^(\d+)\.\s*\[([^\]]*)\]\s*([\s\S]*)$/);
      q = { raw: L.t, chapter, outlineId: appendix ? '' : outlineId, appendix, group, section, opt: [], ans: [], src: [] };
      if (m) {
        q.label = m[2]; q.stem = m[3];
        const ym = m[2].match(/(\d{4})年/); q.year = ym ? ym[1] : '';
        q.typeLabel = m[2].replace(/\d{4}年\s*/, '').replace(/\s*第\d+题.*$/, '').replace(/\s*\d+分$/, '').trim();
        const sm = m[2].match(/(\d+)分/); q.score = sm ? sm[1] + '分' : '';
      } else { q.label = ''; q.stem = L.t; q.year = ''; q.typeLabel = ''; q.bad = '题号/题型标记无法识别'; }
      continue;
    }
    if (!q) continue;
    if (L.st === 'opt') q.opt.push(L.t);
    else if (L.st === 'ans') q.ans.push(L.t);
    else if (L.st === 'src') q.src.push(L.t);
  }
  flush();
  report.perSubject[S.subject] = { rawBlocks: list.length };

  for (const r of list) {
    const idLine = r.src.find(s => s.startsWith('ID ')) || '';
    const idm = idLine.match(/^ID ([^｜（]+)/);
    const id = idm ? idm[1].trim() : '';
    const pending = /挂接待确认/.test(idLine);
    const srcM = idLine.match(/来源：([^；]*)/);
    const dupM = idLine.match(/重复来源[^：]*：(.*?)(；备注：|$)/);
    const noteM = idLine.match(/备注：(.*)$/);
    const origin = idLine.match(/^ID [^｜]+｜([^｜]*)｜来源/);
    const mainLine = r.src.find(s => s.startsWith('主挂：')) || '';
    let outlineId = r.outlineId;
    let chapter = r.chapter;
    if (r.appendix === 'A') {
      const mm = mainLine.match(/主挂：(\d{3}-[0-9A-Za-zⅠ-Ⅹ.]+)/);
      outlineId = mm ? mm[1] : '';
      chapter = outlineId && outline[outlineId] ? outline[outlineId] : '附录B　未匹配大纲的题目';
    }
    const isPast = /^ZT-/.test(id) || /历年真题/.test(r.section) || r.appendix === 'A';
    const ansLines = r.ans.map(a => a.trim());
    const conflict = ansLines.some(a => a.includes('答案冲突待确认'));
    const ansClean = ansLines.map(a => normAns(a.replace(/^【答案冲突待确认】/, '')));
    const answerText = ansLines.join('\n');
    const noAns = ansClean.length === 0 || ansClean.every(a => a === '原资料未提供答案');
    const inStem = ansClean.some(a => a.startsWith('答案已含于题干'));
    const tags = [S.subject];
    if (r.typeLabel) tags.push(r.typeLabel);
    if (pending) tags.push('挂接待确认');
    if (conflict) tags.push('答案冲突待确认');
    if (r.appendix === 'B' && r.group) tags.push(r.group.replace(/（\d+ 道）$/, ''));
    if (r.score) tags.push(r.score);
    if (origin) tags.push(origin[1].trim());

    const Q = {
      id, chapter: S.subject + '｜' + chapter, outlineId, type: 'short', stem: r.stem || '', options: [], answer: '',
      explanation: '', source: srcM ? srcM[1].trim() : S.src, year: r.year || '', isPastExam: isPast, tags, images: [],
      answerText: noAns ? '' : answerText,
      note: noteM ? noteM[1].trim() : '',
      dupSources: dupM ? dupM[1].split('；').map(s => s.trim()).filter(Boolean) : []
    };
    const problems = [];
    if (r.bad) problems.push(r.bad);
    if (!id) problems.push('缺少题目ID');
    const tl = r.typeLabel;
    const single = noAns || conflict || inStem ? null : (ansClean.length === 1 ? ansClean[0] : null);

    if (tl === '选择题') {
      let opts = null, stem = Q.stem;
      if (r.opt.length) opts = splitOptions(r.opt.join('\n'));
      else {
        const o = splitOptions(Q.stem);
        if (o && o.length >= 2) { opts = o; stem = Q.stem.slice(0, o[0].start).replace(/[\s　]+$/, ''); }
      }
      const jv = single != null ? judgeVal(single) : null;
      if (!opts && (jv !== null || /（　+）\s*$/.test(Q.stem))) {
        Q.type = 'judge';
        if (jv !== null) Q.answer = jv;
        else if (!noAns) problems.push('判断题答案无法识别：' + answerText);
        if (conflict) problems.push('答案冲突待确认，未自动判分');
      } else if (opts) {
        Q.stem = stem;
        Q.options = opts.map(o => ({ key: o.key, text: o.text }));
        if (r.opt.length === 0) Q.tags.push('选项由题干拆分');
        const keys = Q.options.map(o => o.key);
        if (single != null) {
          const s = single.replace(/[\s　,，、]/g, '').toUpperCase();
          const chars = Array.from(s);
          if (chars.length && chars.every(c => keys.includes(c)) && new Set(chars).size === chars.length) {
            if (chars.length === 1) { Q.type = 'single'; Q.answer = chars[0]; }
            else { Q.type = 'multiple'; Q.answer = chars.sort(); }
          } else { Q.type = 'single'; problems.push('选择题答案与选项不对应：' + single); }
        } else {
          Q.type = 'single';
          if (conflict) problems.push('答案冲突待确认，未自动判分');
          // 原资料未提供答案不算无法解析，仅计入缺失答案
        }
      } else {
        Q.type = 'short';
        problems.push('选择题未识别到选项，按简答（自评）处理');
      }
    } else if (tl === '判断题') {
      Q.type = 'judge';
      if (single != null) {
        const jv = judgeVal(single);
        if (jv !== null) Q.answer = jv; else problems.push('判断题答案无法识别：' + single);
      } else if (inStem) problems.push('原资料为已判断的完整句，答案无法单独识别');
      else if (conflict) problems.push('答案冲突待确认，未自动判分');
    } else if (tl === '填空题') {
      const blanks = (Q.stem.match(/[　]{2,}|_{3,}/g) || []).length;
      if (inStem) { Q.type = 'short'; problems.push('题干只剩填好的答案（原资料为已填写的完整句），按简答（自评）处理'); }
      else if (blanks === 0) { Q.type = 'short'; if (!noAns) Q.answer = ansClean.join('\n'); problems.push('填空题题干中未识别到空格，按简答（自评）处理'); }
      else {
        Q.type = 'fill';
        if (single != null) {
          const b = extractBlanks(Q.stem, single);
          Q.answer = b ? (b.length === 1 ? b[0] : b) : single;
          if (!b) Q.tags.push('填空答案未拆分');
        } else if (!noAns) { Q.answer = ansClean.join('\n'); Q.tags.push('填空答案未拆分'); }
      }
    } else if (SHORT_TYPES.includes(tl)) {
      Q.type = 'short';
      if (!noAns) Q.answer = ansClean.join('\n');
    } else {
      Q.type = 'short';
      if (!noAns) Q.answer = ansClean.join('\n');
      problems.push('未知题型：' + (tl || '无'));
    }
    if (inStem && Q.type === 'short') Q.answer = '';
    if (Q.type === 'short' && !Q.answer && !noAns && !inStem) Q.answer = ansClean.join('\n');
    Q._noAns = noAns || inStem || (Q.answer === '' && Q.type !== 'judge') || (Q.type === 'judge' && Q.answer === '');
    Q._problems = problems;
    all.push(Q);
  }
}

// 去重 1：同一 ID 多次出现（如附录A真题汇总与章节正文重复印刷）
const byId = new Map();
const sameIdMerged = [];
const finalList = [];
for (const q of all) {
  if (q.id && byId.has(q.id)) {
    const main = byId.get(q.id);
    // 以章节正文中的记录为主；若主记录在附录而新记录在正文，则替换章节信息
    if (/附录/.test(main.chapter) && !/附录/.test(q.chapter)) { main.chapter = q.chapter; main.outlineId = q.outlineId; }
    if (!main.outlineId && q.outlineId) main.outlineId = q.outlineId;
    sameIdMerged.push(q.id);
    continue;
  }
  if (q.id) byId.set(q.id, q);
  finalList.push(q);
}
// 去重 2：题干+选项+答案 完全相同但 ID 不同
const keyOf = q => [q.stem.replace(/[\s　]+/g, ''), q.options.map(o => o.key + o.text).join('|').replace(/[\s　]+/g, ''), JSON.stringify(q.answer), q.answerText.replace(/[\s　]+/g, '')].join('#');
const byKey = new Map();
const contentDups = [];
const result = [];
for (const q of finalList) {
  const k = keyOf(q);
  if (q.stem.trim() && byKey.has(k)) {
    const main = byKey.get(k);
    main.tags.push('重复题:' + q.id);
    main.dupSources.push(q.source + '（ID ' + q.id + '）');
    contentDups.push({ keep: main.id, drop: q.id, stem: q.stem.slice(0, 40) });
    continue;
  }
  byKey.set(k, q);
  result.push(q);
}
// ID 唯一性兜底
const seen = new Set(); let fixedIds = 0;
result.forEach((q, i) => {
  if (!q.id || seen.has(q.id)) { q.id = (q.id || 'NOID') + '-' + (i + 1); fixedIds++; }
  seen.add(q.id);
});

// 统计
const stat = (arr, f) => arr.reduce((m, q) => { const k = f(q); m[k] = (m[k] || 0) + 1; return m; }, {});
const byChapter = stat(result, q => q.chapter);
const byType = stat(result, q => q.type);
const bySubject = stat(result, q => q.tags[0]);
const past = result.filter(q => q.isPastExam).length;
const missing = result.filter(q => q._noAns);
const probs = result.filter(q => q._problems.length);

const clean = result.map(q => { const o = { ...q }; delete o._noAns; delete o._problems; return o; });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'questions.js'),
  '// 由 打印版_338生物化学.docx、打印版_821食品工艺学.docx 自动转换，题干/选项/答案为原文\n' +
  'window.QUESTIONS = ' + JSON.stringify(clean, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + ';\n');

const tname = { single: '单选', multiple: '多选', judge: '判断', fill: '填空', short: '简答/名词解释等（自评）' };
let md = '# 题库转换报告\n\n';
md += '源文件：`打印版_338生物化学.docx`、`打印版_821食品工艺学.docx`（只读，未修改）\n\n';
md += '## 总览\n\n| 项目 | 数量 |\n|---|---|\n';
md += `| docx 中题目块（含重复印刷） | ${all.length} |\n`;
md += `| 同 ID 重复印刷已合并（附录A真题汇总与正文重复） | ${sameIdMerged.length} |\n`;
md += `| 题干+选项+答案完全相同、ID 不同的重复题已合并 | ${contentDups.length} |\n`;
md += `| **最终题目总数** | **${result.length}** |\n`;
md += `| 真题 | ${past} |\n| 补充题 | ${result.length - past} |\n`;
md += `| 缺失答案（含“答案已含于题干”） | ${missing.length} |\n`;
md += `| 重复 ID（转换后） | ${fixedIds}（已自动加后缀修正） |\n`;
md += `| 有解析的题目 | ${result.filter(q => q.explanation).length}（原题库所有题目均标“原资料未提供解析”） |\n`;
md += `| 无法解析/需人工确认 | ${probs.length} |\n\n`;
md += '## 各科目\n\n| 科目 | 题目数 |\n|---|---|\n' + Object.entries(bySubject).map(([k, v]) => `| ${k} | ${v} |`).join('\n') + '\n\n';
md += '## 各题型\n\n| 题型 | 数量 |\n|---|---|\n' + Object.entries(byType).map(([k, v]) => `| ${tname[k]}（${k}） | ${v} |`).join('\n') + '\n\n';
md += '原题型标签分布：\n\n| 原题型 | 数量 |\n|---|---|\n' + Object.entries(stat(result, q => q.tags[1] || '无')).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n') + '\n\n';
md += '## 各章节\n\n| 章节 | 题目数 | 真题 | 补充题 |\n|---|---|---|---|\n' + Object.entries(byChapter).map(([k, v]) => { const p = result.filter(q => q.chapter === k && q.isPastExam).length; return `| ${k} | ${v} | ${p} | ${v - p} |`; }).join('\n') + '\n\n';
md += '## 转换规则说明\n\n';
md += '- 选择题答案为单个字母/序号→single；多个字母→multiple；选项键保留原文（A/B/C 或 ①②③）。\n';
md += '- 题型标为“选择题”但无选项、答案为 √/× 的，按判断题处理。\n';
md += '- 填空题：从原答案中按题干空格位置截取各空内容用于自动判分；截取失败的保留整段原答案（标签“填空答案未拆分”），页面显示原答案并提供自评。\n';
md += '- 所有题目的原始答案文本完整保存在 `answerText` 字段，页面一并显示。\n';
md += '- 名词解释/简答/论述/计算/综合/思考题→short，显示参考答案并自评。\n';
md += '- docx 中“二、补充资料”段落属于知识点摘录，不是题目解析，未写入 explanation。\n';
md += '- 原资料重复来源写入 `dupSources` 字段；去重合并的 ID 写入主记录 tags（“重复题:ID”）。\n\n';
md += '## 内容重复合并清单\n\n' + (contentDups.length ? '| 保留 ID | 合并 ID | 题干开头 |\n|---|---|---|\n' + contentDups.map(d => `| ${d.keep} | ${d.drop} | ${d.stem.replace(/\|/g, '｜').replace(/\n/g, ' ')} |`).join('\n') : '无') + '\n\n';
md += '## 无法解析/需人工确认清单（题目均已保留在题库中）\n\n| ID | 章节 | 问题 | 题干开头 |\n|---|---|---|---|\n' + probs.map(q => `| ${q.id} | ${q.chapter} | ${q._problems.join('；').replace(/\|/g, '｜').replace(/\n/g, ' ')} | ${q.stem.slice(0, 40).replace(/\|/g, '｜').replace(/\n/g, ' ')} |`).join('\n') + '\n\n';
md += '## 缺失答案清单\n\n| ID | 章节 | 题干开头 |\n|---|---|---|\n' + missing.map(q => `| ${q.id} | ${q.chapter} | ${q.stem.slice(0, 40).replace(/\|/g, '｜').replace(/\n/g, ' ')} |`).join('\n') + '\n';
fs.writeFileSync(path.join(OUT, '题库转换报告.md'), md);
fs.writeFileSync(path.join(process.cwd(), "sample20.json"), JSON.stringify(clean.slice(0, 20), null, 2));
console.log({ blocks: all.length, sameId: sameIdMerged.length, contentDup: contentDups.length, total: result.length, bySubject, byType, past, missing: missing.length, problems: probs.length, fixedIds });
console.log(stat(probs, q => q._problems[0].replace(/：.*/, '')));
