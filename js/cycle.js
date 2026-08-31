/* ===== 周期题单：加载周期JSON（如 cycle-C1.json），按天取题 =====
 * 优先使用培训师生成好的固定题单（一个周期一个JSON）；
 * 若题单缺失/加载失败，前端回退到动态抽题（quiz.drawCycle 的池子）。
 */
(function (global) {
  const CYCLE_FILE = 'data/cycle-' + (global.CONFIG ? CONFIG.cycle.id : 'C1') + '.json';

  const Cycle = {
    plan: null,        // { meta:{id,days,perDay,total}, days:[{day,questionIds}] }
    loaded: false,

    async load() {
      if (this.loaded) return this.plan;
      try {
        const r = await fetch(CYCLE_FILE);
        if (!r.ok) throw new Error('cycle file not found');
        this.plan = await r.json();
      } catch (e) {
        this.plan = null;   // 无题单 → 回退动态抽题
      }
      this.loaded = true;
      return this.plan;
    },

    hasPlan() { return !!(this.plan && this.plan.meta && this.plan.days && this.plan.days.length); },

    /* 题单配置（覆盖 CONFIG.cycle 的显示值）；无题单时返回 CONFIG.cycle */
    cfg() {
      if (this.hasPlan()) {
        const m = this.plan.meta;
        return {
          id: m.id || CONFIG.cycle.id,
          days: m.days || CONFIG.cycle.days,
          perDay: m.perDay || CONFIG.cycle.perDay,
          total: m.total || CONFIG.cycle.total,
        };
      }
      return CONFIG.cycle;
    },

    /* 当天题单的题目ID列表；超出计划天数或无题单 → [] */
    idsForDay(day) {
      if (!this.hasPlan()) return [];
      const d = this.plan.days.find(x => x.day === day);
      return (d && d.questionIds) ? d.questionIds : [];
    },

    /* 当天题目（从题库按ID解析）；无题单/ID缺失 → 由调用方回退动态抽题 */
    questionsForDay(day) {
      if (!Bank.loaded) return [];
      const ids = this.idsForDay(day);
      if (!ids.length) return [];
      const byId = {};
      Bank.questions.forEach(q => { byId[q.id] = q; });
      return ids.map(id => byId[id]).filter(Boolean);
    }
  };

  global.Cycle = Cycle;
})(window);
