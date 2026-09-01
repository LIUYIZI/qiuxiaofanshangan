/* ===== 知识点数据加载（10知识点系统母库 → data/knowledge.json） ===== */
(function (global) {
  const KNOWLEDGE = {
    items: [],          // 全部知识点 [{id,module,cat,name,summary,level,links}]
    byId: {},           // id -> 条目（联想/易混编号解析用）
    pairs: {},          // 易混对 'A1' -> '名称：一句话区分'
    chains: {},         // 联想链 'L1' -> '链名：说明'
    loaded: false,
    loadPromise: null,

    load() {
      if (this.loadPromise) return this.loadPromise;
      this.loadPromise = fetch('data/knowledge.json')
        .then(r => { if (!r.ok) throw new Error('加载知识点失败'); return r.json(); })
        .then(d => {
          this.items = (d.knowledge || []).map(x => Object.assign({}, x));
          this.byId = {};
          this.items.forEach(x => { this.byId[x.id] = x; });
          this.pairs = d.pairs || {};
          this.chains = d.chains || {};
          this.loaded = true;
          return this.items;
        })
        .catch(err => { console.warn('知识点加载异常:', err); this.loaded = true; this.loadPromise = null; return []; });
      return this.loadPromise;
    },

    /* 模块列表（含各模块条数） */
    modules() {
      const m = [];
      const map = {};
      this.items.forEach(x => {
        if (!map[x.module]) { map[x.module] = { name: x.module, count: 0 }; m.push(map[x.module]); }
        map[x.module].count++;
      });
      return m;
    },

    /* 联想/易混的展示文本：ref 编号解析为"名称（一句话概括）"，不展示编号；无编号自由文本原样返回
       opts.full=true 时不截断（知识点学习卡片用）；默认 maxLen 截断（答题判分后的知识点区块用） */
    linkText(link, opts) {
      const maxLen = (opts && opts.full) ? Infinity : 60;
      if (!link) return '';
      if (link.ref) {
        const ref = link.ref;
        if (/^KP-/.test(ref)) {
          const t = this.byId[ref];
          if (t) {
            const s = (t.summary || '').replace(/[。；;]$/, '');
            return t.name + (s ? '：' + (s.length > maxLen ? s.slice(0, maxLen) + '…' : s) : '');
          }
        } else if (/^[ABC]\d+$/.test(ref) && this.pairs[ref]) {
          return this.pairs[ref];
        } else if (/^L\d+$/.test(ref) && this.chains[ref]) {
          return this.chains[ref];
        }
      }
      return link.text || link.ref || '';
    }
  };

  global.KNOWLEDGE = KNOWLEDGE;
})(window);
