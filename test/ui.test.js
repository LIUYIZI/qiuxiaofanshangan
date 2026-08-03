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
const files = ['js/storage.js', 'js/config.js', 'js/bank.js', 'js/quiz.js', 'js/app.js'];
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

  console.log('== 首页渲染 ==');
  App.show('home');
  await new Promise(r => setTimeout(r, 100)); // 等Bank.load
  let htmlOut = document.getElementById('view').innerHTML;
  assert('首页含"开始今日测验"按钮', htmlOut.includes('开始今日测验'));
  assert('首页含模块列表', htmlOut.includes('策略选择') && htmlOut.includes('判断推理'));
  assert('已刷/题库数量展示', htmlOut.includes('已刷') && htmlOut.includes('题库'));

  console.log('== 启动今日测验 ==');
  const cfg = await Quiz.drawDaily();
  Quiz.start(cfg);
  const q0 = Quiz.currentQuestion();
  assert('测验标题为今日测验', Quiz.current.title.indexOf('今日测验') === 0);
  assert('进度显示 1/11', document.getElementById('view').innerHTML.includes('1 / ' + cfg.questions.length));
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

  console.log('== 下一题/上一题 ==');
  const idxBefore = Quiz.current.idx;
  document.getElementById('btnNext').click();
  assert('点击下一题索引+1', Quiz.current.idx === idxBefore + 1);
  document.getElementById('btnPrev').click();
  assert('点击上一题索引-1', Quiz.current.idx === idxBefore);

  console.log('== 主观题展开答案 ==');
  // 跳到主观题
  const subIdx = cfg.questions.findIndex(q => q.isSubjective);
  Quiz.goto(subIdx);
  v = document.getElementById('view').innerHTML;
  assert('主观题含作答文本框', v.includes('textarea'));
  const revealBtn = document.getElementById('btnReveal');
  assert('主观题有"查看参考答案"按钮', !!revealBtn);
  revealBtn.click();
  v = document.getElementById('view').innerHTML;
  assert('展开参考答案', v.includes('参考答案'));
  assert('展开评分要点', v.includes('评分要点') || v.includes('采分点'));

  console.log('== 完成测验 ==');
  // 快速把剩余题目做完
  Quiz.goto(0);
  while (!Quiz.current.done) {
    const cq = Quiz.currentQuestion();
    if (cq.isSubjective) {
      const rb = document.getElementById('btnReveal');
      if (rb) rb.click();
    } else {
      const b = document.querySelector('.option:not([disabled])');
      if (b) b.click();
    }
    if (!Quiz.current.done) Quiz.next();
  }
  v = document.getElementById('view').innerHTML;
  assert('结束页显示正确率', v.includes('%'));
  assert('结束页显示知识点掌握度', v.includes('知识点掌握度'));
  assert('结束页有返回首页按钮', v.includes('btnHome'));

  console.log('== 日志口径（主观题不计分） ==');
  const logs = Store.getLogs();
  const lastLog = logs[logs.length - 1];
  const objTotal = cfg.questions.filter(q => !q.isSubjective).length;
  assert('日志total=客观题数', lastLog.total === objTotal, lastLog.total + ' vs ' + objTotal);
  assert('日志answered<=客观题数', lastLog.answered <= objTotal, lastLog.answered);
  // 结果页 rate 与日志 rate 一致（页面显示 rate%，日志存 rate）
  const pageRate = parseInt(v.match(/(\d+)%/) && v.match(/(\d+)%/)[1], 10);
  assert('结果页与日志正确率一致', pageRate === lastLog.rate, pageRate + ' vs ' + lastLog.rate);

  console.log('== 统计页 ==');
  Quiz.current = null;
  App.show('stats');
  v = document.getElementById('view').innerHTML;
  assert('统计页显示总刷题量', v.includes('总刷题量'));
  assert('统计页显示打卡日历', v.includes('calendar'));
  assert('统计页显示测验记录', v.includes('测验记录'));

  console.log('== 反馈页 ==');
  App.show('feedback');
  v = document.getElementById('view').innerHTML;
  assert('反馈页含4种类型', ['知识点疑问', '想再练', '系统bug', '优化建议'].every(t => v.includes(t)));
  const typeBtn = document.querySelector('.fb-type[data-type="疑问"]');
  typeBtn.click();
  const fbText = document.getElementById('fbText');
  fbText.value = '策略选择第3题解析看不懂';
  fbText.dispatchEvent(new window.Event('input'));
  const submitBtn = document.getElementById('fbSubmit');
  assert('选择类型后提交按钮可用', !submitBtn.disabled);
  submitBtn.click();
  v = document.getElementById('view').innerHTML;
  assert('生成反馈结果', v.includes('已生成'));
  assert('反馈文本含内容', v.includes('策略选择第3题解析看不懂'));
  assert('反馈历史已记录', v.includes('反馈历史（1）'));

  console.log('== 搜索题库 ==');
  App.show('home');
  await new Promise(r => setTimeout(r, 50));
  const searchInput = document.getElementById('searchInput');
  assert('首页含搜索框', !!searchInput);
  searchInput.value = '欺凌';
  searchInput.dispatchEvent(new window.Event('input'));
  v = document.getElementById('view').innerHTML;
  assert('搜索欺凌有结果', v.includes('欺凌') && v.includes('共'));
  // chip筛选
  const chip = document.querySelector('.chip[data-mod="策略选择"]');
  if (chip) chip.click();
  v = document.getElementById('view').innerHTML;
  assert('chip筛选策略选择', v.includes('策略选择'));
  // 展开题目详情
  const firstItem = document.querySelector('.search-item');
  if (firstItem) {
    firstItem.click();
    v = document.getElementById('view').innerHTML;
    assert('展开题目详情含解读', v.includes('解读') || v.includes('参考答案'));
  }

  console.log('== A1回归：测验进行中，搜索选项不得劫持判分 ==');
  const cfg2 = await Quiz.drawDaily();
  Quiz.start(cfg2);
  const resLenBefore = Quiz.current.results.filter(Boolean).length;
  document.querySelector('.tab[data-tab="home"]').click();  // confirm mock 返回 true
  await new Promise(r => setTimeout(r, 50));
  const si2 = document.getElementById('searchInput');
  si2.value = '学生';
  si2.dispatchEvent(new window.Event('input'));
  const item2 = document.querySelector('.search-item');
  if (item2) item2.click();  // 展开详情（选项无 data-letter）
  const opt2 = document.querySelector('.search-item-detail .option');
  if (opt2) opt2.click();    // 点击搜索复习选项
  assert('搜索选项未劫持测验判分', Quiz.current.results.filter(Boolean).length === resLenBefore);
  assert('搜索选项点击后仍在测验中', !Quiz.current.done);

  console.log('== 错题页 ==');
  App.show('mistakes');
  v = document.getElementById('view').innerHTML;
  assert('错题页有重刷按钮或空状态', v.includes('btnReDo') || v.includes('暂无待重刷错题'));

  console.log('== 打卡徽章 ==');
  const streak = document.getElementById('streakBadge').textContent;
  assert('打卡徽章更新', streak.indexOf('🔥') === 0);

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('UI测试异常:', e); process.exit(1); });
