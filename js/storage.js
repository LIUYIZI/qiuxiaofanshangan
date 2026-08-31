/* ===== 存储层：作答记录 / 打卡 / 统计 ===== */
(function (global) {
  const KEY_ANSWERS = 'whteacher_answers_v1';   // 每题的作答历史
  const KEY_LOGS    = 'whteacher_quizlogs_v1';  // 每次测验的记录
  const KEY_SEEN    = 'whteacher_seen_v1';      // 题目最近出现日期（去重）
  const KEY_CYCLE   = 'whteacher_cycle_v1';     // 当前周期进度 { id, start, dayDone:{'YYYY-MM-DD':n} }

  const Store = {
    /* 读取/写入每题作答记录 { id: { correct: n, wrong: n, last: 'YYYY-MM-DD', hist: [{d,ok}] } } */
    getAnswers() {
      try { return JSON.parse(localStorage.getItem(KEY_ANSWERS)) || {}; }
      catch (e) { return {}; }
    },
    saveAnswers(answers) {
      try { localStorage.setItem(KEY_ANSWERS, JSON.stringify(answers)); } catch (e) {}
    },

    /* 测验日志 [{ date, mode, total, correct, score }] */
    getLogs() {
      try { return JSON.parse(localStorage.getItem(KEY_LOGS)) || []; }
      catch (e) { return []; }
    },
    saveLogs(logs) {
      try { localStorage.setItem(KEY_LOGS, JSON.stringify(logs.slice(-200))); } catch (e) {}
    },

    /* 题目最近出现日期 { id: 'YYYY-MM-DD' } */
    getSeen() {
      try { return JSON.parse(localStorage.getItem(KEY_SEEN)) || {}; }
      catch (e) { return {}; }
    },
    saveSeen(seen) {
      try { localStorage.setItem(KEY_SEEN, JSON.stringify(seen)); } catch (e) {}
    },

    /* 记录一次作答 */
    recordAnswer(id, isCorrect) {
      const answers = this.getAnswers();
      const rec = answers[id] || { correct: 0, wrong: 0, last: '', hist: [] };
      if (isCorrect) rec.correct += 1; else rec.wrong += 1;
      rec.last = Store.today();
      rec.hist.push({ d: Store.today(), ok: isCorrect });
      if (rec.hist.length > 30) rec.hist = rec.hist.slice(-30);
      answers[id] = rec;
      this.saveAnswers(answers);
    },

    /* 记录一次测验 */
    recordQuiz(log) {
      const logs = this.getLogs();
      logs.push(Object.assign({ date: Store.today(), ts: Date.now() }, log));
      this.saveLogs(logs);
    },

    /* 主观题完成标记 { id: 'YYYY-MM-DD' } */
    getSubDone() {
      try { return JSON.parse(localStorage.getItem('whteacher_subdone_v1')) || {}; }
      catch (e) { return {}; }
    },
    saveSubDone(done) {
      try { localStorage.setItem('whteacher_subdone_v1', JSON.stringify(done)); } catch (e) {}
    },
    recordSubjective(id) {
      const done = this.getSubDone();
      done[id] = Store.today();
      this.saveSubDone(done);
    },

    /* 用户反馈历史 [{ date, type, tag, text }]（保留字段兼容旧数据；新提交 type='' ） */
    getFeedbacks() {
      try { return JSON.parse(localStorage.getItem('whteacher_feedback_v1')) || []; }
      catch (e) { return []; }
    },
    saveFeedback(fb) {
      const list = this.getFeedbacks();
      list.push(Object.assign({ date: Store.today(), ts: Date.now() }, fb));
      try { localStorage.setItem('whteacher_feedback_v1', JSON.stringify(list.slice(-50))); } catch (e) {}
    },

    /* 知识点"记住了"打卡 { 'KP-xx': 'YYYY-MM-DD' } */
    getKpRemembered() {
      try { return JSON.parse(localStorage.getItem('whteacher_kp_v1')) || {}; }
      catch (e) { return {}; }
    },
    saveKpRemembered(map) {
      try { localStorage.setItem('whteacher_kp_v1', JSON.stringify(map)); } catch (e) {}
    },
    recordKpRemembered(id) {
      const map = this.getKpRemembered();
      map[id] = Store.today();
      this.saveKpRemembered(map);
    },
    /* 知识点学习打卡日期集合（学情用）：{ 'YYYY-MM-DD': n } */
    kpStudyDays() {
      const map = this.getKpRemembered();
      const days = {};
      Object.values(map).forEach(d => { days[d] = (days[d] || 0) + 1; });
      return days;
    },

    /* ---------- 火苗（抖音聊天火苗规则） ---------- */
    /* 最近一次刷题日期；无记录返回 '' */
    lastStudyDate() {
      const logs = this.getLogs();
      if (!logs.length) return '';
      const days = [...new Set(logs.map(l => l.date))].sort();
      return days[days.length - 1];
    },
    /* 火苗是否"今天已续上"：今天刷过 → 实心火苗 */
    fireActive() {
      return this.lastStudyDate() === Store.today();
    },
    /* 火苗是否"断1天变灰"：昨天刷过、今天未刷 → 灰色火苗（再刷即恢复） */
    fireDim() {
      return !this.fireActive() && this.lastStudyDate() === Store.dateOffset(-1);
    },

    /* ---------- 错题复习（艾宾浩斯记忆曲线） ---------- */
    REVIEW_NODES: [1, 2, 4, 7, 15],   // 错后第1/2/4/7/15天复习节点
    /* 最后一次答错日期 */
    lastWrongDate(rec) {
      if (!rec) return '';
      if (rec.hist && rec.hist.length) {
        for (let i = rec.hist.length - 1; i >= 0; i--) {
          if (rec.hist[i].ok === false) return rec.hist[i].d;
        }
      }
      return rec.last || '';
    },
    /* 距上次答错的天数（>=0）；从未答错返回 -1 */
    daysSinceLastWrong(rec) {
      const d = this.lastWrongDate(rec);
      if (!d) return -1;
      const a = new Date(d + 'T00:00:00');
      const b = new Date(Store.today() + 'T00:00:00');
      return Math.floor((b - a) / 86400000);
    },
    /* 是否到期复习：距上次答错天数命中艾宾浩斯节点 */
    reviewDue(rec) {
      const days = this.daysSinceLastWrong(rec);
      return days >= 1 && this.REVIEW_NODES.indexOf(days) >= 0;
    },
    /* 复习权重：到期+1000（优先）；错误次数×10；越久未复习越高（时间衰减，上限15） */
    reviewWeight(rec) {
      if (!rec || rec.wrong <= 0) return 0;
      const days = this.daysSinceLastWrong(rec);
      if (days < 0) return 0;
      let w = rec.wrong * 10 + Math.min(Math.max(days, 0), 15);
      if (this.reviewDue(rec)) w += 1000;
      return w;
    },
    /* 全部错题记录（wrong>0），按复习权重降序 */
    wrongRecords() {
      const answers = this.getAnswers();
      return Object.keys(answers)
        .map(id => ({ id, rec: answers[id] }))
        .filter(x => x.rec.wrong > 0)
        .sort((a, b) => this.reviewWeight(b.rec) - this.reviewWeight(a.rec));
    },

    /* ---------- 周期聚合 ---------- */
    /* 已出现过的周期编号列表（按日志顺序，去重，最新在后） */
    cycleIds() {
      const logs = this.getLogs();
      const seen = [];
      logs.forEach(l => {
        if (l.mode && l.mode.indexOf('cycle:') === 0) {
          const id = l.mode.slice(6);
          if (seen.indexOf(id) < 0) seen.push(id);
        }
      });
      return seen;
    },
    /* 某周期的测验日志 */
    cycleLogs(id) {
      return this.getLogs().filter(l => l.mode === 'cycle:' + id);
    },

    /* 连续打卡天数 */
    getStreak() {
      const logs = this.getLogs();
      const days = [...new Set(logs.map(l => l.date))].sort();
      if (!days.length) return 0;
      let streak = 0;
      const cursor = new Date(Store.today());
      // 从今天或昨天开始向前数
      if (days[days.length - 1] === Store.today()) { streak = 1; cursor.setDate(cursor.getDate() - 1); }
      else if (days[days.length - 1] === Store.dateOffset(-1)) { streak = 1; cursor.setDate(cursor.getDate() - 1); }
      else return 0;
      while (true) {
        const target = Store.fmt(cursor);
        if (days.includes(target)) { streak++; cursor.setDate(cursor.getDate() - 1); }
        else break;
      }
      return streak;
    },

    /* ---------- 周期进度 ---------- */
    getCycle() {
      try { return JSON.parse(localStorage.getItem(KEY_CYCLE)) || null; }
      catch (e) { return null; }
    },
    saveCycle(cycle) {
      try { localStorage.setItem(KEY_CYCLE, JSON.stringify(cycle)); } catch (e) {}
    },
    /* 当前周期内第几天（1-based）：以周期开始日为准；超过周期天数返回实际天数（用于周期结束判定） */
    cycleDay(cycle) {
      if (!cycle || !cycle.start) return 1;
      const start = new Date(cycle.start + 'T00:00:00');
      const now = new Date(Store.today() + 'T00:00:00');
      const diff = Math.floor((now - start) / 86400000);
      return Math.max(1, diff + 1);
    },
    /* 周期是否已结束：3天到点（当前天数>周期天数）或累计完成题数达标 */
    /* cfg 可选：传入周期题单配置（Cycle.cfg()），默认 CONFIG.cycle */
    cycleFinished(cycle, cfg) {
      if (!cycle) return false;
      const c = cfg || CONFIG.cycle;
      const day = Store.cycleDay(cycle);
      if (day > c.days) return true;                                  // 3天到点
      const doneTotal = Object.keys(cycle.dayDone || {})
        .reduce((s, d) => s + (cycle.dayDone[d] || 0), 0);
      const perDay = Math.max(1, Math.round(c.total / c.days));
      return doneTotal * perDay >= c.total;                           // 刷完全部题
    },
    /* 当天已刷题数（今日测验记一次） */
    cycleDayDone(cycle) {
      if (!cycle || !cycle.dayDone) return 0;
      return cycle.dayDone[Store.today()] || 0;
    },

    today() { return Store.fmt(new Date()); },
    dateOffset(n) {
      const d = new Date(); d.setDate(d.getDate() + n); return Store.fmt(d);
    },
    fmt(d) {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + dd;
    }
  };

  global.Store = Store;
})(window);
