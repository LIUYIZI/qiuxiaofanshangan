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
require('../data/emotion.js');
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

  console.log('== 周期题单加载（cycle-C1.json · 正式60题） ==');
  await Cycle.load();
  assert('题单已加载', Cycle.hasPlan(), Cycle.plan);
  const pcfg = Cycle.cfg();
  assert('题单配置C1/3天/每天20题/共60题', pcfg.id === 'C1' && pcfg.days === 3 && pcfg.perDay === 20 && pcfg.total === 60, pcfg);
  assert('第1天20个题目ID', Cycle.idsForDay(1).length === 20, Cycle.idsForDay(1));
  assert('第2天20个题目ID', Cycle.idsForDay(2).length === 20);
  assert('第3天20个题目ID', Cycle.idsForDay(3).length === 20);
  assert('第4天无题目（超出计划）', Cycle.idsForDay(4).length === 0);

  console.log('== 抽题：周期当日（题单模式 · 每天20题） ==');
  const cycle = await Quiz.drawCycle();
  assert('题单优先：当日20题', cycle.questions.length === 20, cycle.questions.length);
  assert('来自题单', cycle.fromPlan === true, cycle.fromPlan);
  assert('客观20题', cycle.questions.filter(q => !q.isSubjective).length === 20);
  assert('主观0题', cycle.questions.filter(q => q.isSubjective).length === 0);
  assert('标题含周期编号', cycle.mode === 'cycle:C1', cycle.mode);
  assert('标题含天数', cycle.title.indexOf('第') > 0, cycle.title);
  // 模块分布（第1天：策略6/判断4/言语4/常识3/数量3）
  const mods = {};
  cycle.questions.forEach(q => mods[q.module] = (mods[q.module]||0)+1);
  console.log('  当日模块:', JSON.stringify(mods));
  assert('第1天含策略选择', mods['策略选择'] === 6, mods['策略选择']);
  assert('第1天含判断推理', mods['判断推理'] === 4, mods['判断推理']);

  console.log('== 模拟作答（记录错题） ==');
  const wrongIds = [];
  cycle.questions.forEach((q, i) => {
    const isWrong = i < 1;
    if (isWrong) wrongIds.push(q.id);
    Store.recordAnswer(q.id, !isWrong);
  });
  Quiz.markSeen(cycle.questions);
  const answers = Store.getAnswers();
  assert('作答记录已保存', Object.keys(answers).length === 20, Object.keys(answers).length);
  assert('错题1道', wrongIds.length === 1, wrongIds.length);

  console.log('== 抽题：今日错题复习（第12轮） ==');
  const mistakes = await Quiz.drawTodayReview();
  assert('错题复习含错题', mistakes.questions.length >= 1, mistakes.questions.length);
  assert('复习模式mode=review', mistakes.mode === 'review', mistakes.mode);
  const ids = mistakes.questions.map(q => q.id);
  wrongIds.forEach(w => assert('错题 ' + w + ' 在复习列表中', ids.includes(w)));

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

  console.log('== 周期结束判定（题单cfg：20题/天·共60题） ==');
  const pcfg2 = Cycle.cfg();
  // 1天完成1组（20题）未达标 → 未结束
  assert('1组未结束周期', !Store.cycleFinished(cyc2, pcfg2));
  // 3天到点（start 拨到4天前）→ 结束
  const oldCycle = { id: 'C1', start: Store.dateOffset(-4), dayDone: {} };
  assert('3天到点周期结束', Store.cycleFinished(oldCycle, pcfg2));
  // 累计完成3组（60题）→ 结束
  const doneCycle = { id: 'C1', start: Store.today(), dayDone: { [Store.today()]: 3 } };
  assert('刷完60题周期结束', Store.cycleFinished(doneCycle, pcfg2));

  console.log('== 打卡统计 ==');
  Store.recordQuiz({ mode: 'cycle:C1', title: 'C1周期 · 第1天', total: 2, answered: 2, correct: 1, rate: 50 });
  assert('打卡天数=1', Store.getStreak() === 1, Store.getStreak());

  console.log('== 火苗（第12轮·抖音聊天火苗规则） ==');
  assert('今天有日志→fireActive', Store.fireActive());
  assert('今天刷过→非fireDim', !Store.fireDim());
  /* 模拟断1天：把最后一条日志日期改到昨天 */
  const logs1 = Store.getLogs();
  const last = logs1[logs1.length - 1];
  const origDate = last.date;
  last.date = Store.dateOffset(-1);
  Store.saveLogs(logs1);
  assert('断1天→fireDim', Store.fireDim());
  assert('断1天→连续天数保留', Store.getStreak() >= 1);
  last.date = origDate;
  Store.saveLogs(logs1);
  assert('恢复后fireActive', Store.fireActive());

  console.log('== 知识点打卡（第12轮） ==');
  Store.recordKpRemembered('KP-CS01');
  assert('记住了已记录', Store.getKpRemembered()['KP-CS01'] === Store.today());
  assert('学习打卡日期统计', Store.kpStudyDays()[Store.today()] >= 1);

  console.log('== 错题复习权重（第12轮·艾宾浩斯 1/2/4/7/15） ==');
  const wrongRec = Object.values(Store.getAnswers()).find(r => r.wrong > 0);
  assert('有错题记录', !!wrongRec);
  assert('daysSinceLastWrong>=0', Store.daysSinceLastWrong(wrongRec) >= 0);
  const mk = (wrong, daysAgo) => ({ wrong, hist: [{ d: Store.dateOffset(-daysAgo), ok: false }], last: Store.dateOffset(-daysAgo) });
  assert('当天错→未到期', !Store.reviewDue(mk(1, 0)));
  assert('错后1天→到期', Store.reviewDue(mk(1, 1)));
  assert('错后2天→到期', Store.reviewDue(mk(1, 2)));
  assert('错后3天→未到期', !Store.reviewDue(mk(1, 3)));
  assert('错后15天→到期', Store.reviewDue(mk(1, 15)));
  assert('到期权重>未到期', Store.reviewWeight(mk(1, 1)) > Store.reviewWeight(mk(1, 3)));
  assert('错2次权重>错1次', Store.reviewWeight(mk(2, 3)) > Store.reviewWeight(mk(1, 3)));
  assert('wrongRecords按权重降序', Store.wrongRecords().length >= 1);

  console.log('== 周期聚合（第12轮） ==');
  assert('cycleIds含C1', Store.cycleIds().includes('C1'));
  assert('cycleLogs(C1)非空', Store.cycleLogs('C1').length >= 1);
  assert('cycleLogs(C9)空', Store.cycleLogs('C9').length === 0);

  console.log('== 情绪语库（老公角色） ==');
  const EM = global.EMOTION;
  assert('welcome语料5条', EM.welcome.length === 5, EM.welcome.length);
  assert('dailyStart语料5条', EM.dailyStart.length === 5, EM.dailyStart.length);
  assert('done语料5条', EM.done.length === 5, EM.done.length);
  assert('打卡分档3/7/14各3条', EM.streak[3].length === 3 && EM.streak[7].length === 3 && EM.streak[14].length === 3);
  assert('打卡其他档3条', EM.streak.other.length === 3, EM.streak.other.length);
  /* {name} 称谓归一化：模板{name}与渲染后任意具体称谓统一为"小凡"比较 */
  const normAny = s => String(s).replace(/\{name\}|老婆|凡姐|凡宝|宝贝/g, '小凡');
  const pickIn = (cat, opts) => EM.pool(cat, opts && opts.cycleId).some(s => normAny(s) === normAny(EM.pick(cat, opts)));
  const streakIn = (arr, streak, opts) => arr.some(s => normAny(s) === normAny(EM.streakMsg(streak, opts)));
  assert('pick(welcome) 在语料内', pickIn('welcome'));
  assert('pick(dailyStart) 在语料内', pickIn('dailyStart'));
  assert('pick(done) 在语料内', pickIn('done'));
  assert('pick(lazy) 在语料内', pickIn('lazy'));
  assert('pick(lowScore) 在语料内', pickIn('lowScore'));
  assert('pick(repeatWrong) 在语料内', pickIn('repeatWrong'));
  // 分档选择：未达里程碑用 other，达到用对应档，区间内用上一档
  assert('0天→其他档', streakIn(EM.streak.other, 0));
  assert('2天→其他档', streakIn(EM.streak.other, 2));
  assert('3天→3天档', streakIn(EM.streak[3], 3));
  assert('5天→3天档（未到7）', streakIn(EM.streak[3], 5));
  assert('7天→7天档', streakIn(EM.streak[7], 7));
  assert('13天→7天档', streakIn(EM.streak[7], 13));
  assert('14天→14天档', streakIn(EM.streak[14], 14));
  assert('20天→14天档', streakIn(EM.streak[14], 20));
  // 语料质量：全部短句（{name}占位按"小凡"2字计）、不含图片引用
  const allMsgs = [...EM.welcome, ...EM.dailyStart, ...EM.done, ...EM.streak[3], ...EM.streak[7], ...EM.streak[14], ...EM.streak.other, ...EM.lazy, ...EM.lowScore, ...EM.repeatWrong];
  const short = s => s.split('{name}').join('小凡').length;
  assert('全部语料短句≤30字', allMsgs.every(s => short(s) <= 30), allMsgs.map(s => [s, short(s)]).filter(x => x[1] > 30));
  assert('语料不含图片引用', !JSON.stringify(allMsgs).match(/<img|\.png|\.jpg/i));
  assert('老公角色自称贯穿', allMsgs.filter(s => s.indexOf('老公') >= 0).length >= 10, allMsgs.filter(s => s.indexOf('老公') >= 0).length);

  console.log('== 情绪语库每日轮换（第8.5轮） ==');
  const d1 = '2026-09-01', d2 = '2026-09-02';
  assert('同日固定：welcome同一条', EM.pick('welcome', {date: d1}) === EM.pick('welcome', {date: d1}));
  assert('同日固定：dailyStart同一条', EM.pick('dailyStart', {date: d1}) === EM.pick('dailyStart', {date: d1}));
  assert('同日固定：done同一条', EM.pick('done', {date: d1}) === EM.pick('done', {date: d1}));
  assert('连续两天不同：welcome', EM.pick('welcome', {date: d1}) !== EM.pick('welcome', {date: d2}));
  assert('连续两天不同：dailyStart', EM.pick('dailyStart', {date: d1}) !== EM.pick('dailyStart', {date: d2}));
  assert('连续两天不同：done', EM.pick('done', {date: d1}) !== EM.pick('done', {date: d2}));
  assert('日期种子结果在语料内', pickIn('welcome', {date: d1}));
  assert('seed跨月进位也每天+1', EM.seedOf('2026-09-30') + 1 === EM.seedOf('2026-10-01'));
  assert('分档语日期轮换：3档', streakIn(EM.streak[3], 3, {date: d1}) && streakIn(EM.streak[3], 3, {date: d2}));
  assert('分档语日期轮换：other档', streakIn(EM.streak.other, 1, {date: d1}) && streakIn(EM.streak.other, 1, {date: d2}));

  console.log('== 情绪语库周期专属（第8.5轮） ==');
  const savedPeriods = EM.periods;
  EM.periods = {
    C2: {
      welcome: ['周期C2专属欢迎语A', '周期C2专属欢迎语B'],
      dailyStart: ['周期C2专属首刷语'],
    }
  };
  assert('周期专属优先：welcome来自C2', ['周期C2专属欢迎语A', '周期C2专属欢迎语B'].includes(EM.pick('welcome', {cycleId: 'C2', date: d1})));
  assert('周期专属优先：dailyStart来自C2', EM.pick('dailyStart', {cycleId: 'C2', date: d1}) === '周期C2专属首刷语');
  assert('未覆盖分类回退：done用通用', pickIn('done', {cycleId: 'C2', date: d1}));
  assert('streak未覆盖回退：other用通用', streakIn(EM.streak.other, 1, {cycleId: 'C2', date: d1}));
  assert('无周期参数用通用语料', pickIn('welcome', {date: d1}));
  EM.periods.C2.streak = { other: ['周期C2常规档语'] };
  assert('streak周期覆盖生效', EM.streakMsg(1, {cycleId: 'C2', date: d1}) === '周期C2常规档语');
  EM.periods = savedPeriods;
  assert('恢复periods后回退通用', pickIn('welcome', {cycleId: 'C2', date: d1}));

  console.log('== 情绪语库称谓与负面语料（第9轮） ==');
  assert('称谓池7个且小凡权重3', EM.names.length === 7 && EM.names.filter(n => n === '小凡').length === 3, EM.names);
  assert('nameFor返回池内称谓', EM.names.includes(EM.nameFor(d1)));
  assert('称谓同日固定', EM.nameFor(d1) === EM.nameFor(d1));
  assert('称谓替换后无{name}残留', !EM.pick('welcome', {date: d1}).includes('{name}') && !EM.streakMsg(1, {date: d1}).includes('{name}'));
  assert('称谓替换有效（文本含称谓池词）', EM.names.some(n => EM.pick('welcome', {date: d1}).includes(n)));
  assert('负面语料各3条', EM.lazy.length === 3 && EM.lowScore.length === 3 && EM.repeatWrong.length === 3);
  const neg = [...EM.lazy, ...EM.lowScore, ...EM.repeatWrong];
  assert('负面语料均带安抚符号', neg.every(s => /[♡🌸❤️]/.test(s)));
  assert('负面语料含轻量情绪词', neg.every(s => /无语|担心|失望|着急|偷懒|错/.test(s)));
  assert('负面语料不真骂', neg.every(s => !/废物|蠢|笨|滚|讨厌/.test(s)));
  assert('负面语料句末安抚收尾', neg.every(s => /[♡🌸❤️]$/.test(s)));
  assert('负面语料日期轮换', EM.pick('lazy', {date: d1}) !== EM.pick('lazy', {date: d2}));
  EM.periods = { C2: { lazy: ['周期C2专属偷懒语 ♡'] } };
  assert('周期lazy覆盖生效', EM.pick('lazy', {cycleId: 'C2', date: d1}) === '周期C2专属偷懒语 ♡');
  EM.periods = savedPeriods;

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
