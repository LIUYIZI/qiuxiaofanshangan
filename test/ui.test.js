/* UI层测试：jsdom 模拟浏览器，验证渲染与交互 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const site = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

// 全局注入
global.window = window;
global.document = window.document;
global.localStorage = window.localStorage;
global.fetch = async url => {
  const p = path.join(site, url.replace(/^data\//, 'data/'));
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
window.fetch = global.fetch;
global.confirm = () => true;
global.alert = msg => { global.lastAlert = msg; };
window.confirm = () => true;   // jsdom 默认 confirm 未实现，需注入
window.alert = msg => { global.lastAlert = msg; };

// 加载JS（按index.html顺序）
const files = ['js/storage.js', 'js/config.js', 'data/emotion.js', 'js/bank.js', 'js/knowledge.js', 'js/cycle.js', 'js/quiz.js', 'js/app.js'];
files.forEach(f => {
  const code = fs.readFileSync(path.join(site, f), 'utf8');
  window.eval(code);
});

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + JSON.stringify(extra) : '')); }
}

(async () => {
  const { App, Quiz, Bank, Store } = window;
  const EM = window.EMOTION;
  const allStreakMsgs = [...EM.streak.other, ...EM.streak[3], ...EM.streak[7], ...EM.streak[14]];
  /* 称谓归一化：模板{name}与渲染后的具体称谓统一为"小凡"比较 */
  const normAny = s => String(s).replace(/\{name\}|老婆|凡姐|凡宝|宝贝/g, '小凡');

  console.log('== 首页渲染（周期制欢迎页 · 题单每天20题） ==');
  App.show('home');
  await Promise.all([Bank.load(), window.Cycle.load()]);
  await new Promise(r => setTimeout(r, 100));
  let htmlOut = document.getElementById('view').innerHTML;
  assert('首页问候球小凡上岸', htmlOut.includes('球小凡上岸'));
  assert('首页含周期C1', htmlOut.includes('周期 C1'));
  assert('首页含3天分组', htmlOut.includes('第1天') && htmlOut.includes('第2天') && htmlOut.includes('第3天'));
  assert('首页含开始今日刷题', htmlOut.includes('开始今日刷题'));
  assert('首页显示每天20题', htmlOut.includes('每天20题'));
  assert('首页不含练习模式', !htmlOut.includes('练习模式'));
  assert('首页不含搜索框', !htmlOut.includes('searchInput') && !htmlOut.includes('搜索题库'));
  assert('已刷/题库数量展示', htmlOut.includes('已刷') && htmlOut.includes('题库'));

  console.log('== 情绪语库UI：欢迎页老公陪伴语 ==');
  assert('欢迎页含老公陪伴语容器', htmlOut.includes('husband-msg'));
  assert('欢迎页老公语无{name}残留', !htmlOut.includes('{name}'));
  assert('欢迎页老公语含称谓', EM.names.some(n => htmlOut.includes(n)));
  assert('欢迎页语料=当日日期种子', htmlOut.includes(EM.pick('welcome', { cycleId: (window.Store.getCycle() || {}).id || window.CONFIG.cycle.id, date: window.Store.today() })));
  assert('每日首刷语容器存在', !!document.getElementById('startMsg'));

  console.log('== 启动周期当日测验 ==');
  const cfg = await Quiz.drawCycle();
  Quiz.start(cfg);
  const q0 = Quiz.currentQuestion();
  assert('测验标题为C1周期', Quiz.current.title.indexOf('C1周期') === 0);
  assert('进度显示 1/20', document.getElementById('view').innerHTML.includes('1 / ' + cfg.questions.length));
  assert('题干渲染', document.getElementById('view').innerHTML.includes(q0.stem.slice(0, 20)));

  console.log('== 客观题作答判分 ==');
  // 找到第一个客观题，模拟点击正确答案
  let idx = 0;
  while (Quiz.currentQuestion().isSubjective) { Quiz.goto(++idx); }
  const q = Quiz.currentQuestion();
  const correctLetter = q.answerKey;
  const btn = document.querySelector('[data-letter="' + correctLetter + '"]');
  assert('正确选项按钮存在', !!btn);
  if (btn) btn.click();
  let v = document.getElementById('view').innerHTML;
  assert('显示"回答正确"徽章', v.includes('回答正确'));
  assert('显示解读', v.includes('解读'));
  assert('知识点标签显示', v.includes(q.tag || q.module));
  if (q.kp) {
    assert('知识点一句话显示(kp-block)', v.includes('kp-block') && v.includes(q.kp.slice(0, 8)));
    assert('联想/易混提示(kp-mix)', v.includes('kp-mix') && (v.includes('联想') || v.includes('易混')));
  } else {
    assert('无kp字段的题不显示知识点区块', !v.includes('kp-block'));
  }

  console.log('== 下一题/上一题 ==');
  // 在第2题未答时测切题（此时 btnNext 存在；答完最后一道会触发完成页，btnNext 消失）
  const idxBefore = Quiz.current.idx;
  document.getElementById('btnNext').click();
  assert('点击下一题索引+1', Quiz.current.idx === idxBefore + 1);
  document.getElementById('btnPrev').click();
  assert('点击上一题索引-1', Quiz.current.idx === idxBefore);

  console.log('== 答错判分 ==');
  // 跳到第一个未作答的客观题，点错误选项
  let wrongIdx = 0;
  while (wrongIdx < cfg.questions.length &&
         (cfg.questions[wrongIdx].isSubjective || Quiz.current.results[wrongIdx])) wrongIdx++;
  Quiz.goto(wrongIdx);
  const qWrong = Quiz.currentQuestion();
  const wrongLetter = qWrong.options.map((o, i) => String.fromCharCode(65 + i)).find(l => l !== qWrong.answerKey);
  const btnWrong = document.querySelector('[data-letter="' + wrongLetter + '"]');
  btnWrong.click();
  v = document.getElementById('view').innerHTML;
  assert('显示"回答错误"', v.includes('回答错误'));
  assert('显示正确答案', v.includes(qWrong.answerKey));

  console.log('== 完成测验 ==');
  // 快速把剩余题目做完（全职测，无主观题）
  Quiz.goto(0);
  while (!Quiz.current.done) {
    const cq = Quiz.currentQuestion();
    const b = document.querySelector('.option:not([disabled])');
    if (b) b.click();
    if (!Quiz.current.done) Quiz.next();
  }
  v = document.getElementById('view').innerHTML;
  assert('结束页显示正确率', v.includes('%'));
  assert('结束页显示知识点掌握度', v.includes('知识点掌握度'));
  assert('结束页有返回首页按钮', v.includes('btnHome'));

  console.log('== 情绪语库UI：结束页老公打卡鼓励 ==');
  assert('结束页含老公鼓励卡片', v.includes('hus-card') && v.includes('老公的鼓励'));
  const cycleIdNow = (Store.getCycle() || {}).id || window.CONFIG.cycle.id;
  const hasRW = Object.values(Store.getAnswers()).some(r => r.wrong >= 3);
  const pRate = parseInt(v.match(/(\d+)%/) && v.match(/(\d+)%/)[1], 10);
  const expectedHus = hasRW
    ? EM.pick('repeatWrong', { cycleId: cycleIdNow, date: Store.today() })
    : (pRate < 60 ? EM.pick('lowScore', { cycleId: cycleIdNow, date: Store.today() }) : EM.streakMsg(Store.getStreak(), { cycleId: cycleIdNow, date: Store.today() }));
  assert('结束页老公语=三态选句', v.includes(expectedHus));
  assert('结束页老公语无{name}残留', !v.includes('{name}'));
  const husSubText = document.querySelector('.hus-card .hus-sub').textContent;
  assert('结束页刷完语来自语料', EM.done.some(s => normAny(s) === normAny(husSubText)));

  console.log('== 情绪语库UI：静态防回归 ==');
  const appSrc = fs.readFileSync(path.join(site, 'js/app.js'), 'utf8');
  assert('app.js 含每日首刷语调用(带周期参数)', appSrc.includes("EMOTION.pick('dailyStart', { cycleId"));
  assert('app.js 含打卡分档语调用(带周期参数)', appSrc.includes('EMOTION.streakMsg(Store.getStreak()'));
  assert('app.js 含欢迎页陪伴语调用(带周期参数)', appSrc.includes("EMOTION.pick(isLazy ? 'lazy' : 'welcome', { cycleId"));
  assert('弹窗已移除：app.js 无退出确认confirm', !appSrc.includes("confirm('退出当前测验"));
  const idxSrc = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  assert('tab已改：知识点tab存在', idxSrc.includes('data-tab="knowledge"'));
  assert('tab已改：无反馈tab', !idxSrc.includes('data-tab="feedback"'));
  assert('index.html引入knowledge.js', idxSrc.includes('js/knowledge.js'));
  assert('app.js含知识点页渲染', appSrc.includes('renderKnowledge'));
  assert('app.js含今日错题复习组卷', appSrc.includes('drawTodayReview'));
  assert('app.js含日历月份导航', appSrc.includes('calPrev') && appSrc.includes('shiftCal'));

  console.log('== 日志口径 ==');
  const logs = Store.getLogs();
  const lastLog = logs[logs.length - 1];
  const objTotal = cfg.questions.filter(q => !q.isSubjective).length;
  assert('日志total=客观题数', lastLog.total === objTotal, lastLog.total + ' vs ' + objTotal);
  assert('日志answered<=客观题数', lastLog.answered <= objTotal, lastLog.answered);
  const pageRate = parseInt(v.match(/(\d+)%/) && v.match(/(\d+)%/)[1], 10);
  assert('结果页与日志正确率一致', pageRate === lastLog.rate, pageRate + ' vs ' + lastLog.rate);

  console.log('== 周期进度（完成后） ==');
  const cyc = Store.getCycle();
  assert('周期进度已记录', !!cyc && cyc.id === 'C1', cyc);
  assert('当天已刷题数>=1', Store.cycleDayDone(cyc) >= 1, Store.cycleDayDone(cyc));

  console.log('== 回归：错题/非周期测验不污染"今日已完成" ==');
  // 模拟错题重刷产生的日志（mode=mistakes，非cycle）
  Store.recordQuiz({ mode: 'mistakes', title: '错题重刷', total: 3, answered: 3, correct: 2, rate: 67 });
  App.show('home');
  await new Promise(r => setTimeout(r, 50));
  v = document.getElementById('view').innerHTML;
  // 今天已做过周期测验 → 按钮仍显示"已完成"（这是正确的，因为周期测验确实做了）
  // 关键断言：错题日志本身不会让"开始今日刷题"变成"已完成"——用干净状态验证
  localStorage.clear();
  App.show('home');
  await new Promise(r => setTimeout(r, 50));
  v = document.getElementById('view').innerHTML;
  assert('干净状态下显示开始今日刷题', v.includes('开始今日刷题'));
  // 只记录错题日志，不记录周期日志 → 不应显示"今日已完成"
  Store.recordQuiz({ mode: 'mistakes', title: '错题重刷', total: 3, answered: 3, correct: 2, rate: 67 });
  App.show('home');
  await new Promise(r => setTimeout(r, 50));
  v = document.getElementById('view').innerHTML;
  assert('错题日志不污染今日完成判定', v.includes('开始今日刷题'), '错题重刷后按钮应为开始今日刷题');

  console.log('== 回归：周期结束显示结束卡 ==');
  localStorage.clear();
  const doneCycle = { id: 'C1', start: window.Store.dateOffset(-4), dayDone: {} };  // 3天前开始 → 已到点
  window.Store.saveCycle(doneCycle);
  App.show('home');
  await new Promise(r => setTimeout(r, 50));
  v = document.getElementById('view').innerHTML;
  assert('周期结束显示"已结束"', v.includes('已结束'));
  assert('周期结束不再显示开始刷题', !v.includes('开始今日刷题'));
  assert('周期结束引导去错题页', v.includes('btnMistakes2'));

  console.log('== 统计页（第12轮：日历按月+双折线图+周期切换） ==');
  Quiz.current = null;
  App.show('stats');
  v = document.getElementById('view').innerHTML;
  assert('统计页显示总刷题量', v.includes('总刷题量'));
  assert('统计页显示练习日历', v.includes('练习日历') && v.includes('cal-nav'));
  assert('统计页显示月份导航', v.includes('上月') && v.includes('下月'));
  assert('统计页显示折线图1', v.includes('最近14次练习正确率'));
  assert('统计页显示折线图2', v.includes('历史累计周期平均正确率'));
  assert('统计页显示周期切换器', v.includes('cycle-switch') && v.includes('周期C1'));
  assert('统计页显示测验记录', v.includes('测验记录'));

  console.log('== 首页反馈卡片（第12轮：不分类型） ==');
  App.show('home');
  v = document.getElementById('view').innerHTML;
  assert('首页含反馈卡片', v.includes('反馈给辅导师'));
  assert('反馈卡片无类型选择', !v.includes('fb-type') && !v.includes('fb-types'));
  const fbText = document.getElementById('fbText');
  fbText.value = '策略选择第3题解析看不懂';
  fbText.dispatchEvent(new window.Event('input'));
  const submitBtn = document.getElementById('fbSubmit');
  assert('填写后提交按钮可用', !submitBtn.disabled);
  submitBtn.click();
  v = document.getElementById('view').innerHTML;
  assert('生成反馈结果', v.includes('已生成'));
  assert('反馈文本含内容', v.includes('策略选择第3题解析看不懂'));

  console.log('== 知识点页（第12轮：学习卡片+记住了打卡） ==');
  await window.KNOWLEDGE.load();
  App.show('knowledge');
  v = document.getElementById('view').innerHTML;
  assert('知识点页标题与进度', v.includes('知识点学习') && v.includes('已记'));
  assert('知识点卡片含分类行', v.includes('kp-cat') && v.includes('kp-study-card'));
  assert('知识点卡片含名称', v.includes('kp-study-name'));
  assert('记住了按钮存在', v.includes('kpRemember'));
  assert('模块筛选chips存在', v.includes('kp-mod-chips'));
  const rememberBtn = document.getElementById('kpRemember');
  if (rememberBtn) {
    rememberBtn.click();
    assert('记住了已打卡', Object.keys(Store.getKpRemembered()).length >= 1);
  }
  const chip = document.querySelector('.kp-mod-chips .chip[data-kpmod="常识判断"]');
  if (chip) { chip.click(); v = document.getElementById('view').innerHTML; assert('模块筛选生效', v.includes('常识判断')); }

  console.log('== 今日错题复习页 ==');
  App.show('mistakes');
  v = document.getElementById('view').innerHTML;
  assert('错题页标题为今日错题复习', v.includes('今日错题复习'));
  assert('错题页有复习按钮或空状态', v.includes('btnReDo') || v.includes('暂无错题'));

  console.log('== 打卡徽章 ==');
  const streak = document.getElementById('streakBadge').textContent;
  assert('打卡徽章更新', streak.indexOf('🔥') === 0);

  console.log('== 情绪语库UI：负面场景（第9轮） ==');
  // 场景A：反复出错≥3次 → 结束页 repeatWrong 语
  localStorage.clear();
  const qRW = Bank.questions.find(q => !q.isSubjective);
  [false, false, false].forEach(ok => Store.recordAnswer(qRW.id, ok));
  Quiz.start({ questions: [qRW], mode: 'tA', title: 'tA' });
  Quiz.submitAnswer(qRW, true, qRW.answerKey);
  Quiz.finish();
  v = document.getElementById('view').innerHTML;
  let husTxt = document.querySelector('.hus-card .hus-text').textContent;
  assert('反复错场景显示repeatWrong语', EM.repeatWrong.some(s => normAny(s) === normAny(husTxt)), husTxt);
  // 场景B：低分<60% → 结束页 lowScore 语
  localStorage.clear();
  const qLS = Bank.questions.find(q => !q.isSubjective && q.id !== qRW.id);
  Quiz.start({ questions: [qLS], mode: 'tB', title: 'tB' });
  Quiz.submitAnswer(qLS, false, qLS.options[0].slice(0, 1));
  Quiz.finish();
  v = document.getElementById('view').innerHTML;
  husTxt = document.querySelector('.hus-card .hus-text').textContent;
  assert('低分场景显示lowScore语', EM.lowScore.some(s => normAny(s) === normAny(husTxt)), husTxt);
  // 场景C：断打卡（最近记录在2天前）→ 欢迎页 lazy 语
  localStorage.clear();
  Store.recordQuiz({ date: Store.dateOffset(-2), mode: 'cycle:C1', title: 'C1周期', total: 2, answered: 2, correct: 2, rate: 100 });
  App.show('home');
  await new Promise(r => setTimeout(r, 80));
  v = document.getElementById('view').innerHTML;
  const husHome = document.querySelector('.husband-msg').textContent.replace(/^💗\s*/, '');
  assert('断打卡场景显示lazy语', EM.lazy.some(s => normAny(s) === normAny(husHome)), husHome);
  assert('断打卡场景无{name}残留', !v.includes('{name}'));

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('UI测试异常:', e); process.exit(1); });
