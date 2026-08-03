/* ===== 配置：每日测验题量、模块权重、练习模式 ===== */
(function (global) {
  const CONFIG = {
    /* 每日测验题量 */
    daily: {
      objective: 10,   // 职测客观题数量
      subjective: 1,   // 综应主观题数量
    },

    /* 客观题模块权重（决定每日抽题分布；数值越大占比越高） */
    moduleWeight: {
      '策略选择': 30,
      '判断推理': 20,
      '言语理解与表达': 18,
      '常识判断': 17,
      '数量分析': 15,
    },

    /* 抽题策略 */
    draw: {
      recentRepeatDays: 3,   // 同一题 N 天内不重复（今日测验）
      weakBonus: 3,          // 薄弱知识点抽题加权倍数
      masteredThreshold: 2,  // 连续答对 N 次视为掌握（降权）
    },

    /* 站点信息 */
    site: {
      title: '武汉教师D类 · 每日刷题',
      target: '2026年12月 武汉市事业单位招聘（教育系统·D类）',
    }
  };

  global.CONFIG = CONFIG;
})(window);
