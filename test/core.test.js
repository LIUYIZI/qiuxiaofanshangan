/* 核心逻辑测试：在Node中mock window/localStorage/document，验证抽题算法与存储 */
const fs = require('fs');
const path = require('path');

// ---- 简易mock ----
const store = {};
global.window = global;
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.document = {
  addEventListener: () => {},
  getElementById: () => ({ addEventListener: () => {}, textContent: '', innerHTML: '', style: {} }),
  querySelectorAll: () => [],
  querySelector: () => null
};
global.fetch = async url => {
  const p = path.join(__dirname, '..', url.replace(/^data\//, 'data/'));
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
global.confirm = () => true;
global.alert = () => {};

// ---- 加载模块 ----
require('../js/storage.js');
require('../js/config.js');
require('../js/bank.js');
require('../js/quiz.js');
// app.js 会在加载时执行init，mock里DOMContentLoaded不触发，安全

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + JSON.stringify(extra) : '')); }
}

(async () => {
  console.log('== 题库加载 ==');
  await Bank.load();
  assert('题库共34题', Bank.questions.length === 34, Bank.questions.length);
  assert('客观题 = 26', Bank.questions.filter(q => !q.isSubjective).length === 26);
  assert('主观题 = 8', Bank.questions.filter(q => q.isSubjective).length === 8);

  console.log('== 抽题：今日测验 ==');
  const daily = await Quiz.drawDaily();
  assert('每日测验11题（10客观+1主观）', daily.questions.length === 11, daily.questions.length);
  const objCount = daily.questions.filter(q => !q.isSubjective).length;
  const subCount = daily.questions.filter(q => q.isSubjective).length;
  assert('客观10题', objCount === 10, objCount);
  assert('主观1题', subCount === 1, subCount);
  // 模块分布
  const mods = {};
  daily.questions.filter(q => !q.isSubjective).forEach(q => mods[q.module] = (mods[q.module]||0)+1);
  console.log('  模块分布:', JSON.stringify(mods));
  assert('包含策略选择', mods['策略选择'] >= 2, mods['策略选择']);

  console.log('== 模拟作答（记录错题） ==');
  // 模拟：把策略选择前3题答错，其他答对
  const wrongIds = [];
  daily.questions.forEach((q, i) => {
    if (q.isSubjective) { Store.recordSubjective(q.id); return; }
    const isWrong = q.module === '策略选择' && i < 3;
    if (isWrong) wrongIds.push(q.id);
    Store.recordAnswer(q.id, !isWrong);
  });
  Quiz.markSeen(daily.questions);
  const answers = Store.getAnswers();
  assert('作答记录已保存', Object.keys(answers).length === 10, Object.keys(answers).length);
  assert('错题3道', wrongIds.length === 3, wrongIds.length);

  console.log('== 抽题：错题重刷 ==');
  const mistakes = await Quiz.drawMistakes();
  assert('错题重刷含3道错题', mistakes.questions.length === 3, mistakes.questions.length);
  const ids = mistakes.questions.map(q => q.id);
  wrongIds.forEach(w => assert('错题 ' + w + ' 在重刷列表中', ids.includes(w)));

  console.log('== 抽题：已掌握降权（答对2次的题不应优先） ==');
  // 选一个模拟时答对过的题，再答对2次 → correct=3, wrong=0 → 已掌握
  const goodQ = daily.questions.find(q => !q.isSubjective && !wrongIds.includes(q.id));
  Store.recordAnswer(goodQ.id, true);
  Store.recordAnswer(goodQ.id, true);
  const s = Quiz._score(goodQ, Store.getAnswers(), {});
  assert('掌握题得分=10（最低优先级）', s === 10, s);
  const wrongQ = daily.questions.find(q => wrongIds.includes(q.id));
  const sw = Quiz._score(wrongQ, Store.getAnswers(), {});
  assert('薄弱题得分<掌握题（优先抽取）', sw < s, sw + ' vs ' + s);

  console.log('== 抽题：score排序方向（越小越优先） ==');
  const freshQ = Bank.questions.find(q => !q.isSubjective && !Store.getAnswers()[q.id]);
  const sFresh = Quiz._score(freshQ, Store.getAnswers(), {});
  assert('未做过题得分=0（最优先）', sFresh === 0, sFresh);
  assert('全错题(1) < 掌握题(10)', sw === 1, sw);
  assert('未做过(0) < 全错(1)', sFresh < sw, sFresh + ' vs ' + sw);

  console.log('== 模块练习 ==');
  const mod = await Quiz.drawModule('策略选择', 5);
  assert('策略选择抽5题', mod.questions.length === 5, mod.questions.length);
  mod.questions.forEach(q => assert('全部为策略选择', q.module === '策略选择'));

  console.log('== 主观题完成标记 ==');
  const subDone = Store.getSubDone();
  assert('主观题已标记完成', Object.keys(subDone).length === 1, Object.keys(subDone).length);

  console.log('== 打卡统计 ==');
  Store.recordQuiz({ mode: 'daily', title: '今日测验', total: 11, answered: 11, correct: 7, rate: 64 });
  assert('打卡天数=1', Store.getStreak() === 1, Store.getStreak());

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
