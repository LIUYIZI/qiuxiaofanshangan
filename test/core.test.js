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
require('../js/cycle.js');
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
  assert('题库共459题', Bank.questions.length === 459, Bank.questions.length);
  assert('客观题 = 324', Bank.questions.filter(q => !q.isSubjective).length === 324);
  assert('主观题 = 135', Bank.questions.filter(q => q.isSubjective).length === 135);

  console.log('== 周期题单加载（cycle-C1.json） ==');
  await Cycle.load();
  assert('题单已加载', Cycle.hasPlan(), Cycle.plan);
  const pcfg = Cycle.cfg();
  assert('题单配置C1/3天/每天2题/共6题', pcfg.id === 'C1' && pcfg.days === 3 && pcfg.perDay === 2 && pcfg.total === 6, pcfg);
  assert('第1天2个题目ID', Cycle.idsForDay(1).length === 2, Cycle.idsForDay(1));
  assert('第2天2个题目ID', Cycle.idsForDay(2).length === 2);
  assert('第3天2个题目ID', Cycle.idsForDay(3).length === 2);
  assert('第4天无题目（超出计划）', Cycle.idsForDay(4).length === 0);

  console.log('== 抽题：周期当日（题单模式 · 每天2题） ==');
  const cycle = await Quiz.drawCycle();
  assert('题单优先：当日2题', cycle.questions.length === 2, cycle.questions.length);
  assert('来自题单', cycle.fromPlan === true, cycle.fromPlan);
  assert('客观2题', cycle.questions.filter(q => !q.isSubjective).length === 2);
  assert('主观0题', cycle.questions.filter(q => q.isSubjective).length === 0);
  assert('标题含周期编号', cycle.mode === 'cycle:C1', cycle.mode);
  assert('标题含天数', cycle.title.indexOf('第') > 0, cycle.title);
  // 模块分布（第1天：策略选择 + 判断推理）
  const mods = {};
  cycle.questions.forEach(q => mods[q.module] = (mods[q.module]||0)+1);
  console.log('  当日模块:', JSON.stringify(mods));
  assert('第1天含策略选择', mods['策略选择'] === 1, mods['策略选择']);
  assert('第1天含判断推理', mods['判断推理'] === 1, mods['判断推理']);

  console.log('== 模拟作答（记录错题） ==');
  const wrongIds = [];
  cycle.questions.forEach((q, i) => {
    const isWrong = i < 1;
    if (isWrong) wrongIds.push(q.id);
    Store.recordAnswer(q.id, !isWrong);
  });
  Quiz.markSeen(cycle.questions);
  const answers = Store.getAnswers();
  assert('作答记录已保存', Object.keys(answers).length === 2, Object.keys(answers).length);
  assert('错题1道', wrongIds.length === 1, wrongIds.length);

  console.log('== 抽题：错题重刷 ==');
  const mistakes = await Quiz.drawMistakes();
  assert('错题重刷含1道错题', mistakes.questions.length === 1, mistakes.questions.length);
  const ids = mistakes.questions.map(q => q.id);
  wrongIds.forEach(w => assert('错题 ' + w + ' 在重刷列表中', ids.includes(w)));

  console.log('== 抽题：已掌握降权（答对2次的题不应优先） ==');
  const goodQ = cycle.questions.find(q => !wrongIds.includes(q.id));
  Store.recordAnswer(goodQ.id, true);
  Store.recordAnswer(goodQ.id, true);
  const s = Quiz._score(goodQ, Store.getAnswers(), {});
  assert('掌握题得分=10（最低优先级）', s === 10, s);
  const wrongQ = cycle.questions.find(q => wrongIds.includes(q.id));
  const sw = Quiz._score(wrongQ, Store.getAnswers(), {});
  assert('薄弱题得分<掌握题（优先抽取）', sw < s, sw + ' vs ' + s);

  console.log('== 抽题：score排序方向（越小越优先） ==');
  const freshQ = Bank.questions.find(q => !q.isSubjective && !Store.getAnswers()[q.id]);
  const sFresh = Quiz._score(freshQ, Store.getAnswers(), {});
  assert('未做过题得分=0（最优先）', sFresh === 0, sFresh);
  assert('全错题(1) < 掌握题(10)', sw === 1, sw);
  assert('未做过(0) < 全错(1)', sFresh < sw, sFresh + ' vs ' + sw);

  console.log('== 周期进度存储 ==');
  // 模拟完成一次周期测验（finish 逻辑中的周期记录）
  const cyc = Store.getCycle() || { id: CONFIG.cycle.id, start: Store.today(), dayDone: {} };
  cyc.dayDone = cyc.dayDone || {};
  cyc.dayDone[Store.today()] = (cyc.dayDone[Store.today()] || 0) + 1;
  Store.saveCycle(cyc);
  const cyc2 = Store.getCycle();
  assert('周期进度已保存', cyc2 && cyc2.id === 'C1', cyc2);
  assert('周期第1天', Store.cycleDay(cyc2) === 1, Store.cycleDay(cyc2));
  assert('当天已刷题数=1', Store.cycleDayDone(cyc2) === 1, Store.cycleDayDone(cyc2));

  console.log('== 周期结束判定（题单cfg：2题/天·共6题） ==');
  const pcfg2 = Cycle.cfg();
  // 1天完成1组（2题）未达标 → 未结束
  assert('1组未结束周期', !Store.cycleFinished(cyc2, pcfg2));
  // 3天到点（start 拨到4天前）→ 结束
  const oldCycle = { id: 'C1', start: Store.dateOffset(-4), dayDone: {} };
  assert('3天到点周期结束', Store.cycleFinished(oldCycle, pcfg2));
  // 累计完成3组（6题）→ 结束
  const doneCycle = { id: 'C1', start: Store.today(), dayDone: { [Store.today()]: 3 } };
  assert('刷完6题周期结束', Store.cycleFinished(doneCycle, pcfg2));

  console.log('== 打卡统计 ==');
  Store.recordQuiz({ mode: 'cycle:C1', title: 'C1周期 · 第1天', total: 2, answered: 2, correct: 1, rate: 50 });
  assert('打卡天数=1', Store.getStreak() === 1, Store.getStreak());

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
