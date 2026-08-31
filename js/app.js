/* ===== 应用主逻辑：视图渲染 + 卡片交互 ===== */
(function (global) {
  const App = {
    view: 'home',
    el() { return document.getElementById('view'); },

    /* ---------- 初始化 ---------- */
    init() {
      this.bindTabs();
      this.bindBrand();
      this.bindSwipe();
      this.show('home');
      Promise.all([Bank.load(), Cycle.load()]).then(() => this.renderHome()).catch(() => {});
    },

    show(name) {
      this.view = name;
      document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === name);
      });
      if (name === 'home') this.renderHome();
      else if (name === 'mistakes') this.renderMistakes();
      else if (name === 'feedback') this.renderFeedback();
      else if (name === 'stats') this.renderStats();
    },

    bindTabs() {
      document.querySelectorAll('.tab').forEach(t => {
        t.addEventListener('click', () => {
          if (Quiz.current && !Quiz.current.done && !confirm('退出当前测验？')) return;
          this.show(t.dataset.tab);
        });
      });
    },
    bindBrand() {
      document.getElementById('brandBtn').addEventListener('click', () => {
        if (Quiz.current && !Quiz.current.done) {
          if (confirm('退出当前测验？作答记录将保留。')) { Quiz.current = null; this.show('home'); }
        } else this.show('home');
      });
    },

    /* ---------- 滑动切换 ---------- */
    bindSwipe() {
      const view = document.getElementById('view');
      let startX = 0, startY = 0;
      view.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      }, { passive: true });
      view.addEventListener('touchend', e => {
        if (!Quiz.current || Quiz.current.done) return;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) Quiz.next(); else Quiz.prev();
        }
      }, { passive: true });
    },

    /* ================= 首页（欢迎页 · 周期制） ================= */
    renderHome() {
      const streak = Store.getStreak();
      document.getElementById('streakBadge').textContent = '🔥 ' + streak;
      const logs = Store.getLogs();
      const todayDone = logs.some(l => l.date === Store.today() && l.mode && l.mode.indexOf('cycle:') === 0);
      const userDone = Object.keys(Store.getAnswers()).length + Object.keys(Store.getSubDone()).length;
      const loadWarn = Bank.error ? `
        <div class="card" style="background:#fef2f2;border:1px solid #fecaca;margin-bottom:14px;">
          ⚠️ 题库加载失败：若你是本地双击打开的，请改用本地服务器（python3 -m http.server 8000）或直接访问线上链接。
        </div>` : '';

      /* 周期进度 */
      let cycle = Store.getCycle();
      if (!cycle) {
        cycle = { id: CONFIG.cycle.id, start: Store.today(), dayDone: {} };
        Store.saveCycle(cycle);   // 首次进入：记录周期开始日
      }
      const day = Store.cycleDay(cycle);
      const cfg = Cycle.cfg();
      const perDay = Math.max(1, Math.round(cfg.total / cfg.days));
      const cycleOver = Store.cycleFinished(cycle, cfg);
      const showDay = Math.min(day, cfg.days);

      /* 3天分组提示：今天该刷第几天（第X组） */
      const groupCards = Array.from({ length: cfg.days }, (_, i) => {
        const d = i + 1;
        const isToday = !cycleOver && d === showDay;
        const isDone = cycleOver ? true : (d < showDay || (d === showDay && todayDone));
        return `
          <div class="cycle-day ${isToday ? 'today' : ''} ${isDone ? 'done' : ''}" data-day="${d}">
            <div class="cycle-day-label">第${d}天${isToday ? ' · 今天' : ''}</div>
            <div class="cycle-day-count">${perDay}题</div>
            <div class="cycle-day-state">${cycleOver ? '✓ 已完成' : (isDone ? '✓ 已完成' : (isToday ? '← 该刷这组' : ''))}</div>
          </div>`;
      }).join('');

      const cycleCard = cycleOver ? `
        <div class="cycle-banner">
          <div class="cycle-banner-id">周期 ${cycle.id} 已结束</div>
        </div>
        <div class="card" style="background:var(--primary-soft);border:1px solid var(--primary);margin-top:10px;">
          <div style="font-size:15px;font-weight:700;color:var(--primary-dark);">🎉 本周期刷题完成！</div>
          <div style="font-size:13px;color:var(--text-light);margin-top:4px;">培训师正在分析你的作答，即将为你制定下一周期（C2）♡<br>这两天可以先去「错题」页重刷错题，保持手感。</div>
        </div>` : `
        <div class="cycle-banner">
          <div class="cycle-banner-id">周期 ${cycle.id}</div>
          <div class="cycle-banner-progress">第 ${showDay} / ${CONFIG.cycle.days} 天</div>
        </div>`;

      this.el().innerHTML = `
        ${loadWarn}
        <div class="card hero fade-in">
          <h1>🌸 球小凡上岸！</h1>
          <p>${CONFIG.site.target}</p>
          <p style="margin-top:6px;font-size:13px;color:var(--text-light);">距考试约 <b>${this.daysToExam()}</b> 天 · 连续打卡 ${streak} 天</p>
          ${cycleCard}
          <div class="cycle-groups">${groupCards}</div>
          ${cycleOver ? `
          <button class="btn-main" id="btnMistakes2" style="background:var(--accent);box-shadow:0 4px 14px rgba(167,139,250,.35);">📕 去错题页重刷</button>` : `
          <button class="btn-main" id="btnDaily">${todayDone ? '✅ 今日已完成 · 查看统计' : '🚀 开始今日刷题（第' + showDay + '组）'}</button>
          <button class="btn-sec" id="btnMistakes">📕 错题重刷</button>`}
        </div>
        <div class="section-title">今日目标</div>
        <div class="card" style="font-size:13px;color:var(--text-light);">
          · ${cfg.id}周期共 ${cfg.total} 题（${cfg.days}天 · 每天${perDay}题）<br>
          · 培训师已为你安排好全部内容，你只需要按顺序刷题 ♡<br>
          · 已刷 <b>${userDone}</b> 题 / 题库 ${Bank.questions.length} 题
        </div>
      `;
      const btnM2 = document.getElementById('btnMistakes2');
      if (btnM2) btnM2.addEventListener('click', () => this.show('mistakes'));
      document.getElementById('btnDaily') && document.getElementById('btnDaily').addEventListener('click', async () => {
        if (todayDone) { this.show('stats'); return; }
        document.getElementById('btnDaily').textContent = '组卷中…';
        const cfg = await Quiz.drawCycle();
        if (!cfg.questions.length) { alert('题库暂时无法组卷，请稍后再试（或检查网络/服务器）'); this.renderHome(); return; }
        Quiz.start(cfg);
      });
      document.getElementById('btnMistakes') && document.getElementById('btnMistakes').addEventListener('click', async () => {
        const cfg = await Quiz.drawMistakes();
        if (!cfg.questions.length) { alert('暂无待重刷错题，继续加油！'); return; }
        Quiz.start(cfg);
      });
    },

    /* 距考试天数（倒计时，暂按配置的考试日期） */
    daysToExam() {
      const target = new Date(CONFIG.site.examDate + 'T00:00:00');
      const now = new Date(Store.today() + 'T00:00:00');
      return Math.max(0, Math.ceil((target - now) / 86400000));
    },

    /* ================= 反馈页 ================= */
    renderFeedback() {
      const history = Store.getFeedbacks().slice().reverse();
      this.el().innerHTML = `
        <div class="section-title">反馈给辅导师</div>
        <div class="card">
          <div style="font-size:13px;color:var(--text-light);margin-bottom:10px;">反馈类型（点选后填写说明，提交会生成一条结构化反馈，复制后发到 Hermes 会话即可，我会处理）</div>
          <div class="fb-types">
            <button class="fb-type" data-type="疑问">❓ 知识点疑问</button>
            <button class="fb-type" data-type="再练">🔁 想再练</button>
            <button class="fb-type" data-type="bug">🐛 系统bug</button>
            <button class="fb-type" data-type="优化">💡 优化建议</button>
          </div>
          <div id="fbExtra"></div>
          <textarea id="fbText" class="fb-text" placeholder="补充说明（可选）：哪道题看不懂？想练哪个知识点？遇到了什么问题？"></textarea>
          <button class="btn-main" id="fbSubmit" style="margin-top:10px;" disabled>📋 生成反馈</button>
          <div id="fbResult"></div>
        </div>
        <div class="section-title">反馈历史（${history.length}）</div>
        <div class="card" style="padding:6px 0;">
          ${history.length ? `<ul class="menu-list">${history.map(f => `
            <li><div><div class="menu-title" style="font-size:13px;">${esc(f.type)}${f.tag ? ' · ' + esc(f.tag) : ''}</div>
            <div class="menu-sub">${esc((f.text || '').slice(0, 50)) || '（无说明）'} · ${f.date}</div></div></li>`).join('')}
          </ul>` : '<div class="empty"><div class="empty-emoji">💬</div>还没有反馈记录</div>'}
        </div>
      `;
      this._fbType = '';
      document.querySelectorAll('.fb-type').forEach(b => {
        b.addEventListener('click', () => {
          this._fbType = b.dataset.type;
          document.querySelectorAll('.fb-type').forEach(x => x.classList.toggle('active', x === b));
          this.renderFbExtra();
          this.updateFbSubmit();
        });
      });
      document.getElementById('fbText').addEventListener('input', () => this.updateFbSubmit());
      document.getElementById('fbSubmit').addEventListener('click', () => this.submitFeedback());
    },

    renderFbExtra() {
      const box = document.getElementById('fbExtra');
      if (!box) return;
      if (this._fbType === '再练') {
        const tags = [...new Set(Bank.questions.filter(q => !q.isSubjective).map(q => q.tag || q.module))];
        box.innerHTML = `
          <div style="font-size:13px;color:var(--text-light);margin:6px 0;">选择要再练的知识点：</div>
          <select id="fbTag" class="fb-select">
            ${tags.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
          </select>
          <button class="btn-sec" id="fbPractice" style="margin-top:8px;">▶ 直接开始练习该知识点</button>`;
        document.getElementById('fbPractice').addEventListener('click', async () => {
          if (Quiz.current && !Quiz.current.done && !confirm('退出当前测验？')) return;
          const tag = document.getElementById('fbTag').value;
          const qs = Bank.questions.filter(q => !q.isSubjective && (q.tag || q.module) === tag);
          if (qs.length) Quiz.start({ questions: qs, mode: 'tag:' + tag, title: tag + ' · 针对性练习' });
          else alert('该知识点暂无题目');
        });
      } else {
        box.innerHTML = '';
      }
    },

    updateFbSubmit() {
      const btn = document.getElementById('fbSubmit');
      if (!btn) return;
      const hasType = !!this._fbType;
      const hasText = (document.getElementById('fbText') && document.getElementById('fbText').value.trim());
      btn.disabled = !hasType && !hasText;
      btn.textContent = hasType ? '📋 生成反馈' : '📋 生成反馈（先选类型或填说明）';
    },

    submitFeedback() {
      const type = this._fbType;
      const tagEl = document.getElementById('fbTag');
      const tag = tagEl ? tagEl.value : '';
      const text = (document.getElementById('fbText') || {}).value || '';
      const fb = { type: type || '反馈', tag: tag, text: text.trim() };
      Store.saveFeedback(fb);
      // 生成可复制的结构化反馈文本
      const score = Store.getLogs().slice(-1)[0];
      const lines = [
        '【反馈】' + (type || '反馈'),
        '时间：' + Store.today(),
        '内容：' + (text.trim() || '(无补充说明)') + (tag ? '（知识点：' + tag + '）' : ''),
        score ? ('最近成绩：' + score.rate + '%（' + score.correct + '/' + score.answered + '）') : '',
      ].filter(Boolean);
      const out = lines.join('\n');
      const resultHtml = `
        <div class="analysis-box" style="margin-top:10px;">
          <div class="analysis-label">已生成，复制后发到 Hermes 会话：</div>
          <pre class="fb-out">${esc(out)}</pre>
          <button class="btn-nav btn-next" id="fbCopy" style="width:100%;">📄 复制反馈</button>
        </div>`;
      this.renderFeedback();  // 重渲染（清空输入状态、刷新历史）
      const box = document.getElementById('fbResult');
      if (box) box.innerHTML = resultHtml;
      const copyBtn = document.getElementById('fbCopy');
      if (copyBtn) copyBtn.addEventListener('click', () => {
        let ok = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(out).then(() => { copyBtn.textContent = '✅ 已复制'; }).catch(() => { copyBtn.textContent = '⚠️ 复制失败，请长按选择文本手动复制'; });
          return;
        }
        const pre = document.querySelector('.fb-out');
        if (pre) {
          const range = document.createRange();
          range.selectNodeContents(pre);
          const sel = window.getSelection();
          sel.removeAllRanges(); sel.addRange(range);
          try { ok = document.execCommand('copy'); } catch (e) {}
          sel.removeAllRanges();
        }
        copyBtn.textContent = ok ? '✅ 已复制' : '⚠️ 复制失败，请长按选择文本手动复制';
      });
    },

    /* ================= 测验卡片 ================= */
    renderQuiz(anim) {
      const c = Quiz.current;
      if (!c) { this.show('home'); return; }
      const q = c.questions[c.idx];
      const total = c.questions.length;
      const cls = anim || 'fade-in';
      const hasAnswered = !!c.results[c.idx];
      const res = c.results[c.idx];
      const isSub = q.isSubjective;

      const tagClass = isSub ? 'sub' : 'obj';
      const tagText = isSub ? '主观题' : q.module;
      const srcTag = q.source && q.source.indexOf('真题') >= 0
        ? `<span class="quiz-tag real" style="margin-left:6px;">真题</span>` : '';

      let body = '';
      if (isSub) {
        body = this.subjectiveCard(q, res, hasAnswered);
      } else {
        body = this.objectiveCard(q, res, hasAnswered);
      }

      this.el().innerHTML = `
        <div class="card ${cls}" id="quizCard">
          <div class="quiz-head">
            <span class="quiz-progress">${c.idx + 1} / ${total}</span>
            <span><span class="quiz-tag ${tagClass}">${tagText}</span>${srcTag}</span>
          </div>
          <div class="quiz-stem">${esc(q.stem)}</div>
          ${body}
          <div class="quiz-nav">
            <button class="btn-nav btn-prev" id="btnPrev" ${c.idx === 0 ? 'disabled style="opacity:.4"' : ''}>← 上一题</button>
            <button class="btn-nav btn-next" id="btnNext">${c.idx === total - 1 ? '完成测验 ✓' : '下一题 →'}</button>
          </div>
          <div class="hint">左右滑动也可切换题目</div>
        </div>
      `;
      document.getElementById('btnPrev').addEventListener('click', () => Quiz.prev());
      document.getElementById('btnNext').addEventListener('click', () => Quiz.next());
    },

    /* 客观题卡片 */
    objectiveCard(q, res, hasAnswered) {
      const opts = (q.options || []).map((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        const isAnswer = letter === q.answerKey;
        let cls = 'option';
        let disabled = '';
        if (hasAnswered) {
          disabled = 'disabled';
          if (isAnswer) cls += ' correct';
          else if (res && res.picked === letter) cls += ' wrong';
          else cls += ' dim';
        }
        return `<button class="${cls}" data-letter="${letter}" ${disabled}>${opt}</button>`;
      }).join('');

      let analysis = '';
      if (hasAnswered) {
        const ok = res && res.ok;
        analysis = `
          <div class="analysis-box">
            <span class="answer-badge ${ok ? 'ok' : 'no'}">${ok ? '✓ 回答正确' : '✗ 回答错误 · 正确答案 ' + q.answerKey}</span>
            <div class="analysis-source">📌 ${esc(q.tag || q.module)}${q.source ? ' · ' + esc(q.source) : ''}</div>
            <div class="analysis-label">解读</div>${esc(q.analysis || '（解析待补充）')}
          </div>`;
      }

      return `
        <div id="optionsWrap">${opts}</div>
        ${analysis}
      `;
    },

    /* 主观题卡片 */
    subjectiveCard(q, res, hasAnswered) {
      let reveal = '';
      if (hasAnswered) {
        reveal = `
          <div class="analysis-box">
            <span class="answer-badge ok">✓ 已作答，对照参考答案</span>
            <div class="analysis-source">📌 ${esc(q.tag || q.module)}${q.source ? ' · ' + esc(q.source) : ''}</div>
            <div class="analysis-label">参考答案</div>${esc(q.answer || '')}
            ${q.points ? `<div class="analysis-label" style="margin-top:8px;">评分要点</div>${esc(q.points)}` : ''}
          </div>`;
      }
      return `
        <div class="sub-answer">
          <textarea id="subText" placeholder="先在下方写下你的作答思路（可跳过，直接看答案）" ${hasAnswered ? 'disabled' : ''}></textarea>
        </div>
        ${hasAnswered ? reveal : `<button class="btn-nav btn-reveal" style="width:100%;margin-top:6px;" id="btnReveal">📖 查看参考答案</button>`}
      `;
    },

    /* ================= 结束页 ================= */
    renderResult(log) {
      const c = Quiz.current;
      const objResults = c.results.filter(r => r && r.ok !== null);
      const total = objResults.length;
      const correct = objResults.filter(r => r.ok).length;
      const rate = total ? Math.round(correct / total * 100) : 0;

      // 知识点掌握度
      const kp = {};
      objResults.forEach(r => {
        const key = r.q.tag || r.q.module;
        kp[key] = kp[key] || { ok: 0, total: 0 };
        kp[key].total++; if (r.ok) kp[key].ok++;
      });
      const kpList = Object.keys(kp).map(k => ({
        name: k, rate: Math.round(kp[k].ok / kp[k].total * 100), total: kp[k].total
      })).sort((a, b) => a.rate - b.rate);

      const weak = kpList.filter(x => x.rate < 60);
      const kpHtml = kpList.map(k => {
        const cls = k.rate >= 80 ? 'rate-good' : k.rate >= 60 ? 'rate-mid' : 'rate-bad';
        return `
          <div class="knowledge-item">
            <span>${esc(k.name)} <span style="color:var(--text-light);font-size:12px;">(${k.total}题)</span></span>
            <span class="rate ${cls}">${k.rate}%</span>
          </div>
          <div class="bar"><div style="width:${k.rate}%"></div></div>`;
      }).join('') || '<div class="empty">今日全是主观题，正确率不计入。</div>';

      this.el().innerHTML = `
        <div class="result-score fade-in">
          <div class="big">${rate}%</div>
          <div class="sub">客观题正确率：${correct}/${total}</div>
        </div>
        <div class="kpi-row">
          <div class="kpi"><div class="kpi-num" style="color:var(--primary);">${log.answered}</div><div class="kpi-label">已作答</div></div>
          <div class="kpi"><div class="kpi-num" style="color:var(--success);">${correct}</div><div class="kpi-label">答对</div></div>
          <div class="kpi"><div class="kpi-num" style="color:${weak.length ? 'var(--danger)' : 'var(--success)'};">${weak.length}</div><div class="kpi-label">薄弱点</div></div>
        </div>
        <div class="card">
          <div class="section-title" style="margin-top:0;">📊 知识点掌握度</div>
          ${kpHtml}
        </div>
        ${weak.length ? `<div class="card" style="background:#fef2f2;border:1px solid #fecaca;">
          <div class="section-title" style="margin-top:0;color:#b91c1c;">⚠️ 需要补强</div>
          <div style="font-size:14px;">${weak.map(w => esc(w.name)).join('、')}——薄弱知识点已自动提高出现权重，明日测验会优先推送，也可立即到「错题」页重刷。</div>
        </div>` : `<div class="card" style="background:#f0fdf4;border:1px solid #bbf7d0;">
          <div style="font-size:14px;">🎉 今日知识点掌握良好！保持节奏，明天见。</div>
        </div>`}
        <button class="btn-main" id="btnHome">返回首页</button>
      `;
      document.getElementById('btnHome').addEventListener('click', () => {
        Quiz.current = null;
        this.show('home');
      });
    },

    /* ================= 错题页 ================= */
    renderMistakes() {
      const answers = Store.getAnswers();
      const wrongIds = Object.keys(answers).filter(id => {
        const r = answers[id];
        return r.wrong > 0 && r.correct === 0;
      });
      const bankQuestions = Bank.loaded ? Bank.questions : [];
      const wrongQs = bankQuestions.filter(q => wrongIds.includes(q.id) && !q.isSubjective);

      this.el().innerHTML = `
        <div class="section-title">待重刷错题（${wrongQs.length}题）</div>
        <div class="card" style="padding:6px 0;">
          ${wrongQs.length ? `<ul class="menu-list">
            ${wrongQs.map(q => `<li data-qid="${q.id}"><div><div class="menu-title" style="font-weight:500;font-size:14px;">${esc(q.stem.slice(0, 40))}…</div><div class="menu-sub">${esc(q.module)} · ${esc(q.tag)} · ${answers[q.id].wrong}次答错</div></div><span class="menu-arrow">›</span></li>`).join('')}
          </ul>
          <button class="btn-main" id="btnReDo" style="margin:12px;">重刷全部错题（${wrongQs.length}题）</button>` : '<div class="empty"><div class="empty-emoji">🎉</div>暂无待重刷错题</div>'}
        </div>
      `;
      const redo = document.getElementById('btnReDo');
      if (redo) redo.addEventListener('click', async () => {
        const cfg = await Quiz.drawMistakes();
        if (cfg.questions.length) Quiz.start(cfg);
      });
    },

    /* ================= 统计页 ================= */
    renderStats() {
      const logs = Store.getLogs();
      const answers = Store.getAnswers();
      const totalCorrect = Object.values(answers).reduce((s, r) => s + r.correct, 0);
      const totalWrong = Object.values(answers).reduce((s, r) => s + r.wrong, 0);
      const rate = (totalCorrect + totalWrong) ? Math.round(totalCorrect / (totalCorrect + totalWrong) * 100) : 0;

      // 近14天打卡日历
      let cal = '';
      for (let i = 13; i >= 0; i--) {
        const d = Store.dateOffset(-i);
        const done = logs.some(l => l.date === d);
        cal += `<div class="day ${done ? 'done' : ''} ${d === Store.today() ? 'today' : ''}">${d.slice(8)}</div>`;
      }

      // 知识点掌握
      const kp = {};
      Object.keys(answers).forEach(id => {
        const r = answers[id];
        kp[id] = r;
      });
      const bankQuestions = Bank.loaded ? Bank.questions : [];
      const tagStats = {};
      bankQuestions.forEach(q => {
        const rec = answers[q.id];
        if (!rec || q.isSubjective) return;
        const tag = q.tag || q.module;
        tagStats[tag] = tagStats[tag] || { ok: 0, wrong: 0 };
        tagStats[tag].ok += rec.correct;
        tagStats[tag].wrong += rec.wrong;
      });
      const tagList = Object.keys(tagStats).map(t => ({
        name: t,
        rate: Math.round(tagStats[t].ok / (tagStats[t].ok + tagStats[t].wrong) * 100),
        n: tagStats[t].ok + tagStats[t].wrong
      })).sort((a, b) => a.rate - b.rate);

      this.el().innerHTML = `
        <div class="stat-total">
          <div class="kpi"><div class="kpi-num" style="color:var(--primary);">${totalCorrect + totalWrong}</div><div class="kpi-label">总刷题量</div></div>
          <div class="kpi"><div class="kpi-num" style="color:var(--success);">${rate}%</div><div class="kpi-label">总体正确率</div></div>
          <div class="kpi"><div class="kpi-num" style="color:var(--warning);">${Store.getStreak()}</div><div class="kpi-label">连续打卡</div></div>
        </div>
        <div class="section-title">近14天打卡</div>
        <div class="card"><div class="calendar">${cal}</div></div>
        <div class="section-title">知识点掌握度（累计）</div>
        <div class="card">
          ${tagList.length ? tagList.map(t => {
            const cls = t.rate >= 80 ? 'rate-good' : t.rate >= 60 ? 'rate-mid' : 'rate-bad';
            return `<div class="knowledge-item"><span>${esc(t.name)} <span style="color:var(--text-light);font-size:12px;">(${t.n}次)</span></span><span class="rate ${cls}">${t.rate}%</span></div>
            <div class="bar"><div style="width:${t.rate}%"></div></div>`;
          }).join('') : '<div class="empty">刷题后这里会出现知识点掌握分析</div>'}
        </div>
        <div class="section-title">测验记录</div>
        <div class="card" style="padding:6px 0;">
          ${logs.length ? `<ul class="menu-list">
            ${logs.slice(-15).reverse().map(l => `<li><div><div class="menu-title">${esc(l.title)}</div><div class="menu-sub">${l.date} · 客观${l.rate}% · 作答${l.answered}/${l.total}</div></div></li>`).join('')}
          </ul>` : '<div class="empty"><div class="empty-emoji">📈</div>暂无测验记录</div>'}
        </div>
      `;
    }
  };

  /* HTML转义 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 全局事件委托：选项点击 / 主观题展开 */
  document.addEventListener('click', function (e) {
    const opt = e.target.closest('.option');
    if (opt && !opt.disabled && Quiz.current && !Quiz.current.done) {
      const c = Quiz.current;
      const q = c.questions[c.idx];
      const letter = opt.dataset.letter;
      if (!letter) return;  // 无 data-letter 的元素不参与判分
      const ok = letter === q.answerKey;
      Quiz.submitAnswer(q, ok, letter);
      App.renderQuiz();
    }
    const reveal = e.target.closest('#btnReveal');
    if (reveal && Quiz.current && !Quiz.current.done) {
      const c = Quiz.current;
      const q = c.questions[c.idx];
      Quiz.submitAnswer(q, null, '');
      App.renderQuiz();
    }
  });

  global.App = App;
  global.esc = esc;

  document.addEventListener('DOMContentLoaded', () => App.init());
})(window);
