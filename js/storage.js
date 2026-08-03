/* ===== 存储层：作答记录 / 打卡 / 统计 ===== */
(function (global) {
  const KEY_ANSWERS = 'whteacher_answers_v1';   // 每题的作答历史
  const KEY_LOGS    = 'whteacher_quizlogs_v1';  // 每次测验的记录
  const KEY_SEEN    = 'whteacher_seen_v1';      // 题目最近出现日期（去重）

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
