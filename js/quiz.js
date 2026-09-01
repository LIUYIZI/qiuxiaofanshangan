/* ===== 测验引擎：抽题算法 + 卡片渲染 + 交互 ===== */
(function (global) {
  const Quiz = {
    current: null,       // { questions, mode, title, idx, answers:[] }

    /* ---------- 抽题 ---------- */

    /* 周期当日测验：优先使用培训师题单（cycle-C1.json 按天取题），无题单则按模块权重动态抽题
       dayOverride：指定刷第几天（首页前后天卡片手动进入练习）；缺省=当前周期进度天 */
    async drawCycle(dayOverride) {
      await Bank.load();
      await Cycle.load();
      const cycle = Store.getCycle() || { id: CONFIG.cycle.id, start: Store.today(), dayDone: {} };
      const day = (dayOverride && dayOverride >= 1) ? dayOverride : Store.cycleDay(cycle);
      const cfg = Cycle.cfg();
      const perDay = Math.max(1, Math.round(cfg.total / cfg.days));

      /* 题单优先：该天有固定题 → 直接返回 */
      const planned = Cycle.questionsForDay(day);
      if (planned.length) {
        return { questions: planned, mode: 'cycle:' + cycle.id, title: cycle.id + '周期 · 第' + Math.min(day, cfg.days) + '天', fromPlan: true, day: day };
      }

      /* 回退：动态抽题（无题单或当天题单缺失） */
      const all = Bank.questions;
      const answers = Store.getAnswers();
      const seen = Store.getSeen();
      const recent = Store.dateOffset(-CONFIG.draw.recentRepeatDays);

      const pool = all.filter(q => !q.isSubjective && !(seen[q.id] && seen[q.id] >= recent));
      const byModule = {};
      pool.forEach(q => { (byModule[q.module] = byModule[q.module] || []).push(q); });

      /* 按权重分配当日题量（最大余数法，保证总数 = 每日目标题量） */
      const total = perDay;
      const weightSum = Object.keys(CONFIG.moduleWeight).reduce((s, m) => s + CONFIG.moduleWeight[m], 0);
      const counts = {};
      const fracs = [];
      Object.keys(CONFIG.moduleWeight).forEach(m => {
        const exact = total * CONFIG.moduleWeight[m] / weightSum;
        counts[m] = Math.floor(exact);
        fracs.push({ m, frac: exact - counts[m] });
      });
      let allocated = Object.values(counts).reduce((a, b) => a + b, 0);
      let remain = total - allocated;
      fracs.sort((a, b) => b.frac - a.frac);
      let fi = 0;
      while (remain > 0 && fracs.length) {
        counts[fracs[fi % fracs.length].m]++;
        remain--;
        fi++;
      }

      /* 每模块按薄弱优先抽题；题目不足则记为缺口，稍后统一补足 */
      const picked = [];
      Object.keys(counts).forEach(m => {
        const mods = (byModule[m] || [])
          .slice()
          .sort((a, b) => this._score(a, answers, seen) - this._score(b, answers, seen));
        let want = counts[m];
        while (want > 0 && mods.length) {
          picked.push(mods.shift());
          want--;
        }
      });

      /* 从剩余题库补足数量（薄弱优先） */
      const rest = pool
        .filter(q => !picked.includes(q))
        .sort((a, b) => this._score(a, answers, seen) - this._score(b, answers, seen));
      let deficit = total - picked.length;
      while (deficit > 0 && rest.length) {
        picked.push(rest.shift());
        deficit--;
      }

      /* 周期内主观题：按配置取作答次数最少的（开始阶段为0） */
      const subN = cfg.subjective || 0;
      const subs = Bank.subjective()
        .slice()
        .sort((a, b) => {
          const ar = answers[a.id], br = answers[b.id];
          return (ar ? ar.correct + ar.wrong : 0) - (br ? br.correct + br.wrong : 0);
        });
      const questions = [...picked];
      for (let i = 0; i < subN && i < subs.length; i++) questions.push(subs[i]);

      return { questions, mode: 'cycle:' + cycle.id, title: cycle.id + '周期 · 第' + Math.min(day, cfg.days) + '天', day: day };
    },

    /* 今日错题复习：按复习权重（艾宾浩斯节点优先 + 错误次数 + 时间衰减）排序全部错题 */
    async drawTodayReview() {
      await Bank.load();
      const recs = Store.wrongRecords();
      const pool = recs
        .map(x => Bank.questions.find(q => q.id === x.id && !q.isSubjective))
        .filter(Boolean);
      const dueN = pool.filter(q => Store.reviewDue(Store.getAnswers()[q.id])).length;
      return {
        questions: pool,
        mode: 'review',
        title: '今日错题复习 · ' + pool.length + '题' + (dueN ? '（' + dueN + '题到期）' : ''),
      };
    },

    /* 题目得分：越小越优先（未做过0 < 全错1 < 半对<2 < 全对≈2 < 已掌握10） */
    _score(q, answers, seen) {
      const rec = answers[q.id];
      if (!rec || rec.correct + rec.wrong === 0) return 0;   // 未做过：最优先
      const total = rec.correct + rec.wrong;
      const rate = rec.correct / total;
      // 连续答对>=2次且正确率>=0.7 → 已掌握，最低优先级
      if (rec.correct >= CONFIG.draw.masteredThreshold && rate >= 0.7) return 10;
      // 答对率越低得分越小 → 越优先（薄弱在前）
      return 1 + rate * (CONFIG.draw.weakBonus / 3);
    },

    /* ---------- 测验流程 ---------- */

    start(cfg) {
      this.current = {
        questions: cfg.questions,
        mode: cfg.mode,
        title: cfg.title,
        idx: 0,
        results: [],          // [{q, ok, picked}]
        done: false,
      };
      App.renderQuiz();
    },

    currentQuestion() {
      return this.current.questions[this.current.idx];
    },

    next() {
      const c = this.current;
      if (c.idx < c.questions.length - 1) { c.idx++; App.renderQuiz('slide-left'); }
      else if (!c.done) this.finish();
    },
    prev() {
      const c = this.current;
      if (c.idx > 0) { c.idx--; App.renderQuiz('slide-right'); }
    },
    goto(i) {
      if (i >= 0 && i < this.current.questions.length) { this.current.idx = i; App.renderQuiz(); }
    },

    finish() {
      const c = this.current;
      c.done = true;
      // 与结果页同口径：只统计客观题（主观题 ok===null 不计分）
      const results = c.results.filter(r => r && r.ok !== null);
      const total = c.questions.filter(q => !q.isSubjective).length;
      const answered = results.length;
      const correct = results.filter(r => r.ok).length;
      const rate = answered ? Math.round(correct / answered * 100) : 0;
      const log = {
        mode: c.mode,
        title: c.title,
        total: total,
        answered: answered,
        correct: correct,
        rate: rate,
        subjective: c.questions.filter(q => q.isSubjective).length,
      };
      Store.recordQuiz(log);
      /* 周期进度：记录当天已完成刷题（仅周期测验且有实际作答时） */
      if (c.mode && c.mode.indexOf('cycle:') === 0 && results.length > 0) {
        const cycle = Store.getCycle() || { id: CONFIG.cycle.id, start: Store.today(), dayDone: {} };
        cycle.dayDone = cycle.dayDone || {};
        cycle.dayDone[Store.today()] = (cycle.dayDone[Store.today()] || 0) + 1;
        Store.saveCycle(cycle);
      }
      this.markSeen(c.questions);
      App.renderResult(log);
    },

    markSeen(questions) {
      const seen = Store.getSeen();
      const today = Store.today();
      questions.forEach(q => { seen[q.id] = today; });
      Store.saveSeen(seen);
    },

    /* 记录一次作答（客观题判分；主观题标记完成不计分） */
    submitAnswer(q, ok, picked) {
      if (q.isSubjective) {
        // 主观题不计入正确率，仅标记完成
        Store.recordSubjective(q.id);
        this.current.results[this.current.idx] = { q, ok: null, picked: '' };
      } else {
        Store.recordAnswer(q.id, ok);
        this.current.results[this.current.idx] = { q, ok, picked };
      }
    }
  };

  global.Quiz = Quiz;
})(window);
