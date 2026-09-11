const store = require('../../utils/store');
const util = require('../../utils/util');
const presets = require('../../data/presets');

Page({
  data: {
    theme: '',
    // 标签（快捷语）筛选：已选集合 + “详细筛选”浮层（多选）
    tagList: [],            // [{ text, emoji, n }]
    tagSel: [],             // 已选择的标签文本（多选，OR 过滤）
    showTagOpen: false,     // 详细筛选浮层
    tagOpenList: [],        // 详细筛选浮层里的选项（含 sel 标记）
    tagHStyle: 'height:300rpx', // 浮层滚动区内联高度样式
    // 时间筛选：用户自定义起止
    dateFrom: '',           // '' = 不限
    dateTo: '',
    timeTitle: '全部时间',
    // 地点筛选：与标签一致的多选详细筛选
    locList: [],            // [{ text, n }]
    locSel: [],             // 已选地点（多选，OR）
    showLocOpen: false,
    locOpenList: [],        // 地点浮层选项（含 sel 标记）
    locHStyle: 'height:300rpx',
    groups: [],             // 按“日”分组
    total: 0,
    hasCards: false,
    swap: false
  },

  onShow() {
    this._cards = store.getCards();
    this._favs = new Set(store.getFavIds(store.getUser().uid));
    this._applyTheme();
    this._buildOptions();
    this.applyFilter(true);
    this._syncTab(0);
    this._navShow();
  },

  _applyTheme() {
    const theme = store.getTheme();
    store.applyThemeUI(theme);
    this.setData({ theme });
  },

  _syncTab(selected) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected, dark: store.getTheme() === 'dark' });
    }
  },

  _navHide() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ hidden: true });
    }
  },

  _navShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ hidden: false });
    }
  },

  /* ---------- 选项：按使用频率排序的标签 / 已保存地点 ---------- */
  _buildOptions() {
    const all = this._cards || [];
    const cnt = {};
    all.forEach(c => {
      (c.phrases || []).forEach(p => {
        if (!p || !p.text) return;
        cnt[p.text] = cnt[p.text] || { text: p.text, emoji: p.emoji || '', n: 0 };
        cnt[p.text].n += 1;
      });
    });
    const tagList = Object.keys(cnt)
      .map(k => cnt[k])
      .sort((a, b) => b.n - a.n || (a.text < b.text ? -1 : 1));

    const locCnt = {};
    all.forEach(c => {
      const t = (c.locText || '').trim();
      if (!t) return;
      locCnt[t] = locCnt[t] || 0;
      locCnt[t] += 1;
    });
    const locList = Object.keys(locCnt)
      .sort((a, b) => locCnt[b] - locCnt[a])
      .map(k => ({ text: k, n: locCnt[k] }));

    this._allPhrases = tagList.slice();
    this.setData({ tagList, locList });
  },

  /* ---------- 标签筛选（详细浮层 / 已选胶囊） ---------- */
  _syncTagOpen() {
    const sel = this.data.tagSel || [];
    this.setData({
      tagOpenList: (this.data.tagList || []).map(t => Object.assign({}, t, { sel: sel.indexOf(t.text) >= 0 }))
    });
  },

  toggleTagOpen() {
    const open = !this.data.showTagOpen;
    if (open) this._syncTagOpen();
    this.setData({ showTagOpen: open, showLocOpen: false }, () => {
      if (open) {
        this._navHide();
        this._fitSheet('.tf-sheet', 'tagHStyle', '.tf-sheet .tf-scroll-body');
      } else {
        this._navShow();
      }
    });
  },

  /* 给浮层滚动区一个精确 px 高度（随屏幕与内容自适应） */
  _fitSheet(sel, key, contentSel, headCls, scrollCls) {
    const that = this;
    wx.nextTick(() => {
      const win = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
      const H = win.windowHeight || win.screenHeight || 700;
      const q = wx.createSelectorQuery();
      q.select(sel).boundingClientRect();
      q.select(sel + ' ' + (headCls || '.tf-head')).boundingClientRect();
      q.select(sel + ' ' + (scrollCls || '.tf-scroll')).boundingClientRect();
      q.select(contentSel).boundingClientRect();
      q.exec((r) => {
        const sheet = r[0]; const head = r[1]; const list = r[2]; const content = r[3];
        if (!sheet || !list) return;
        const headH = head ? head.height : 0;
        const client = list.height || 0;
        const foot = sheet.height - headH - client;
        const allowed = H - 24 - headH - Math.max(0, foot);
        const natural = content ? content.height : 0;
        const want = natural > 0 ? natural : 180;
        const target = Math.max(0, Math.min(want, allowed));
        that.setData({ [key]: 'height:' + Math.round(target) + 'px' });
      });
    });
  },

  stopTagBubble() { /* 阻止冒泡到遮罩 */ },

  noop() { /* 拦截 touchmove，避免底层页面跟随滚动 */ },

  toggleTagInList(e) {
    const text = e.currentTarget.dataset.text;
    const sel = this.data.tagSel.slice();
    const i = sel.indexOf(text);
    if (i >= 0) sel.splice(i, 1); else sel.push(text);
    this.setData({ tagSel: sel }, () => {
      this._syncTagOpen();
      this.applyFilter();
    });
  },

  removeTagSel(e) {
    const text = e.currentTarget.dataset.text;
    const sel = this.data.tagSel.filter(t => t !== text);
    this.setData({ tagSel: sel }, () => {
      this._syncTagOpen();
      this.applyFilter();
    });
  },

  tagClearAll() {
    this.setData({ tagSel: [] }, () => {
      this._syncTagOpen();
      this.applyFilter();
    });
  },

  /* ---------- 地点筛选（详细浮层 / 已选胶囊，与标签一致） ---------- */
  _syncLocOpen() {
    const sel = this.data.locSel || [];
    this.setData({
      locOpenList: (this.data.locList || []).map(t => Object.assign({}, t, { sel: sel.indexOf(t.text) >= 0 }))
    });
  },

  toggleLocOpen() {
    const open = !this.data.showLocOpen;
    if (open) this._syncLocOpen();
    this.setData({ showLocOpen: open, showTagOpen: false }, () => {
      if (open) {
        this._navHide();
        this._fitSheet('.loc-sheet', 'locHStyle', '.loc-sheet .loc-scroll-body', '.loc-head', '.loc-scroll');
      } else {
        this._navShow();
      }
    });
  },

  toggleLocInList(e) {
    const text = e.currentTarget.dataset.text;
    const sel = this.data.locSel.slice();
    const i = sel.indexOf(text);
    if (i >= 0) sel.splice(i, 1); else sel.push(text);
    this.setData({ locSel: sel }, () => {
      this._syncLocOpen();
      this.applyFilter();
    });
  },

  removeLocSel(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ locSel: this.data.locSel.filter(t => t !== text) }, () => {
      this._syncLocOpen();
      this.applyFilter();
    });
  },

  locClearAll() {
    this.setData({ locSel: [] }, () => {
      this._syncLocOpen();
      this.applyFilter();
    });
  },

  onDateFrom(e) {
    const v = e.detail.value;
    if (this.data.dateTo && v > this.data.dateTo) {
      wx.showToast({ title: '开始时间不能晚于结束时间', icon: 'none' });
      return;
    }
    this.setData({ dateFrom: v }, () => this.applyFilter());
  },

  onDateTo(e) {
    const v = e.detail.value;
    if (this.data.dateFrom && v < this.data.dateFrom) {
      wx.showToast({ title: '结束时间不能早于开始时间', icon: 'none' });
      return;
    }
    this.setData({ dateTo: v }, () => this.applyFilter());
  },

  clearTime() {
    this.setData({ dateFrom: '', dateTo: '' }, () => this.applyFilter());
  },

  clearAllFilter() {
    this.setData({
      tagSel: [],
      locSel: [],
      dateFrom: '',
      dateTo: ''
    }, () => {
      this._syncTagOpen();
      this._syncLocOpen();
      this.applyFilter();
    });
  },

  /* ---------- 组合过滤 + 按“日”分组 ---------- */
  applyFilter() {
    const tags = this.data.tagSel || [];
    const locs = this.data.locSel || [];
    const from = this.data.dateFrom;
    const to = this.data.dateTo;
    const fromDay = from ? new Date(from.replace(/-/g, '/')).getTime() : 0;
    const toDay = to ? new Date(to.replace(/-/g, '/')).getTime() + 86400000 : Infinity;

    let list = (this._cards || []).filter(c => {
      const phrases = (c.phrases || []).map(p => p.text);
      if (tags.length && !tags.some(t => phrases.indexOf(t) >= 0)) return false;
      if (locs.length && locs.indexOf((c.locText || '').trim()) < 0) return false;
      const t = c.createdAt || 0;
      if (t < fromDay || t >= toDay) return false;
      return true;
    }).slice().sort((a, b) => b.createdAt - a.createdAt);

    list = list.map(c => {
      c.faved = this._favs.has(c.id);
      return c;
    });

    // 按日历日分组
    const map = {};
    const order = [];
    list.forEach(c => {
      const d = new Date(c.createdAt);
      const key = d.getFullYear() + '-' + util.pad(d.getMonth() + 1) + '-' + util.pad(d.getDate());
      if (!map[key]) {
        map[key] = { key, label: this._dayLabel(c.createdAt), items: [] };
        order.push(key);
      }
      map[key].items.push(c);
    });
    // 每组按“预计高度”贪心放入左右两列，形成瀑布流（列内自适应、整体更紧凑）
    const groups = order.map(k => {
      const g = map[k];
      const left = [];
      const right = [];
      let lh = 0;
      let rh = 0;
      (g.items || []).forEach(c => {
        const h = this._estCard(c);
        if (lh <= rh) { left.push(c); lh += h; } else { right.push(c); rh += h; }
      });
      return { key: g.key, label: g.label, count: g.items.length, left, right };
    });

    this.setData({
      groups,
      total: list.length,
      hasCards: !!(this._cards && this._cards.length),
      timeTitle: this._timeTitle(from, to),
      swap: !this.data.swap
    });
  },

  /* 估算卡片高度（rpx 量级，用于瀑布流分列） */
  _ratioPct(card) {
    let rid = card.ratio;
    if (!(presets.RATIOS || []).some(r => r.id === rid)) {
      rid = presets.LEGACY_RATIO[card.style] || presets.LEGACY_RATIO[card.template] || 'sq';
    }
    const def = (presets.RATIOS || []).find(r => r.id === rid);
    return def ? def.pct : 100;
  },

  _estCard(card) {
    const col = 340;                                  // 单列估算宽度
    const photo = col * (this._ratioPct(card) / 100); // 照片区
    const n = Math.max(0, Math.min((card.phrases || []).length, 3) - 1);
    const caption = 96 + n * 26;                      // 说明栏
    const foot = card.locText ? 40 : 24;
    return photo + caption + foot;
  },

  _dayLabel(ts) {
    const d = new Date(ts);
    const gap = util.dayGap(ts);
    let label;
    if (gap === 0) label = '今天';
    else if (gap === 1) label = '昨天';
    else label = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    if (d.getFullYear() !== new Date().getFullYear()) label += ' ' + d.getFullYear();
    return label;
  },

  _timeTitle(from, to) {
    if (!from && !to) return '全部时间';
    if (from && to) return (from === to) ? from : from + ' ～ ' + to;
    if (from) return '自 ' + from + ' 起';
    return '截止 ' + to;
  },

  /* ---------- 交互 ---------- */
  onCardTap(e) {
    const card = e.currentTarget.dataset.card;
    if (card) wx.navigateTo({ url: '/pages/detail/detail?cardId=' + card.id });
  },

  /* 🎲 随机看一张（趣味入口） */
  randomCard() {
    const list = this._cards || [];
    if (!list.length) {
      wx.showToast({ title: '还没有卡片', icon: 'none' });
      return;
    }
    const pick = list[Math.floor(Math.random() * list.length)];
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    wx.navigateTo({ url: '/pages/detail/detail?cardId=' + pick.id });
  },

  onToggleFav(e) {
    const id = e.currentTarget.dataset.id;
    const res = store.toggleFav(store.getUser().uid, id);
    const groups = this.data.groups;
    outer:
    for (let gi = 0; gi < groups.length; gi++) {
      for (const side of ['left', 'right']) {
        const items = groups[gi][side] || [];
        for (let ii = 0; ii < items.length; ii++) {
          if (items[ii].id === id) {
            this.setData({ ['groups[' + gi + '].' + side + '[' + ii + '].faved']: res.liked });
            break outer;
          }
        }
      }
    }
    if (res.liked && wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  }
});
