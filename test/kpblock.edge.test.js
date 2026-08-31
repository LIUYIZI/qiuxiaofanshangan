/* 边界验证：kpBlock 各形态（jsdom，第12轮：分类行+编号解析不展示） */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const site = __dirname + '/..';
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document; global.localStorage = window.localStorage;
global.fetch = async url => { const p = path.join(site, url.replace(/^data\//, 'data/')); return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) }; };
window.fetch = global.fetch; global.confirm = () => true; global.alert = () => {};
['js/storage.js','js/config.js','data/emotion.js','js/bank.js','js/knowledge.js','js/cycle.js','js/quiz.js','js/app.js'].forEach(f => window.eval(fs.readFileSync(path.join(site, f), 'utf8')));

let pass = 0, fail = 0;
function assert(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

(async () => {
  const { App } = window;
  await window.KNOWLEDGE.load();
  const kb = q => App.kpBlock(q);

  // 1. 完整：kp + 联想+易混（自由文本，无编号）
  let h = kb({ kp: '测试知识点一句话', kp_mix: '联想：A点；易混：B点', tag: '课堂教学管理' });
  assert('完整形态含kp-line', h.includes('kp-line') && h.includes('测试知识点一句话'));
  assert('分类行kp-cat', h.includes('kp-cat') && h.includes('课堂教学管理'));
  assert('联想段→kp-link+🔗', h.includes('kp-link') && h.includes('🔗'));
  assert('易混段→kp-confuse+⚠️', h.includes('kp-confuse') && h.includes('⚠️'));
  assert('联想自由文本保留', h.includes('联想：A点'));
  assert('易混自由文本保留', h.includes('易混：B点'));

  // 2. 只有联想 / 只有易混
  h = kb({ kp: 'X', kp_mix: '联想：Y' });
  assert('仅联想→有kp-link无kp-confuse', h.includes('kp-link') && !h.includes('kp-confuse'));
  h = kb({ kp: 'X', kp_mix: '易混：Z' });
  assert('仅易混→有kp-confuse无kp-link', h.includes('kp-confuse') && !h.includes('kp-link'));

  // 3. kp_mix 空 / kp空
  assert('kp_mix空→不渲染mix', !kb({ kp: 'X', kp_mix: '' }).includes('kp-mix'));
  assert('kp空只有mix→无kp-line', !kb({ kp: '', kp_mix: '易混：Z' }).includes('kp-line'));
  assert('双空→返回空串', kb({ kp: '', kp_mix: '' }) === '');

  // 4. 特殊字符转义
  h = kb({ kp: '箭头→分号；括号()引号"<b>', kp_mix: '易混：A vs B' });
  assert('特殊字符转义(<b>被esc)', h.includes('&lt;b&gt;') && !h.includes('<b>'));

  // 5. 多段"；"全渲染
  h = kb({ kp: 'X', kp_mix: '联想：A；联想：B；易混：C' });
  assert('多段全渲染(kp-mix出现3次)', (h.match(/kp-mix/g) || []).length === 3);

  // 6. 编号解析（第12轮）：不展示编号
  h = kb({ kp: 'X', kp_mix: '联想：素质教育观(KP-ZY107)' });
  assert('混合段去括号编号', h.includes('素质教育观') && !h.includes('KP-ZY107') && !h.includes('(KP-ZY107)'));
  h = kb({ kp: 'X', kp_mix: '易混：严格管理≠当众批评(A1)' });
  assert('易混混合段去编号', h.includes('严格管理≠当众批评') && !h.includes('(A1)'));
  h = kb({ kp: 'X', kp_mix: '联想：KP-CL02' });
  assert('纯编号段解析为名称+概括', h.includes('教学突发事件应对') && !h.includes('KP-CL02'));
  h = kb({ kp: 'X', kp_mix: '联想：L1' });
  assert('联想链L1解析', h.includes('新课改三观链') && !h.includes('L1'));
  h = kb({ kp: 'X', kp_mix: '易混：B29' });
  assert('易混对B29解析', h.includes('全面性') && !h.includes('B29'));
  h = kb({ kp: 'X', kp_mix: '联想：教育机智、课堂纪律维护(KP-CL01/02)' });
  assert('复合混合段保留自由文本去编号', h.includes('教育机智、课堂纪律维护') && !h.includes('(KP-CL01/02)') && !h.includes('KP-CL01'));
  h = kb({ kp: 'X', kp_mix: '易混：全面性vs全体性(B29)、全面发展vs平均发展(B30)' });
  assert('多编号段全部去除', h.includes('全面性vs全体性') && h.includes('全面发展vs平均发展') && !h.includes('(B29)') && !h.includes('(B30)'));
  /* P2修复：裸编号/前缀编号形态（QA实测泄漏） */
  h = kb({ kp: 'X', kp_mix: '联想：KP-PD17、KP-PD15' });
  assert('裸编号双段→解析为首个名称', !h.includes('KP-PD17') && !h.includes('KP-PD15'));
  h = kb({ kp: 'X', kp_mix: '联想：论证评价、KP-PD15' });
  assert('混合裸编号→保留文本去编号', h.includes('论证评价') && !h.includes('KP-PD15'));
  h = kb({ kp: 'X', kp_mix: '易混：A5迁就vs尊重' });
  assert('前缀式编号→去编号', h.includes('迁就vs尊重') && !h.includes('A5'));
  h = kb({ kp: 'X', kp_mix: '易混：A1严格vs当众批评' });
  assert('前缀式编号A1→去编号', h.includes('严格vs当众批评') && !h.includes('A1'));

  // 7. 真实题库题目渲染（客观题判分）
  await window.Bank.load();
  const q = window.Bank.questions.find(x => x.id === 'zccl01');
  const res = { ok: true, picked: q.answerKey };
  const card = App.objectiveCard(q, res, true);
  assert('真实题objectiveCard含kp-block', card.includes('kp-block') && card.includes('课堂突发事件处理'));
  assert('真实题分类行', card.includes('kp-cat') && card.includes('课堂教学管理'));
  assert('真实题联想不展示编号', !card.includes('(A1)') && !card.includes('KP-CL'));
  const q2 = window.Bank.questions.find(x => x.id === 'zt250329pd01');
  assert('真题(无kp)不显示kp-block', !App.objectiveCard(q2, null, true).includes('kp-block'));
  const q3 = window.Bank.questions.find(x => x.id === 'zly01');
  if (q3) {
    const sc = App.subjectiveCard(q3, null, true);
    assert('主观题展开参考答案含kp-block', sc.includes('kp-block') && sc.includes('素质教育辨析'));
  }

  console.log('\n边界验证: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('异常:', e); process.exit(1); });
