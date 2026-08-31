/* 边界验证：kpBlock 各形态（jsdom） */
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
['js/storage.js','js/config.js','data/emotion.js','js/bank.js','js/cycle.js','js/quiz.js','js/app.js'].forEach(f => window.eval(fs.readFileSync(path.join(site, f), 'utf8')));

let pass = 0, fail = 0;
function assert(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

(async () => {
  const { App } = window;
  const kb = q => App.kpBlock(q);

  // 1. 完整：kp + 联想+易混
  let h = kb({ kp: '测试知识点一句话', kp_mix: '联想：A点；易混：B点' });
  assert('完整形态含kp-line', h.includes('kp-line') && h.includes('测试知识点一句话'));
  assert('联想段→kp-link+🔗', h.includes('kp-link') && h.includes('🔗'));
  assert('易混段→kp-confuse+⚠️', h.includes('kp-confuse') && h.includes('⚠️'));

  // 2. 只有联想
  h = kb({ kp: 'X', kp_mix: '联想：Y' });
  assert('仅联想→有kp-link无kp-confuse', h.includes('kp-link') && !h.includes('kp-confuse'));

  // 3. 只有易混
  h = kb({ kp: 'X', kp_mix: '易混：Z' });
  assert('仅易混→有kp-confuse无kp-link', h.includes('kp-confuse') && !h.includes('kp-link'));

  // 4. kp_mix 空 / kp空
  assert('kp_mix空→不渲染mix', !kb({ kp: 'X', kp_mix: '' }).includes('kp-mix'));
  assert('kp空只有mix→无kp-line', !kb({ kp: '', kp_mix: '易混：Z' }).includes('kp-line'));
  assert('双空→返回空串', kb({ kp: '', kp_mix: '' }) === '');

  // 5. 特殊字符转义
  h = kb({ kp: '箭头→分号；括号()引号"<b>', kp_mix: '易混：A vs B(编号)' });
  assert('特殊字符转义(<b>被esc)', h.includes('&lt;b&gt;') && !h.includes('<b>'));

  // 6. 多段"；"全渲染
  h = kb({ kp: 'X', kp_mix: '联想：A；联想：B；易混：C' });
  assert('多段全渲染(kp-mix出现3次)', (h.match(/kp-mix/g) || []).length === 3);

  // 7. 真实题库题目渲染（客观题判分）
  await window.Bank.load();
  const q = window.Bank.questions.find(x => x.id === 'zccl01');
  const res = { ok: true, picked: q.answerKey };
  const card = App.objectiveCard(q, res, true);
  assert('真实题objectiveCard含kp-block', card.includes('kp-block') && card.includes('课堂突发事件处理'));
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
