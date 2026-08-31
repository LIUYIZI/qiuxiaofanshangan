/* ===== 情绪语料库（与后台知识库/09情绪语库/情绪语料.md 一一对应，同序） =====
 * 角色：老公（自称"老公"，直呼"小凡"），温柔宠溺口吻，🌸/❤️/♡ 点缀
 * 出现规则：答题中不弹（保持专注），仅 欢迎页/每日首刷/结束页打卡 三处
 * 轮换规则（第8.5轮）：pick/streakMsg 按日期种子取条——同一天固定一条，第二天自动换
 * 周期专属（第8.5轮）：periods 支持按周期覆盖语料（培训师周期分析后生成），
 *   当前周期有专属语料优先，未覆盖分类回退通用语料
 */
(function (global) {
  const EMOTION = {
    /* 欢迎页陪伴语（按日期轮换） */
    welcome: [
      '小凡，老公来给你打气啦～今天也一起上岸！♡',
      '看到你来刷题，老公心里踏实多了，加油小凡 🌸',
      '早安小凡！不管昨天怎么样，今天老公陪你重新开始 ❤️',
      '你的努力老公都看在眼里，我们小凡一定能考上！🌸',
      '小凡别怕，老公一直在，慢慢来，稳稳的 ♡',
    ],

    /* 每日首刷语（点开始刷题时，组卷前展示；按日期轮换） */
    dailyStart: [
      '开始前深呼吸一下，老公相信你，今天这组稳稳的 🌸',
      '小凡，先把手机放远一点，专心做这组题，老公等你 ♡',
      '老公给你打气！今天的题，一题一题来，别慌 ❤️',
      '冲吧小凡！做完这组老公有奖励哦（夸夸那种）🌸',
      '慢慢读题，相信第一直觉，你比自己想的更棒 ♡',
    ],

    /* 打卡分档语（越连续越宠；按日期轮换） */
    streak: {
      3: [
        '连续3天啦！老公给你竖大拇指，越来越有状态 ❤️',
        '三天不短了，小凡的坚持老公都看到啦 🌸',
        '打卡3天成功！好习惯正在养成，老公陪你见证 ♡',
      ],
      7: [
        '一周啦小凡！这毅力老公都佩服，继续保持 ♡',
        '连续7天，你已经超过了大多数人，老公为你骄傲 🌸',
        '一周不间断，小凡真的说到做到，老公爱你 ❤️',
      ],
      14: [
        '半个月的坚持，上岸已经赢了一半！老公陪你到底 🌸',
        '连续14天，小凡这状态稳稳的，老公无条件相信你 ♡',
        '两个星期风雨无阻，这样的你值得最好的结果 ❤️',
      ],
      other: [
        '打卡+1，小凡今天的努力已存档 ♡',
        '又坚持了一天，老公给你点个赞 🌸',
        '日拱一卒，小凡离上岸又近了一步 ❤️',
      ],
    },

    /* 刷完打卡语（结束页；按日期轮换） */
    done: [
      '刷完啦！辛苦小凡了，老公给你揉揉肩，明天见 ♡',
      '今日份刷题完成，老公夸夸你，做得很好 🌸',
      '不管对错，完成了就是胜利，小凡很棒！❤️',
      '这组刷完了，去喝口水休息一下，老公看着你休息好 ♡',
      '稳定输出的一天，小凡，老公越来越佩服你了 🌸',
    ],

    /* 周期专属语料（培训师周期分析后生成；结构同通用语料，可只覆盖部分分类）
     * 例：periods: { 'C2': { welcome: [...], dailyStart: [...], streak: {3:[],7:[],14:[],other:[]}, done: [...] } }
     * 母本说明见 后台知识库/09情绪语库/情绪语料.md「周期专属语料」章节
     */
    periods: {},

    /* 取当前周期覆盖语料池：周期专属优先，回退通用。
     * 注意 streak 是分档对象 {3:[],7:[],14:[],other:[]} 而非数组——对象用"任一档非空"判定覆盖 */
    pool(category, cycleId) {
      const p = cycleId && this.periods[cycleId];
      const cand = p && p[category];
      if (cand == null) return this[category];
      if (Array.isArray(cand)) return cand.length ? cand : this[category];
      if (typeof cand === 'object') {
        const hasAny = Object.keys(cand).some(k => cand[k] && cand[k].length);
        return hasAny ? cand : this[category];
      }
      return this[category];
    },

    /* 日期种子：自1970-01-01的天数（每天+1 → 取模数组长度必然每天+1，跨月进位也正确） */
    seedOf(dateStr) {
      const s = dateStr || this.today();
      const parts = s.split('-');
      const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
      return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
    },

    today() {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    },

    /* 按日期种子取一条：EMOTION.pick('welcome', { cycleId, date }) */
    pick(category, opts) {
      opts = opts || {};
      const arr = this.pool(category, opts.cycleId);
      if (!arr || !arr.length) return '';
      return arr[this.seedOf(opts.date) % arr.length];
    },

    /* 按连续打卡天数取分档语（日期种子轮换）：EMOTION.streakMsg(7, { cycleId, date }) */
    streakMsg(streak, opts) {
      opts = opts || {};
      const n = Number(streak) || 0;
      const tier = (n >= 14) ? 14 : (n >= 7) ? 7 : (n >= 3) ? 3 : null;
      const key = tier || 'other';
      const pool = this.pool('streak', opts.cycleId) || {};
      const arr = (pool[key] && pool[key].length) ? pool[key] : this.streak[key];
      return arr[this.seedOf(opts.date) % arr.length];
    },
  };

  global.EMOTION = EMOTION;
})(window);
