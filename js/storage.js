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

    /* 用户反馈历史 [{ date, type, tag, text }] */
    getFeedbacks() {
      try { return JSON.parse(localStorage.getItem('whteacher_feedback_v1')) || []; }
      catch (e) { return []; }
    },
    saveFeedback(fb) {
      const list = this.getFeedbacks();
      list.push(Object.assign({ date: Store.today(), ts: Date.now() }, fb));
      try { localStorage.setItem('whteacher_feedback_v1', JSON.stringify(list.slice(-50))); } catch (e) {}
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
