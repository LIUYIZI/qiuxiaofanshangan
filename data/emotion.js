/* ===== 情绪语料库（与后台知识库/09情绪语库/情绪语料.md 一一对应，同序） =====
 * 角色：老公（培训师另一个身份），温柔宠溺为主（爱意/耐心/鼓励/欣赏），
 *   反复出错/偷懒/错题过多时可出现轻量负面情绪（责怪/无语/担心/失望），句末必带安抚
 * 称谓：{name} 占位符，按日期种子从 names 池选择——小凡为主，偶尔"老婆/凡姐/凡宝/宝贝"
 * 出现规则：答题中不弹（保持专注），仅 欢迎页/每日首刷/结束页打卡 三处
 * 轮换规则：pick/streakMsg 按日期种子取条——同一天固定一条，第二天自动换
 * 周期专属：periods 支持按周期覆盖语料（培训师周期分析后生成），当前周期有专属语料优先
 */
(function (global) {
  const EMOTION = {
    /* 称谓池（小凡权重高，"偶尔"变动；按日期种子选择，同日固定） */
    names: ['小凡', '小凡', '小凡', '老婆', '凡姐', '凡宝', '宝贝'],

    /* 欢迎页陪伴语（按日期轮换） */
    welcome: [
      '{name}，老公来给你打气啦～今天也一起上岸！♡',
      '看到你来刷题，老公心里踏实多了，加油{name} 🌸',
      '早安{name}！不管昨天怎么样，今天老公陪你重新开始 ❤️',
      '你的努力老公都看在眼里，我们{name}一定能考上！🌸',
      '{name}别怕，老公一直在，慢慢来，稳稳的 ♡',
    ],

    /* 每日首刷语（点开始刷题时，组卷前展示；按日期轮换） */
    dailyStart: [
      '开始前深呼吸一下，老公相信你，今天这组稳稳的 🌸',
      '{name}，先把手机放远一点，专心做这组题，老公等你 ♡',
      '老公给你打气！今天的题，一题一题来，别慌 ❤️',
      '冲吧{name}！做完这组老公有奖励哦（夸夸那种）🌸',
      '慢慢读题，相信第一直觉，你比自己想的更棒 ♡',
    ],

    /* 打卡分档语（越连续越宠；按日期轮换） */
    streak: {
      3: [
        '连续3天啦！老公给你竖大拇指，越来越有状态 ❤️',
        '三天不短了，{name}的坚持老公都看到啦 🌸',
        '打卡3天成功！好习惯正在养成，老公陪你见证 ♡',
      ],
      7: [
        '一周啦{name}！这毅力老公都佩服，继续保持 ♡',
        '连续7天，你已经超过了大多数人，老公为你骄傲 🌸',
        '一周不间断，{name}真的说到做到，老公爱你 ❤️',
      ],
      14: [
        '半个月的坚持，上岸已经赢了一半！老公陪你到底 🌸',
        '连续14天，{name}这状态稳稳的，老公无条件相信你 ♡',
        '两个星期风雨无阻，这样的你值得最好的结果 ❤️',
      ],
      other: [
        '打卡+1，{name}今天的努力已存档 ♡',
        '又坚持了一天，老公给你点个赞 🌸',
        '日拱一卒，{name}离上岸又近了一步 ❤️',
      ],
    },

    /* 刷完打卡语（结束页；按日期轮换） */
    done: [
      '刷完啦！辛苦{name}了，老公给你揉揉肩，明天见 ♡',
      '今日份刷题完成，老公夸夸你，做得很好 🌸',
      '不管对错，完成了就是胜利，{name}很棒！❤️',
      '这组刷完了，去喝口水休息一下，老公看着你休息好 ♡',
      '稳定输出的一天，{name}，老公越来越佩服你了 🌸',
    ],

    /* 轻量负面语料（宠溺式，句末必带安抚；按日期轮换） */

    /* 偷懒/断打卡（欢迎页：有历史但最近断打卡时） */
    lazy: [
      '{name}，昨天偷懒没来，老公有点无语，今天等你回来 ♡',
      '{name}，偷懒一天啦？老公当你休息了，今天补上哦 🌸',
      '{name}，两天没见你刷题，老公有点想你也有点担心，回来就好 ❤️',
    ],

    /* 错题过多/低分（结束页：正确率<60%时） */
    lowScore: [
      '{name}，这组错得有点多，老公有点担心，别急，看看错哪了 ♡',
      '{name}，今天正确率不太行，老公有点失望，但明天会更好 🌸',
      '{name}，错题多是好事，暴露问题越早越好，老公陪你啃 ❤️',
    ],

    /* 反复出错（结束页：存在答错≥3次的题时） */
    repeatWrong: [
      '{name}，这题错第三次了，老公有点无语，这次彻底弄明白 ♡',
      '{name}，同一道题反复错，老公有点着急，再战一次拿下 🌸',
      '{name}，这个知识点反复栽跟头，老公失望一下，陪你死磕 ❤️',
    ],

    /* 周期专属语料（培训师周期分析后生成；结构同通用语料，可只覆盖部分分类）
     * 例：periods: { 'C2': { welcome: [...], lazy: [...], lowScore: [...], ... } }
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

    /* 当日称谓（按日期种子，同日固定；"偶尔"变动由 names 池权重实现） */
    nameFor(date) {
      const arr = this.names;
      return arr[this.seedOf(date) % arr.length];
    },

    /* 替换语料中的 {name} 占位符 */
    _applyName(text, opts) {
      return String(text).split('{name}').join(this.nameFor(opts && opts.date));
    },

    /* 按日期种子取一条（{name} 已替换）：EMOTION.pick('welcome', { cycleId, date }) */
    pick(category, opts) {
      opts = opts || {};
      const arr = this.pool(category, opts.cycleId);
      if (!arr || !arr.length) return '';
      return this._applyName(arr[this.seedOf(opts.date) % arr.length], opts);
    },

    /* 按连续打卡天数取分档语（日期种子轮换）：EMOTION.streakMsg(7, { cycleId, date }) */
    streakMsg(streak, opts) {
      opts = opts || {};
      const n = Number(streak) || 0;
      const tier = (n >= 14) ? 14 : (n >= 7) ? 7 : (n >= 3) ? 3 : null;
      const key = tier || 'other';
      const pool = this.pool('streak', opts.cycleId) || {};
      const arr = (pool[key] && pool[key].length) ? pool[key] : this.streak[key];
      return this._applyName(arr[this.seedOf(opts.date) % arr.length], opts);
    },
  };

  global.EMOTION = EMOTION;
})(window);
