/* ===== 应用主逻辑：视图渲染 + 卡片交互 ===== */
(function (global) {
  /* ?reset=1 一键重置：清空本站全部数据（仅 whteacher_ 前缀键），从 C1 第1天重新开始（第13轮） */
  if (/[?&]reset=1/.test(location.search)) {
    Object.keys(localStorage).forEach(k => { if (k.indexOf('whteacher_') === 0) localStorage.removeItem(k); });
    history.replaceState(null, '', location.pathname + location.hash);
  }
  const App = {
    view: 'home',
    el() { return document.getElementById('view'); },

    /* ---------- 初始化 ---------- */
    init() {
      this.bindTabs();
      this.bindBrand();
      this.bindSwipe();
      this.show('home');
      Promise.all([Bank.load(), Cycle.load(), KNOWLEDGE.load()]).then(() => this.renderHome()).catch(() => {});
    },

    show(name) {
      this.view = name;
      document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === name);
      });
      if (name === 'home') this.renderHome();
      else if (name === 'mistakes') this.renderMistakes();
      else if (name === 'knowledge') this.renderKnowledge();
      else if (name === 'stats') this.renderStats();
    },

    bindTabs() {
      document.querySelectorAll('.tab').forEach(t => {
        t.addEventListener('click', () => {
          if (Quiz.current && !Quiz.current.done) Quiz.current = null;  // 放弃当前测验不弹窗（已答记录已实时保存）
          this.show(t.dataset.tab);
        });
      });
    },
    bindBrand() {
      document.getElementById('brandBtn').addEventListener('click', () => {
        if (Quiz.current && !Quiz.current.done) Quiz.current = null;  // 放弃当前测验不弹窗
        this.show('home');
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
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        /* 知识点页：左右滑切换知识点 */
        if (this.view === 'knowledge' && KNOWLEDGE.loaded && KNOWLEDGE.items.length) {
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            const items = KNOWLEDGE.items;
            const selMod = this._kpMod || '全部';
            const list = selMod === '全部' ? items : items.filter(x => x.module === selMod);
            if (dx < 0 && this._kpIdx < list.length - 1) { this._kpIdx++; this.renderKnowledge(); }
            else if (dx > 0 && this._kpIdx > 0) { this._kpIdx--; this.renderKnowledge(); }
          }
          return;
        }
        if (!Quiz.current || Quiz.current.done) return;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) Quiz.next(); else Quiz.prev();
        }
      }, { passive: true });
    },

    /* ================= 首页（欢迎页 · 周期制） ================= */
    renderHome() {
      const streak = Store.getStreak();
      document.getElementById('streakBadge').textContent = '🔥 ' + streak;
      document.getElementById('streakBadge').className = 'streak' + (Store.fireDim() ? ' dim' : '');
      document.getElementById('streakBadge').title = Store.fireDim() ? '昨天刷过，今天再刷续上火苗 ♡' : (Store.fireActive() ? '连续刷题 ' + streak + ' 天' : '连续刷题天数');
      const logs = Store.getLogs();
      const todayDone = logs.some(l => l.date === Store.today() && l.mode && l.mode.indexOf('cycle:') === 0);
      const userDone = Object.keys(Store.getAnswers()).length + Object.keys(Store.getSubDone()).length;
      /* 断打卡检测：有历史记录但最近一次刷题不在今天/昨天 → 偷懒场景（欢迎页显示lazy语） */
      const isLazy = streak === 0 && logs.length > 0;
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

      /* 3天分组提示：默认今天该刷第X组；前后天的卡片也可手动点击进入练习 */
      const groupCards = Array.from({ length: cfg.days }, (_, i) => {
        const d = i + 1;
        const isToday = !cycleOver && d === showDay;
        const isDone = cycleOver ? true : (d < showDay || (d === showDay && todayDone));
        return `
          <div class="cycle-day ${isToday ? 'today' : ''} ${isDone ? 'done' : ''}" data-day="${d}" role="button" aria-label="进入第${d}天练习">
            <div class="cycle-day-label">第${d}天${isToday ? ' · 今天' : ''}</div>
            <div class="cycle-day-count">${perDay}题</div>
            <div class="cycle-day-state">${cycleOver ? '✓ 已完成' : (isDone ? '✓ 已完成' : (isToday ? '← 该刷这组' : '点击进入'))}</div>
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
          <p style="margin-top:6px;font-size:13px;color:var(--text-light);">距考试约 <b>${this.daysToExam()}</b> 天 · ${Store.fireDim() ? '<span style="color:#94a3b8;">🔥' + streak + ' 火苗待续</span>' : '🔥 连续打卡 ' + streak + ' 天'}</p>
          <div class="husband-msg">💗 ${EMOTION.pick(isLazy ? 'lazy' : 'welcome', { cycleId: cycle.id })}</div>
          ${cycleCard}
          <div class="cycle-groups">${groupCards}</div>
          ${cycleOver ? `
          <button class="btn-main" id="btnMistakes2" style="background:var(--accent);box-shadow:0 4px 14px rgba(167,139,250,.35);">📕 去今日错题复习</button>` : `
          <div id="startMsg" class="start-msg"></div>
          <button class="btn-main" id="btnDaily">${todayDone ? '✅ 今日已完成 · 查看统计' : '🚀 开始今日刷题（第' + showDay + '组）'}</button>
          <button class="btn-sec" id="btnMistakes">📕 今日错题复习</button>`}
        </div>
        <div class="section-title">今日目标</div>
        <div class="card" style="font-size:13px;color:var(--text-light);">
          · ${cfg.id}周期共 ${cfg.total} 题（${cfg.days}天 · 每天${perDay}题）<br>
          · 培训师已为你安排好全部内容，你只需要按顺序刷题 ♡<br>
          · 已刷 <b>${userDone}</b> 题 / 题库 ${Bank.questions.length} 题
        </div>
        ${this.feedbackCard()}
      `;
      const btnM2 = document.getElementById('btnMistakes2');
      if (btnM2) btnM2.addEventListener('click', () => this.show('mistakes'));
      /* 组卷并开始某天的练习（首页主按钮=当天；分组卡片=指定天） */
      const startDay = async (day) => {
        const btn = document.getElementById('btnDaily');
        const msg = document.getElementById('startMsg');
        if (msg) msg.innerHTML = '💗 ' + EMOTION.pick('dailyStart', { cycleId: cycle.id });
        if (btn) { btn.textContent = '组卷中…'; btn.disabled = true; }
        const cfg = await Quiz.drawCycle(day);
        if (!cfg.questions.length) { alert('题库暂时无法组卷，请稍后再试（或检查网络/服务器）'); this.renderHome(); return; }
        Quiz.start(cfg);
      };
      document.getElementById('btnDaily') && document.getElementById('btnDaily').addEventListener('click', () => {
        if (todayDone) { this.show('stats'); return; }
        startDay();
      });
      document.querySelectorAll('.cycle-day[data-day]').forEach(el => {
        el.addEventListener('click', () => startDay(parseInt(el.dataset.day, 10)));
      });
      document.getElementById('btnMistakes') && document.getElementById('btnMistakes').addEventListener('click', async () => {
        const cfg = await Quiz.drawTodayReview();
        if (!cfg.questions.length) { alert('暂无错题，继续加油！'); return; }
        Quiz.start(cfg);
      });
      this.bindFeedbackCard();
    },

    /* 距考试天数（倒计时，暂按配置的考试日期） */
    daysToExam() {
      const target = new Date(CONFIG.site.examDate + 'T00:00:00');
      const now = new Date(Store.today() + 'T00:00:00');
      return Math.max(0, Math.ceil((target - now) / 86400000));
    },

    /* ================= 首页反馈卡片（不分类型，提交生成结构化反馈） ================= */
    feedbackCard() {
      return `
        <div class="section-title">💬 反馈给辅导师</div>
        <div class="card">
          <div style="font-size:13px;color:var(--text-light);margin-bottom:8px;">有疑问、建议或想调整的内容直接写下来，提交后复制发给辅导师；下周期题单会根据你的反馈调整 ♡</div>
          <textarea id="fbText" class="fb-text" placeholder="写下你的反馈：哪道题看不懂？哪个知识点想多练？哪里用得不顺手？"></textarea>
          <button class="btn-main" id="fbSubmit" style="margin-top:10px;" disabled>📋 生成反馈</button>
          <div id="fbResult"></div>
        </div>`;
    },

    bindFeedbackCard() {
      const ta = document.getElementById('fbText');
      const btn = document.getElementById('fbSubmit');
      if (!ta || !btn) return;
      const upd = () => { btn.disabled = !ta.value.trim(); };
      ta.addEventListener('input', upd);
      btn.addEventListener('click', () => this.submitFeedback());
    },

    submitFeedback() {
      const text = (document.getElementById('fbText') || {}).value || '';
      const fb = { type: '', tag: '', text: text.trim() };
      Store.saveFeedback(fb);
      // 生成可复制的结构化反馈文本
      const score = Store.getLogs().slice(-1)[0];
      const lines = [
        '【反馈】',
        '时间：' + Store.today(),
        '内容：' + (text.trim() || '(无补充说明)'),
        score ? ('最近成绩：' + score.rate + '%（' + score.correct + '/' + score.answered + '）') : '',
      ].filter(Boolean);
      const out = lines.join('\n');
      const resultHtml = `
        <div class="analysis-box" style="margin-top:10px;">
          <div class="analysis-label">已生成，复制后发到辅导师会话：</div>
          <pre class="fb-out">${esc(out)}</pre>
          <button class="btn-nav btn-next" id="fbCopy" style="width:100%;">📄 复制反馈</button>
        </div>`;
      const ta = document.getElementById('fbText');
      const btn = document.getElementById('fbSubmit');
      if (ta) ta.value = '';
      if (btn) btn.disabled = true;
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

    /* 知识点区块：分类行 + 内容行（一句话总结）+ 联想/易混（编号解析为简要概括，不展示编号）
       无kp/kp_mix字段的题（未标注批次）降级不显示 */
    kpBlock(q) {
      const kp = (q.kp || '').trim();
      const mix = (q.kp_mix || '').trim();
      const cat = q.tag || q.module || '';
      if (!kp && !mix) return '';
      let mixHtml = '';
      if (mix) {
        mixHtml = mix.split('；').map(seg => {
          seg = seg.trim();
          if (!seg) return '';
          const isLink = seg.indexOf('联想') === 0;
          const isConfuse = seg.indexOf('易混') === 0;
          const cls = isLink ? 'kp-link' : isConfuse ? 'kp-confuse' : '';
          const icon = isLink ? '🔗' : isConfuse ? '⚠️' : '·';
          let text = seg;
          if (isLink || isConfuse) {
            /* 提取全部编号；去掉括号编号与裸编号（KP-xxx/A#/B#/C#/L#）保留自由文本；
               纯编号段用 linkText 解析为"名称：一句话概括"（不展示编号） */
            const refs = seg.match(/(KP-[A-Z]{2,3}\d+|[ABC]\d+|L\d+)/g) || [];
            const ref = refs[0] || '';
            let cleaned = seg
              .replace(/[（(](?:KP-[A-Z]{2,3}\d+|[ABC]\d+|L\d+)[^)）]*[)）]/g, '')
              .replace(/(KP-[A-Z]{2,3}\d+|[ABC]\d+|L\d+)/g, '')
              .replace(/[、，,]\s*$/, '')
              .trim();
            const body = cleaned.replace(/^(联想|易混)\s*[:：]?\s*/, '').trim();
            if (body) {
              text = cleaned;
            } else if (ref && KNOWLEDGE && KNOWLEDGE.loaded) {
              const lt = KNOWLEDGE.linkText({ ref });
              if (lt) text = (isLink ? '联想' : '易混') + '：' + lt;
            }
          }
          return `<div class="kp-mix ${cls}">${icon} ${esc(text)}</div>`;
        }).join('');
      }
      return `
        <div class="kp-block">
          ${cat ? `<div class="kp-cat">📂 ${esc(cat)}</div>` : ''}
          ${kp ? `<div class="kp-line">📌 ${esc(kp)}</div>` : ''}
          ${mixHtml}
        </div>`;
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
            ${this.kpBlock(q)}
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
            ${this.kpBlock(q)}
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

      /* 老公语选句：反复出错 > 低分 > 正常打卡分档（轻量负面+安抚，答题中不弹） */
      const cycleId = (Store.getCycle() || {}).id || CONFIG.cycle.id;
      const hasRepeatWrong = Object.values(Store.getAnswers()).some(r => r.wrong >= 3);
      const husText = hasRepeatWrong
        ? EMOTION.pick('repeatWrong', { cycleId })
        : (rate < 60 ? EMOTION.pick('lowScore', { cycleId }) : EMOTION.streakMsg(Store.getStreak(), { cycleId }));

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
        <div class="card hus-card">
          <div class="hus-title">❤️ 老公的鼓励</div>
          <div class="hus-text">${husText}</div>
          <div class="hus-sub">${EMOTION.pick('done', { cycleId })}</div>
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

    /* ================= 知识点页（学习卡片 · 记住了打卡 · 滑动切换） ================= */
    renderKnowledge() {
      const items = KNOWLEDGE.items;
      if (!KNOWLEDGE.loaded) {
        /* 加载中：显示占位，加载完成后重渲染（不递归死循环） */
        this.el().innerHTML = '<div class="empty"><div class="empty-emoji">📚</div>知识点加载中…</div>';
        KNOWLEDGE.load().then(() => { if (this.view === 'knowledge') this.renderKnowledge(); });
        return;
      }
      if (!items.length) {
        /* 加载失败/空：显示空态（不再递归） */
        this.el().innerHTML = '<div class="empty"><div class="empty-emoji">📚</div>知识点暂时不可用，稍后再试</div>';
        return;
      }
      const remembered = Store.getKpRemembered();
      const mods = ['全部'].concat(KNOWLEDGE.modules().map(m => m.name));
      const selMod = this._kpMod || '全部';
      const list = selMod === '全部' ? items : items.filter(x => x.module === selMod);
      /* 默认从第一个未记住的开始 */
      if (this._kpIdx === undefined || this._kpIdx >= list.length) {
        const firstUn = list.findIndex(x => !remembered[x.id]);
        this._kpIdx = firstUn >= 0 ? firstUn : 0;
      }
      const cur = list[this._kpIdx];
      if (!cur) { this.el().innerHTML = '<div class="empty">暂无知识点</div>'; return; }
      const done = remembered[cur.id];
      const memCount = items.filter(x => remembered[x.id]).length;
      const linksHtml = (cur.links || []).map(l => {
        /* 学习卡片：摘抄知识点相对完整展示（full=true 不截断），字号弱于总结归纳（CSS .kp-study-card .kp-mix 12px） */
        const t = KNOWLEDGE.linkText(l, { full: true });
        if (!t) return '';
        const cls = l.type === '联想' ? 'kp-link' : 'kp-confuse';
        const icon = l.type === '联想' ? '🔗' : '⚠️';
        return `<div class="kp-mix ${cls}">${icon} ${esc(t)}</div>`;
      }).join('');

      this.el().innerHTML = `
        <div class="section-title">📚 知识点学习 · 已记 ${memCount} / ${items.length}</div>
        <div class="kp-mod-chips">${mods.map(m => `<button class="chip ${selMod === m ? 'active' : ''}" data-kpmod="${esc(m)}">${esc(m)}</button>`).join('')}</div>
        <div class="card kp-study-card">
          <div class="kp-study-head">
            <span class="quiz-progress">${this._kpIdx + 1} / ${list.length}</span>
            <span class="quiz-tag obj">${esc(cur.module)}</span>
          </div>
          <div class="kp-cat">📂 ${esc(cur.cat)}</div>
          <div class="kp-study-name">${esc(cur.name)}</div>
          <div class="kp-study-summary">${esc(cur.summary)}</div>
          ${linksHtml}
          ${done ? `<div class="kp-done-msg">✅ 已于 ${done} 记住</div>` : ''}
          <button class="btn-main" id="kpRemember" style="margin-top:12px;" ${done ? 'disabled' : ''}>${done ? '✅ 已记住' : '🧠 记住了'}</button>
        </div>
        <div class="hint">左右滑动切换知识点</div>
      `;
      document.querySelectorAll('.kp-mod-chips .chip').forEach(c => {
        c.addEventListener('click', () => { this._kpMod = c.dataset.kpmod; this._kpIdx = 0; this.renderKnowledge(); });
      });
      /* 滑块归位修复：重渲染后 chips 滚动位置被重置，选中标签可能滚出可视区 → 手动滚动使其居中 */
      const chips = document.querySelector('.kp-mod-chips');
      const activeChip = chips && chips.querySelector('.chip.active');
      if (chips && activeChip) {
        const cRect = chips.getBoundingClientRect();
        const aRect = activeChip.getBoundingClientRect();
        if (aRect.left < cRect.left || aRect.right > cRect.right) {
          chips.scrollLeft += aRect.left - cRect.left - (cRect.width - aRect.width) / 2;
        }
      }
      const btn = document.getElementById('kpRemember');
      if (btn && !done) btn.addEventListener('click', () => {
        Store.recordKpRemembered(cur.id);
        const fresh = Store.getKpRemembered();
        const nextUn = list.findIndex((x, i) => i > this._kpIdx && !fresh[x.id]);
        if (nextUn >= 0) this._kpIdx = nextUn;
        else if (this._kpIdx < list.length - 1) this._kpIdx++;
        this.renderKnowledge();
      });
    },
    renderMistakes() {
      const answers = Store.getAnswers();
      const recs = Store.wrongRecords();
      const bankQuestions = Bank.loaded ? Bank.questions : [];
      const rows = recs
        .map(x => {
          const q = bankQuestions.find(q => q.id === x.id && !q.isSubjective);
          return q ? { q, rec: x.rec } : null;
        })
        .filter(Boolean);
      const dueN = rows.filter(r => Store.reviewDue(r.rec)).length;
      const kpSum = q => (q.kp || '').trim() || (q.tag || q.module || '');

      this.el().innerHTML = `
        <div class="section-title">📕 今日错题复习</div>
        <div class="card" style="padding:10px;font-size:13px;color:var(--text-light);">
          按记忆曲线（错后 1/2/4 天）安排复习：到期错题 🔔 优先，其余按错误次数与遗忘时间排序。
        </div>
        <div class="section-title">错题清单（${rows.length}题${dueN ? ' · 🔔' + dueN + '题到期' : ''}）</div>
        <div class="card" style="padding:6px 0;">
          ${rows.length ? `<ul class="menu-list">
            ${rows.map(({ q, rec }) => {
              const due = Store.reviewDue(rec);
              const days = Store.daysSinceLastWrong(rec);
              return `<li data-qid="${q.id}"><div><div class="menu-title" style="font-weight:500;font-size:14px;">${due ? '🔔 ' : ''}${esc(kpSum(q))}</div>
              <div class="menu-sub">${esc(q.stem.slice(0, 34))}… · ${rec.wrong}次答错${days >= 0 ? ' · ' + days + '天前' : ''}</div></div><span class="menu-arrow">›</span></li>`;
            }).join('')}
          </ul>
          <button class="btn-main" id="btnReDo" style="margin:12px;">📕 开始今日错题复习（${rows.length}题）</button>` : '<div class="empty"><div class="empty-emoji">🎉</div>暂无错题，继续保持！</div>'}
        </div>
      `;
      const redo = document.getElementById('btnReDo');
      if (redo) redo.addEventListener('click', async () => {
        const cfg = await Quiz.drawTodayReview();
        if (cfg.questions.length) Quiz.start(cfg);
      });
    },

    /* ================= 统计页（日历按月 + 双折线图 + 周期切换） ================= */
    renderStats() {
      const logs = Store.getLogs();
      const answers = Store.getAnswers();
      /* 周期筛选：默认当前周期（最新出现的周期），可选历史周期；null=全部 */
      const allCycleIds = Store.cycleIds();
      const currentCycleId = (Store.getCycle() || {}).id || CONFIG.cycle.id;
      if (!allCycleIds.length) allCycleIds.push(currentCycleId);
      if (!this._viewCycle) this._viewCycle = currentCycleId;
      const viewLogs = (this._viewCycle && this._viewCycle !== '__all__')
        ? Store.cycleLogs(this._viewCycle)
        : logs;

      const totalCorrect = Object.values(answers).reduce((s, r) => s + r.correct, 0);
      const totalWrong = Object.values(answers).reduce((s, r) => s + r.wrong, 0);
      const rate = (totalCorrect + totalWrong) ? Math.round(totalCorrect / (totalCorrect + totalWrong) * 100) : 0;

      /* 日历：按月分页（练习日高亮+正确率） */
      const cal = this.calendarHtml(viewLogs);
      /* 折线图1：最近14次练习正确率 */
      const recent = viewLogs.filter(l => l.rate !== undefined && l.rate !== null).slice(-14);
      const chart1 = this.lineChart(recent.map(l => ({ label: l.date.slice(5), value: l.rate })), '最近14次练习正确率');
      /* 折线图2：历史累计周期平均正确率 */
      const perCycle = allCycleIds.map(id => {
        const ls = Store.cycleLogs(id).filter(l => l.rate !== undefined && l.rate !== null);
        const avg = ls.length ? Math.round(ls.reduce((s, l) => s + l.rate, 0) / ls.length) : null;
        return { label: '周期' + id, value: avg };
      }).filter(x => x.value !== null);
      const chart2 = this.lineChart(perCycle, '历史累计周期平均正确率');

      /* 知识点掌握 */
      const tagStats = {};
      const bankQuestions = Bank.loaded ? Bank.questions : [];
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
        ${this.cycleSwitcherHtml(allCycleIds, currentCycleId)}
        <div class="stat-total">
          <div class="kpi"><div class="kpi-num" style="color:var(--primary);">${totalCorrect + totalWrong}</div><div class="kpi-label">总刷题量</div></div>
          <div class="kpi"><div class="kpi-num" style="color:var(--success);">${rate}%</div><div class="kpi-label">总体正确率</div></div>
          <div class="kpi"><div class="kpi-num" style="color:var(--warning);">${Store.getStreak()}</div><div class="kpi-label">连续打卡</div></div>
        </div>
        <div class="section-title">练习日历${this._viewCycle && this._viewCycle !== '__all__' ? ' · 周期' + esc(this._viewCycle) : ''}</div>
        <div class="card"><div class="calendar">${cal}</div></div>
        <div class="section-title">📈 ${chart1.title}</div>
        <div class="card">${chart1.svg || '<div class="empty">暂无练习记录</div>'}</div>
        <div class="section-title">📈 ${chart2.title}</div>
        <div class="card">${chart2.svg || '<div class="empty">暂无周期记录</div>'}</div>
        <div class="section-title">知识点掌握度（累计）</div>
        <div class="card">
          ${tagList.length ? tagList.map(t => {
            const cls = t.rate >= 80 ? 'rate-good' : t.rate >= 60 ? 'rate-mid' : 'rate-bad';
            return `<div class="knowledge-item"><span>${esc(t.name)} <span style="color:var(--text-light);font-size:12px;">(${t.n}次)</span></span><span class="rate ${cls}">${t.rate}%</span></div>
            <div class="bar"><div style="width:${t.rate}%"></div></div>`;
          }).join('') : '<div class="empty">刷题后这里会出现知识点掌握分析</div>'}
        </div>
        <div class="section-title">测验记录${this._viewCycle && this._viewCycle !== '__all__' ? ' · 周期' + esc(this._viewCycle) : ''}</div>
        <div class="card" style="padding:6px 0;">
          ${viewLogs.length ? `<ul class="menu-list">
            ${viewLogs.slice(-15).reverse().map(l => `<li><div><div class="menu-title">${esc(l.title)}</div><div class="menu-sub">${l.date} · 客观${l.rate}% · 作答${l.answered}/${l.total}</div></div></li>`).join('')}
          </ul>` : '<div class="empty"><div class="empty-emoji">📈</div>暂无测验记录</div>'}
        </div>
      `;
      this.bindCycleSwitcher();
      const calPrev = document.getElementById('calPrev');
      const calNext = document.getElementById('calNext');
      if (calPrev) calPrev.addEventListener('click', () => this.shiftCal(-1));
      if (calNext) calNext.addEventListener('click', () => this.shiftCal(1));
    },

    shiftCal(delta) {
      const now = new Date();
      const ym = this._calYm || { y: now.getFullYear(), m: now.getMonth() + 1 };
      let m = ym.m + delta, y = ym.y;
      if (m < 1) { m = 12; y--; }
      if (m > 12) { m = 1; y++; }
      this._calYm = { y, m };
      this.renderStats();
    },

    /* 周期切换器 HTML（可切换已完成周期，默认当前周期） */
    cycleSwitcherHtml(ids, currentId) {
      const opts = [{ id: currentId, label: '周期' + currentId + ' · 当前' }];
      ids.forEach(id => { if (id !== currentId) opts.push({ id, label: '周期' + id }); });
      opts.push({ id: '__all__', label: '全部' });
      const active = this._viewCycle;
      return `
        <div class="cycle-switch">
          ${opts.map(o => `<button class="chip ${active === o.id ? 'active' : ''}" data-cycle="${o.id}">${o.label}</button>`).join('')}
        </div>`;
    },

    bindCycleSwitcher() {
      document.querySelectorAll('.cycle-switch .chip').forEach(c => {
        c.addEventListener('click', () => {
          this._viewCycle = c.dataset.cycle;
          this.renderStats();
        });
      });
    },

    /* 日历：按月分页，练习日高亮+正确率（月份导航） */
    calendarHtml(logs) {
      const now = new Date();
      const ym = this._calYm || { y: now.getFullYear(), m: now.getMonth() + 1 };
      const { y, m } = ym;
      const byDate = {};
      logs.forEach(l => { byDate[l.date] = byDate[l.date] || []; byDate[l.date].push(l); });
      const first = new Date(y, m - 1, 1);
      const startDow = first.getDay();                 // 0=周日
      const daysInMonth = new Date(y, m, 0).getDate();
      const cells = [];
      for (let i = 0; i < startDow; i++) cells.push('<div class="day blank"></div>');
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const ls = byDate[ds];
        let cls = 'day';
        let inner = d;
        if (ls && ls.length) {
          const rs = ls.filter(l => l.rate !== undefined && l.rate !== null);
          const r = rs.length ? Math.round(rs.reduce((s, l) => s + l.rate, 0) / rs.length) : null;
          cls += ' done' + (r !== null ? (r >= 60 ? '' : ' low') : '');
          inner = `${d}<span class="day-rate">${r !== null ? r + '%' : '✓'}</span>`;
        }
        if (ds === Store.today()) cls += ' today';
        cells.push(`<div class="${cls}">${inner}</div>`);
      }
      const monthNav = `
        <div class="cal-nav">
          <button class="chip" id="calPrev">‹ 上月</button>
          <span style="font-size:14px;font-weight:600;">${y}年${m}月</span>
          <button class="chip" id="calNext">下月 ›</button>
        </div>`;
      // 绑定月份导航（DOM 尚未挂载，返回 html + 由调用方绑定）
      this._calNavHtml = monthNav;
      this._calGrid = `<div class="cal-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div class="cal-grid">${cells.join('')}</div>`;
      return monthNav + this._calGrid;
    },

    /* 折线图（SVG 自绘，无依赖） */
    lineChart(points, title) {
      const n = points.length;
      if (!n) return { title, svg: '' };
      const W = 300, H = 90, PAD = 8;
      const max = Math.max(...points.map(p => p.value), 100);
      const min = Math.min(...points.map(p => p.value), 0);
      const span = Math.max(max - min, 1);
      const x = i => n === 1 ? W / 2 : PAD + i * (W - PAD * 2) / (n - 1);
      const y = v => H - PAD - (v - min) / span * (H - PAD * 2);
      const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
      const labels = points.map((p, i) =>
        `<text x="${x(i).toFixed(1)}" y="${H - 2}" font-size="8" text-anchor="middle" fill="#94a3b8">${esc(String(p.label).slice(0, 5))}</text>`).join('');
      const vals = points.map((p, i) =>
        `<text x="${x(i).toFixed(1)}" y="${(y(p.value) - 4).toFixed(1)}" font-size="8" text-anchor="middle" fill="#ec4899">${p.value}%</text>`).join('');
      return {
        title,
        svg: `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;">
          <polyline points="${pts.join(' ')}" fill="none" stroke="#ec4899" stroke-width="2" stroke-linejoin="round"/>
          ${points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.5" fill="#ec4899"/>`).join('')}
          ${vals}${labels}
        </svg>`
      };
    },
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
