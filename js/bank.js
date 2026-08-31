/* ===== 题库加载：注册题库 JSON 文件 ===== */
(function (global) {
  /* 题库清单：新题目加入 data/ 后在此注册 */
  const BANK_FILES = [
    'data/bank-职测D-官方示例题.json',
    'data/bank-职测D-策略选择-01.json',
    'data/bank-职测D-策略选择-02.json',
    'data/bank-职测D-判断推理-01.json',
    'data/bank-职测D-言语理解-01.json',
    'data/bank-职测D-常识判断-01.json',
    'data/bank-职测D-数量分析-01.json',
    'data/bank-职测D-常识判断-202603.json',
    'data/bank-职测D-言语理解-202603.json',
    'data/bank-职测D-数量分析-202603.json',
    'data/bank-职测D-判断推理-202603.json',
    'data/bank-职测D-策略选择-202603.json',
    'data/bank-职测D-常识判断-202510.json',
    'data/bank-职测D-言语理解-202510.json',
    'data/bank-职测D-数量分析-202510.json',
    'data/bank-职测D-判断推理-202510.json',
    'data/bank-职测D-策略选择-202510.json',
    'data/bank-职测D-常识判断-202503.json',
    'data/bank-职测D-言语理解-202503.json',
    'data/bank-职测D-数量分析-202503.json',
    'data/bank-职测D-判断推理-202503.json',
    'data/bank-职测D-策略选择-202503.json',
    'data/bank-综应D-主观题-01.json',
    'data/bank-综应D-主观题-02.json',
    'data/bank-综应D-主观题-中学-20181025.json',
    'data/bank-综应D-主观题-中学-20190522.json',
    'data/bank-综应D-主观题-中学-20191025.json',
    'data/bank-综应D-主观题-中学-20200725.json',
    'data/bank-综应D-主观题-中学-20210522.json',
    'data/bank-综应D-主观题-中学-20220522.json',
    'data/bank-综应D-主观题-中学-20220917.json',
    'data/bank-综应D-主观题-中学-20230522.json',
    'data/bank-综应D-主观题-中学-20230826.json',
    'data/bank-综应D-主观题-中学-20240329.json',
    'data/bank-综应D-主观题-中学-20241102.json',
    'data/bank-综应D-主观题-中学-20250329.json',
    'data/bank-综应D-主观题-中学-20251025.json',
    'data/bank-综应D-主观题-小学-20180522.json',
    'data/bank-综应D-主观题-小学-20190522.json',
    'data/bank-综应D-主观题-小学-20191025.json',
    'data/bank-综应D-主观题-小学-20200725.json',
    'data/bank-综应D-主观题-小学-20210522.json',
    'data/bank-综应D-主观题-小学-20220522.json',
    'data/bank-综应D-主观题-小学-20220917.json',
    'data/bank-综应D-主观题-小学-20230522.json',
    'data/bank-综应D-主观题-小学-20230826.json',
    'data/bank-综应D-主观题-小学-20240329.json',
    'data/bank-综应D-主观题-小学-20241102.json',
    'data/bank-综应D-主观题-小学-20250329.json',
    'data/bank-综应D-主观题-小学-20251025.json',
    'data/bank-综应D-主观题-小学-20260329.json'
  ];

  const Bank = {
    questions: [],      // 全部题目
    loaded: false,
    error: false,       // 题库加载失败（常见于 file:// 直接打开）
    loadPromise: null,

    load() {
      if (this.loadPromise) return this.loadPromise;
      this.loadPromise = Promise.all(
        BANK_FILES.map(url => fetch(url).then(r => {
          if (!r.ok) throw new Error('加载题库失败: ' + url);
          return r.json();
        }).catch(err => { console.warn(err); return { questions: [] }; }))
      ).then(banks => {
        this.questions = banks.flatMap(b => (b.questions || []).map(q => Object.assign({}, q)));
        // 客观题统一归一化
        this.questions.forEach(q => {
          q.isSubjective = (q.type === 'subjective');
          q.answerKey = q.answer ? String(q.answer).trim().toUpperCase() : '';
        });
        if (!this.questions.length) this.error = true;
        this.loaded = true;
        return this.questions;
      }).catch(err => {
        console.error('题库加载异常:', err);
        this.error = true;
        this.loaded = true;
        return [];
      });
      return this.loadPromise;
    },

    /* 按模块取题（内部使用） */
    byModule(moduleName) {
      return this.questions.filter(q => q.module === moduleName && !q.isSubjective);
    },

    modules() {
      const m = {};
      this.questions.forEach(q => { m[q.module] = (m[q.module] || 0) + 1; });
      return m;
    },

    subjective() {
      return this.questions.filter(q => q.isSubjective);
    }
  };

  global.Bank = Bank;
})(window);
