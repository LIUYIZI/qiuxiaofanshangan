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
      Bank.load().then(() => this.renderHome()).catch(() => {});
    },

    show(name) {
      this.view = name;
      document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === name);
      });
      if (name === 'home') this.renderHome();
      else if (name === 'practice') this.renderPractice();
      else if (name === 'mistakes') this.renderMistakes();
      else if (name === 'feedback') this.renderFeedback();
      else if (name === 'stats') this.renderStats();
    },

    bindTabs() {
      document.querySelectorAll('.tab').forEach(t => {
        t.addEventListener('click', () => this.show(t.dataset.tab));
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

    /* ================= 首页 ================= */
    renderHome() {
      const streak = Store.getStreak();
      document.getElementById('streakBadge').textContent = '🔥 ' + streak;
      const logs = Store.getLogs();
      const todayDone = logs.some(l => l.date === Store.today());
      const done = Bank.loaded;
      const userDone = Object.keys(Store.getAnswers()).length + Object.keys(Store.getSubDone()).length;
      const loadWarn = Bank.error ? `
        <div class="card" style="background:#fef2f2;border:1px solid #fecaca;margin-bottom:14px;">
          ⚠️ 题库加载失败：若你是本地双击打开的，请改用本地服务器（python3 -m http.server 8000）或直接访问线上链接。
        </div>` : '';
      this.el().innerHTML = `
        ${loadWarn}
        <div class="card hero fade-in">
          <h1>📘 武汉教师D类刷题</h1>
          <p>${CONFIG.site.target}</p>
          <p style="margin-top:8px;font-size:13px;color:var(--warning);">🎯 已刷 ${userDone} 题 / 题库 ${Bank.questions.length} 题 · 连续打卡 ${streak} 天</p>
          <button class="btn-main" id="btnDaily">${todayDone ? '✅ 今日已完成 · 再来一组' : '🚀 开始今日测验'}</button>
          <button class="btn-sec" id="btnMistakes">📕 错题重刷</button>
        </div>
        <div class="card" style="padding:12px 14px;">
          <input type="search" id="searchInput" class="search-input" placeholder="🔍 搜索题库：知识点 / 题干关键词 / 模块" value="${esc(this._searchQ || '')}">
          <div class="search-chips" id="searchChips"></div>
          <div id="searchResults"></div>
        </div>
        <div class="section-title">练习模式</div>
        <div class="card" style="padding:6px 0;">
          <ul class="menu-list">
            <li data-practice="策略选择"><span class="menu-emoji">🧭</span><div><div class="menu-title">策略选择</div><div class="menu-sub">教育情境决策 · D类核心得分点</div></div><span class="menu-arrow">›</span></li>
            <li data-practice="判断推理"><span class="menu-emoji">🧩</span><div><div class="menu-title">判断推理</div><div class="menu-sub">图形 / 定义 / 类比 / 逻辑</div></div><span class="menu-arrow">›</span></li>
            <li data-practice="言语理解与表达"><span class="menu-emoji">💬</span><div><div class="menu-title">言语理解与表达</div><div class="menu-sub">逻辑填空 / 片段阅读 / 语句表达</div></div><span class="menu-arrow">›</span></li>
            <li data-practice="常识判断"><span class="menu-emoji">🌐</span><div><div class="menu-title">常识判断</div><div class="menu-sub">时政教育 / 法律 / 科技 / 人文</div></div><span class="menu-arrow">›</span></li>
            <li data-practice="数量分析"><span class="menu-emoji">🔢</span><div><div class="menu-title">数量分析</div><div class="menu-sub">数量关系 / 资料分析</div></div><span class="menu-arrow">›</span></li>
            <li data-practice="__subjective"><span class="menu-emoji">✍️</span><div><div class="menu-title">综合应用（主观题）</div><div class="menu-sub">辨析 / 案例分析 / 方案设计</div></div><span class="menu-arrow">›</span></li>
          </ul>
        </div>
      `;
      document.getElementById('btnDaily').addEventListener('click', async () => {
        document.getElementById('btnDaily').textContent = '组卷中…';
        const cfg = await Quiz.drawDaily();
        Quiz.start(cfg);
      });
      document.getElementById('btnMistakes').addEventListener('click', async () => {
        const cfg = await Quiz.drawMistakes();
        if (!cfg.questions.length) { alert('暂无待重刷错题，继续加油！'); return; }
        Quiz.start(cfg);
      });
      document.querySelectorAll('[data-practice]').forEach(li => {
        li.addEventListener('click', async () => {
          const key = li.dataset.practice;
          let cfg;
          if (key === '__subjective') {
            await Bank.load();
            const subs = Bank.subjective();
            if (!subs.length) { alert('主观题题库为空'); return; }
            cfg = { questions: subs.slice(), mode: 'practice:subjective', title: '综合应用 · 主观题练习' };
          } else {
            cfg = await Quiz.drawModule(key, 10);
          }
          if (!cfg.questions.length) { alert('该模块题库建设中，敬请期待'); return; }
          Quiz.start(cfg);
        });
      });

      /* 搜索题库 */
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          this._searchQ = searchInput.value;
          this.renderSearchResults();
        });
        this.renderSearchChips();
        this.renderSearchResults();
      }
    },

    /* ================= 搜索题库 ================= */
    renderSearchChips() {
      const chips = document.getElementById('searchChips');
      if (!chips) return;
      const mods = Bank.modules();
      const sel = this._searchMod || '全部';
      chips.innerHTML = ['全部', ...Object.keys(mods)].map(m =>
        `<button class="chip ${m === sel ? 'active' : ''}" data-mod="${esc(m)}">${esc(m)}${m !== '全部' ? ' ' + mods[m] : ''}</button>`
      ).join('');
      chips.querySelectorAll('.chip').forEach(c => {
        c.addEventListener('click', () => {
          this._searchMod = c.dataset.mod === '全部' ? '' : c.dataset.mod;
          this.renderSearchChips();
          this.renderSearchResults();
        });
      });
    },

    renderSearchResults() {
      const box = document.getElementById('searchResults');
      if (!box) return;
      const q = (this._searchQ || '').trim().toLowerCase();
      const mod = this._searchMod || '';
      let list = Bank.questions.filter(qu => {
        if (mod && qu.module !== mod) return false;
        if (!q) return true;
        const hay = (qu.stem + ' ' + (qu.tag || '') + ' ' + (qu.analysis || '') + ' ' + (qu.module || '')).toLowerCase();
        return hay.includes(q);
      });
      if (!list.length) {
        box.innerHTML = '<div class="empty" style="padding:16px 0;"><div class="empty-emoji">🔍</div>没有匹配的题目</div>';
        return;
      }
      const showAll = this._searchShowAll;
      const visible = showAll ? list : list.slice(0, 15);
      box.innerHTML = `
        <div style="font-size:12px;color:var(--text-light);margin-bottom:6px;">共 ${list.length} 题${list.length > visible.length ? '，显示前15题' : ''}</div>
        ${visible.map(q => this.searchItemHtml(q)).join('')}
        ${list.length > visible.length ? '<button class="btn-sec" id="searchMore" style="margin-top:6px;">展开全部 ' + list.length + ' 题</button>' : ''}
      `;
      const more = document.getElementById('searchMore');
      if (more) more.addEventListener('click', () => { this._searchShowAll = true; this.renderSearchResults(); });
      box.querySelectorAll('[data-qid]').forEach(item => {
        item.addEventListener('click', () => this.toggleSearchDetail(item.dataset.qid));
      });
    },

    searchItemHtml(q) {
      const answered = !!Store.getAnswers()[q.id];
      const okMark = answered ? '<span style="font-size:11px;color:var(--success);">✓做过</span>' : '<span style="font-size:11px;color:var(--text-light);">未做</span>';
      return `
        <div class="search-item" data-qid="${esc(q.id)}">
          <div class="search-item-head">
            <span class="quiz-tag ${q.isSubjective ? 'sub' : 'obj'}">${esc(q.module)}</span>
            <span style="font-size:11px;color:var(--text-light);margin-left:6px;">${esc(q.tag || '')}</span>
            <span style="margin-left:auto;">${okMark}</span>
          </div>
          <div class="search-item-stem">${esc(q.stem.slice(0, 60))}${q.stem.length > 60 ? '…' : ''}</div>
          <div class="search-item-detail" style="display:none;"></div>
        </div>`;
    },

    toggleSearchDetail(id) {
      const item = document.querySelector('[data-qid="' + id + '"]');
      if (!item) return;
      const detail = item.querySelector('.search-item-detail');
      const q = Bank.questions.find(x => x.id === id);
      if (!q) return;
      if (detail.style.display === 'block') { detail.style.display = 'none'; return; }
      let html;
      if (q.isSubjective) {
        html = `<div class="analysis-box" style="margin-top:8px;">
          <div class="analysis-label">参考答案</div>${esc(q.answer || '')}
          ${q.points ? `<div class="analysis-label" style="margin-top:6px;">评分要点</div>${esc(q.points)}` : ''}
        </div>`;
      } else {
        const opts = (q.options || []).map((o, i) => {
          const L = String.fromCharCode(65 + i);
          const cls = L === q.answerKey ? 'correct' : '';
          return `<div class="option ${cls}" style="cursor:default;">${esc(o)}</div>`;
        }).join('');
        html = `<div style="margin-top:8px;">${opts}</div>
          <div class="analysis-box"><div class="analysis-label">解读</div>${esc(q.analysis || '')}</div>`;
      }
      detail.innerHTML = html;
      detail.style.display = 'block';
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
        '【反馈】' + (type || '其他'),
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
        const pre = document.querySelector('.fb-out');
        if (pre) {
          const range = document.createRange();
          range.selectNodeContents(pre);
          const sel = window.getSelection();
          sel.removeAllRanges(); sel.addRange(range);
          try { document.execCommand('copy'); } catch (e) {}
          sel.removeAllRanges();
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(out).then(() => { copyBtn.textContent = '✅ 已复制'; }).catch(() => {});
        } else { copyBtn.textContent = '✅ 已复制'; }
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

    /* ================= 练习页 ================= */
    renderPractice() {
      const logs = Store.getLogs();
      const practiceLogs = logs.filter(l => l.mode && l.mode.indexOf('module') === 0 || l.mode === 'practice:subjective');
      const recent = practiceLogs.slice(-10).reverse();
      this.el().innerHTML = `
        <div class="section-title">专项练习记录</div>
        <div class="card" style="padding:6px 0;">
          ${recent.length ? `<ul class="menu-list">
            ${recent.map(l => `<li><div><div class="menu-title">${esc(l.title)}</div><div class="menu-sub">${l.date} · 正确率 ${l.rate}%</div></div></li>`).join('')}
          </ul>` : '<div class="empty"><div class="empty-emoji">📝</div>还没有练习记录，去首页开始吧</div>'}
        </div>
        <div class="section-title">说明</div>
        <div class="card" style="font-size:13px;color:var(--text-light);">
          · 专项练习固定抽取该模块题目，薄弱优先<br>
          · 「策略选择」为D类特色模块，建议每日必练<br>
          · 主观题练习请在纸上作答后对照参考答案，训练答题框架
        </div>
      `;
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
