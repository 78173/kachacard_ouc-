const nav = require('../../utils/nav');
const store = require('../../utils/store');
const util = require('../../utils/util');
const presets = require('../../data/presets');

Page({
  data: {
    // 给一个安全占位：页面根节点不再用 wx:if 包住，数据异常时最差也只是内容空，不会整页白屏
    user: { nickname: '加载中…', uid: '', avatar: '', avatarColor: '#8ac6a0', ini: '咔' },
    theme: '',
    seg: 'made',             // made | fav
    madeList: [],
    favList: [],
    stats: { made: 0, fav: 0, phrases: 0 },
    showAccounts: false,
    accounts: [],
    newName: '',             // 新建账号输入
    accH: 320,               // 账号列表滚动高度(px)
    showPhrases: false,      // 标签词库预览
    phrasePreview: [],
    phraseBuilt: 0,
    newTag: '',              // 新增标签输入
    notifyCount: 0,          // 未读互动反馈
    showNotify: false,
    notifies: [],
    notifyH: 320,
    phH: 320,                // 词库滚动高度(px)
    swap: false,
    // 瀑布流双列
    madeCols: { left: [], right: [] },
    favCols: { left: [], right: [] },
    // 长按拖动排序
    reorderMode: false,
    drag: false,
    dragCur: -1,
    dragFrom: -1,
    dragY: 0,
    // 收藏拼图墙
    collage: [],
    collageH: 0,
    collageEdit: false,
    cDrag: false,
    cIdx: -1
  },

  onLoad() {
    try {
      const w = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).windowWidth || 375;
      this._rowPx = Math.round((w * 150) / 750);
      this._k = w / 750;                 // rpx → px
      this._wallW = w - 48 * this._k;    // 左右各 24rpx 边距
    } catch (e) {
      this._rowPx = 75;
      this._k = 0.5;
      this._wallW = 327;
    }
  },

  /* ================= 收藏拼图墙（自由拖拽 + 自适应大小） ================= */
  _hash(str) {
    let h = 0;
    for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) % 997;
    return h;
  },

  _tileSize(item, W) {
    const k = this._k;
    const wide = item.size === 'wide';
    const w = wide ? W : (W - 14 * k) / 2;
    const pct = this._ratioPct(item.card);
    const photo = w * pct / 100;
    const n = Math.max(0, Math.min((item.card.phrases || []).length, 3) - 1);
    const meta = item.card.locText || item.card.timeText ? 24 : 0;
    // 相框上下内边距(10) + 说明区上内边距(10) + 相框下内边距(14) = 34rpx
    const info = (34 + 40 + n * 26 + meta) * k;
    return { w, photo, h: photo + info };
  },

  /** 两列贪心装填，返回带位置的拼图项（保持数组顺序 = 展示顺序） */
  _packCollage() {
    const k = this._k;
    const gap = 14 * k;
    const W = this._wallW;
    const list = this.data.collage || [];
    let yL = 0;
    let yR = 0;
    const out = list.map((item, index) => {
      const s = this._tileSize(item, W);
      let x = 0;
      let y = 0;
      if (item.size === 'wide') {
        y = Math.max(yL, yR);
        yL = yR = y + s.h + gap;
      } else if (yL <= yR) {
        x = 0; y = yL; yL = y + s.h + gap;
      } else {
        x = s.w + gap; y = yR; yR = y + s.h + gap;
      }
      const dragging = this.data.cDrag && this.data.cIdx === index;
      const dx = dragging ? item.dx || 0 : 0;
      const dy = dragging ? item.dy || 0 : 0;
      const rot = item.angle || 0;
      const style =
        'left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;' +
        'width:' + Math.round(s.w) + 'px;height:' + Math.round(s.h) + 'px;' +
        'transform:rotate(' + rot + 'deg)' + (dragging ? ' translate(' + dx + 'px,' + dy + 'px) scale(1.06)' : '') + ';' +
        'z-index:' + (dragging ? 99 : 1) + ';';
      const imgStyle = 'height:' + Math.round(s.photo) + 'px;';
      const phrases = item.card.phrases || [];
      const main = phrases[0] ? ((phrases[0].emoji ? phrases[0].emoji + ' ' : '') + phrases[0].text) : '咔嚓卡片';
      const others = phrases.slice(1, 3).map(p => (p.emoji ? p.emoji + ' ' : '') + p.text);
      const metaArr = [];
      if (item.card.locText) metaArr.push('📍 ' + item.card.locText);
      if (item.card.timeText) metaArr.push('🕰 ' + item.card.timeText);
      const photos = item.card.photos || [];
      return Object.assign({}, item, {
        x: Math.round(x), y: Math.round(y), w: Math.round(s.w), h: Math.round(s.h),
        style, imgStyle, main, others, meta: metaArr.join('  '),
        cover: photos[0] || '',       // 封面在此算好，视图层不做深层次取值
        photoCount: photos.length
      });
    });
    const bottom = out.reduce((m, it) => Math.max(m, it.y + it.h), 0);
    this.setData({ collage: out, collageH: Math.round(bottom) });
  },

  _buildCollage(list) {
    const uid = this.data.user ? this.data.user.uid : store.getUser().uid;
    this._sizes = store.getFavSizes(uid) || {};
    const collage = (list || []).map((card) => {
      const h = this._hash(card.id);
      const pct = this._ratioPct(card);
      // 自动版式：竖图/方图半宽，横图通栏——间距与节奏更自然
      const auto = pct <= 82 ? 'wide' : 'half';
      return {
        id: card.id,
        card,
        size: this._sizes[card.id] || auto,
        angle: ((h % 7) - 3) * 0.8,
        dx: 0,
        dy: 0
      };
    });
    this._collageOrder = collage.map(c => c.id);
    this.setData({ collage }, () => {
      this._measureWall(() => this._packCollage());
    });
  },

  _measureWall(cb) {
    // 墙没渲染出来时（例如当前在「我制作的」分段）直接跳过，不能让整页崩掉
    try {
      wx.createSelectorQuery().select('#collageWall').boundingClientRect().exec((r) => {
        if (r && r[0] && r[0].width) this._wallW = r[0].width;
        this._wallRect = (r && r[0]) || null;
        if (cb) cb();
      });
    } catch (e) {
      if (cb) cb();
    }
  },

  toggleCollageEdit(e) {
    if (this.data.collage.length < 1) return;
    const on = !this.data.collageEdit;
    this.setData({ collageEdit: on, cDrag: false, cIdx: -1 });
    if (on) {
      this._measureWall(() => this._packCollage());
      wx.showToast({ title: '长按卡片可自由拖动', icon: 'none' });
    } else {
      const ids = (this.data.collage || []).map(c => c.id);
      store.setFavOrder(this.data.user.uid, ids);
    }
  },

  /** 一键美化：恢复“竖图半宽 / 横图通栏”的自动版式 */
  beautifyCollage() {
    if (!this.data.collage.length) return;
    const uid = this.data.user.uid;
    this._sizes = {};
    store.setFavSizes(uid, {});
    const list = this.data.collage.map((it) => {
      const pct = this._ratioPct(it.card);
      return Object.assign({}, it, { size: pct <= 82 ? 'wide' : 'half', dx: 0, dy: 0 });
    });
    this.setData({ collage: list }, () => this._packCollage());
    wx.showToast({ title: '已重新美化排版 ✨', icon: 'none' });
  },

  shuffleFav() {
    const list = (this.data.collage || []).slice();
    if (list.length < 2) return;
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    this.setData({ collage: list }, () => {
      this._packCollage();
      store.setFavOrder(this.data.user.uid, list.map(c => c.id));
      wx.showToast({ title: '已洗牌 🎲', icon: 'none' });
    });
  },

  onTileTap(e) {
    if (this.data.collageEdit || this.data.cDrag) return;
    const it = this.data.collage[e.currentTarget.dataset.i];
    if (it) nav.go('/pages/detail/detail?cardId=' + it.id );
  },

  onTileSize(e) {
    if (!this.data.collageEdit) return;
    const i = Number(e.currentTarget.dataset.i);
    const list = this.data.collage.slice();
    const it = list[i];
    it.size = it.size === 'wide' ? 'half' : 'wide';
    this._sizes[it.id] = it.size;
    store.setFavSizes(this.data.user.uid, this._sizes);
    this.setData({ collage: list }, () => this._packCollage());
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
  },

  onTileStart(e) {
    if (!this.data.collageEdit) return;
    const i = Number(e.currentTarget.dataset.i);
    const t = e.touches && e.touches[0];
    this._startX = t ? t.clientX : 0;
    this._startY = t ? t.clientY : 0;
    const it = this.data.collage[i];
    this._startTile = { x: it.x, y: it.y };
    this.setData({ cDrag: true, cIdx: i });
    this._measureWall();
  },

  onTileMove(e) {
    if (!this.data.cDrag) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dragX = t.clientX - this._startX;
    const dragY = t.clientY - this._startY;
    const list = this.data.collage.slice();
    const cur = list[this.data.cIdx];
    if (!cur) return;
    // 目标位置（相对墙面的指针坐标）
    const wall = this._wallRect || { left: 0, top: 0 };
    const lx = t.clientX - wall.left;
    const ly = t.clientY - wall.top;
    let target = -1;
    for (let j = 0; j < list.length; j++) {
      const it = list[j];
      if (lx >= it.x && lx <= it.x + it.w && ly >= it.y && ly <= it.y + it.h) { target = j; break; }
    }
    if (target >= 0 && target !== this.data.cIdx) {
      const moved = list.splice(this.data.cIdx, 1)[0];
      list.splice(target, 0, moved);
      moved.dx = 0; moved.dy = 0;
      this.setData({ collage: list, cIdx: target }, () => this._packCollage());
      this._dragFromIdx = target;
      this._startX = t.clientX;
      this._startY = t.clientY;
      return;
    }
    cur.dx = dragX;
    cur.dy = dragY;
    if (!this._dragTimer) {
      this._dragTimer = setTimeout(() => {
        this._dragTimer = null;
        this._packCollage();
      }, 16);
    }
  },

  onTileEnd() {
    if (!this.data.cDrag) return;
    const list = (this.data.collage || []).map(c => Object.assign({}, c, { dx: 0, dy: 0 }));
    this.setData({ cDrag: false, cIdx: -1, collage: list }, () => {
      this._packCollage();
      store.setFavOrder(this.data.user.uid, list.map(c => c.id));
    });
  },

  /* ---------- 瀑布流分列与高度估算 ---------- */
  _ratioPct(card) {
    let rid = card.ratio;
    if (!(presets.RATIOS || []).some(r => r.id === rid)) {
      rid = presets.LEGACY_RATIO[card.style] || presets.LEGACY_RATIO[card.template] || 'sq';
    }
    const def = (presets.RATIOS || []).find(r => r.id === rid);
    return def ? def.pct : 100;
  },

  _estCard(card) {
    const col = 340;
    const photo = col * (this._ratioPct(card) / 100);
    const n = Math.max(0, Math.min((card.phrases || []).length, 3) - 1);
    return photo + 96 + n * 26 + (card.locText ? 34 : 20);
  },

  _makeCols(list) {
    const left = [];
    const right = [];
    let lh = 0;
    let rh = 0;
    (list || []).forEach(c => {
      const h = this._estCard(c);
      if (lh <= rh) { left.push(c); lh += h; } else { right.push(c); rh += h; }
    });
    return { left, right };
  },

  /* 底部浮层：按“屏幕高度 - 头部 - 底部内容”给列表滚动区精确 px 高度 */
  _fitSheet(sel, key, contentSel) {
    const that = this;
    wx.nextTick(() => {
      const win = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
      const H = win.windowHeight || win.screenHeight || 700;
      const q = wx.createSelectorQuery();
      q.select(sel).boundingClientRect();                  // 0 浮层整体
      q.select(sel + ' .sheet-head').boundingClientRect(); // 1 头部
      q.select(sel + ' .sheet-scroll').boundingClientRect(); // 2 滚动区(client)
      q.select(contentSel).boundingClientRect();           // 3 内容自然高度
      q.exec((r) => {
        const sheet = r[0]; const head = r[1]; const list = r[2]; const content = r[3];
        if (!sheet || !list) return;
        const headH = head ? head.height : 0;
        const client = list.height || 0;
        const foot = sheet.height - headH - client;        // 底部其它内容
        const allowed = H - 24 - headH - Math.max(0, foot);
        const natural = content ? content.height : 0;
        const want = natural > 0 ? natural : 180;
        const target = Math.max(0, Math.min(want, allowed));
        that.setData({ [key]: Math.round(target) });
      });
    });
  },

  onShow() {
    this._applyTheme();
    this._refresh();
    this._syncTab(1);
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

  /* 浮层打开时临时隐藏底部导航，避免遮挡 */
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

  /* ---------- 主题切换 ---------- */
  onToggleTheme() {
    const next = store.getTheme() === 'dark' ? 'light' : 'dark';
    store.setTheme(next);
    const theme = store.getTheme();
    store.applyThemeUI(theme);
    this.setData({ theme });
    this._syncTab(1);
    wx.showToast({ title: next === 'dark' ? '已切换深色模式' : '已切换浅色模式', icon: 'none' });
  },

  _refresh() {
    const user = store.getUser();
    // 我制作的：按用户自定义顺序排序，缺省回退最新在前
    let made = store.getCards().filter(c => c.ownerId === user.uid);
    const madeOrder = store.getMadeOrder(user.uid);
    const rank = {};
    madeOrder.forEach((id, i) => { rank[id] = i; });
    made.sort((a, b) => {
      const ra = rank[a.id], rb = rank[b.id];
      if (ra == null && rb == null) return b.createdAt - a.createdAt;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return ra - rb;
    });

    // 我的收藏：按 favs[uid] 已保存的顺序
    const favIds = store.getFavOrder(user.uid);
    const fav = favIds.map(id => store.getCardById(id)).filter(Boolean);
    const favSet = {};
    favIds.forEach(id => { favSet[id] = true; });

    // 封面 / 标题 / 照片数都先算好：视图层不做 `item.phrases[0].text` 这类深层次取值，
    // 否则遇到缺字段的旧卡片会整页渲染失败
    const decorate = (c) => {
      const phrases = c.phrases || [];
      const first = phrases[0] || null;
      return Object.assign({}, c, {
        createdDay: util.friendlyDate(c.createdAt || Date.now()),
        faved: !!favSet[c.id],
        cover: (c.photos || [])[0] || '',
        photoCount: (c.photos || []).length,
        title: first ? ((first.emoji ? first.emoji + ' ' : '') + (first.text || '')) : '（没有标签的卡片）'
      });
    };
    const madeView = made.map(decorate);
    const favView = fav.map(decorate);

    const stats = store.statsFor(user.uid);
    stats.phrases = store.getPhraseLibrary().length;

    const accounts = store.getAccounts().map(a => Object.assign({}, a, {
      ini: (a.nickname || '咔').slice(0, 1),
      active: a.uid === user.uid
    }));
    const userView = Object.assign({}, user, { ini: (user.nickname || '咔').slice(0, 1) });

    this.setData({
      user: userView,
      madeList: madeView,
      madeCols: this._makeCols(madeView),
      favList: favView,
      favCols: this._makeCols(favView),
      stats,
      accounts,
      newName: '',
      reorderMode: false,
      drag: false,
      collageEdit: false,
      cDrag: false,
      cIdx: -1,
      notifyCount: store.unreadNotifyCount(user.uid)
    }, () => {
      this._buildCollage(favView);
    });
  },

  /* ---------- 互动反馈（谁收藏了 / 谁留言了 / 谁回复了） ---------- */
  toggleNotify() {
    if (!this.data.showNotify) {
      const uid = this.data.user.uid;
      const list = store.getNotifies(uid).map((n) => {
        let icon = '♥';
        let text = '';
        if (n.type === 'fav') {
          icon = '♥';
          text = (n.fromName || '有人') + ' 收藏了你的卡片「' + (n.cardLabel || '') + '」';
        } else if (n.type === 'msg') {
          icon = '💬';
          text = (n.fromName || '有人') + ' 留言：' + ((n.content || '').slice(0, 40) || '（空）');
        } else {
          icon = '↩';
          text = (n.fromName || '有人') + ' 回复' + (n.toName ? (' @' + n.toName) : '') + '：' + ((n.content || '').slice(0, 40) || '（空）');
        }
        return Object.assign({}, n, { icon, text, timeLabel: util.friendlyDate(n.at) });
      });
      let h = 320;
      try {
        const win = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
        h = Math.round((win.windowHeight || 700) * 0.42);
      } catch (e) { /* ignore */ }
      this.setData({ showNotify: true, showAccounts: false, showPhrases: false, notifies: list, notifyH: h }, () => {
        this._navHide();
        this._fitSheet('.nt-sheet', 'notifyH', '.nt-sheet .nt-scroll-body');
      });
      store.markNotifiesRead(uid);
      this.setData({ notifyCount: 0 });
    } else {
      this.setData({ showNotify: false });
      this._navShow();
    }
  },

  onNotifyTap(e) {
    const cardId = e.currentTarget.dataset.card;
    this.setData({ showNotify: false });
    this._navShow();
    if (cardId) nav.go('/pages/detail/detail?cardId=' + cardId );
  },

  onNotifyUser(e) {
    const uid = e.currentTarget.dataset.uid;
    if (!uid) return;
    if (uid === this.data.user.uid) {
      wx.showToast({ title: '这是你自己', icon: 'none' });
      return;
    }
    this.setData({ showNotify: false });
    this._navShow();
    nav.go('/pages/user/user?uid=' + uid );
  },

  /* ---------- 分段 ---------- */
  onSeg(e) {
    const seg = e.currentTarget.dataset.seg;
    if (seg === this.data.seg) return;
    this.setData({ seg, reorderMode: false, drag: false, collageEdit: false, cDrag: false, cIdx: -1 }, () => {
      if (seg === 'fav') this._measureWall(() => this._packCollage());
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  /* ---------- 拖动排序（我制作的 / 我的收藏共用） ---------- */
  _curListName() {
    return this.data.seg === 'made' ? 'madeList' : 'favList';
  },

  onSortToggle() {
    const list = this.data[this._curListName()];
    if (list.length < 2) {
      wx.showToast({ title: '至少两张才能排序', icon: 'none' });
      return;
    }
    this.setData({ reorderMode: !this.data.reorderMode, drag: false });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  onRowStart(e) {
    if (!this.data.reorderMode) return;
    const from = Number(e.currentTarget.dataset.i);
    const y = (e.touches && e.touches[0]) ? e.touches[0].clientY : 0;
    this.setData({ drag: true, dragFrom: from, dragCur: from, dragY: y });
  },

  onRowMove(e) {
    if (!this.data.drag) return;
    const y = (e.touches && e.touches[0]) ? e.touches[0].clientY : this.data.dragY;
    const H = this._rowPx || 75;
    const key = this._curListName();
    const list = this.data[key].slice();
    const n = list.length;
    const shift = Math.round((y - this.data.dragY) / H);
    let idx = this.data.dragFrom + shift;
    idx = Math.max(0, Math.min(n - 1, idx));
    if (idx === this.data.dragCur) return;
    const item = list.splice(this.data.dragFrom, 1)[0];
    list.splice(idx, 0, item);
    const patch = {
      [key]: list,
      dragCur: idx,
      dragFrom: idx,
      dragY: y
    };
    patch[key === 'madeList' ? 'madeCols' : 'favCols'] = this._makeCols(list);
    this.setData(patch);
  },

  onRowEnd() {
    if (!this.data.drag) return;
    const uid = this.data.user.uid;
    const key = this._curListName();
    const ids = this.data[key].map(c => c.id);
    if (key === 'madeList') store.setMadeOrder(uid, ids);
    else store.setFavOrder(uid, ids);
    this.setData({ drag: false, dragCur: -1, dragFrom: -1 });
    wx.showToast({ title: '已保存排序', icon: 'none' });
  },

  /* ---------- 当前账号资料编辑 ---------- */
  onChangeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const path = store.persistImage(res.tempFiles[0].tempFilePath);
        store.updateProfile({ avatar: path });
        this._refresh();
      }
    });
  },

  onEditName() {
    const user = this.data.user;
    wx.showModal({
      title: '怎么称呼你',
      editable: true,
      placeholderText: '输入新的昵称',
      success: (res) => {
        if (!res.confirm) return;
        const name = ((res.content || '').trim()).slice(0, 20);
        if (!name) return;
        store.updateProfile({ nickname: name });
        this._refresh();
      }
    });
  },

  /* ---------- 账号管理抽屉 ---------- */
  toggleAccounts() {
    const open = !this.data.showAccounts;
    this.setData({ showAccounts: open, showPhrases: false }, () => {
      if (open) {
        this._navHide();
        this._fitSheet('.acc-sheet', 'accH', '.acc-sheet .acc-scroll-body');
      } else {
        this._navShow();
      }
    });
  },

  stopBubble() { /* 阻止冒泡 */ },

  noop() { /* 拦截 touchmove，避免底层页面跟随滚动 */ },

  onNewName(e) {
    this.setData({ newName: e.detail.value });
  },

  onCreateAccount() {
    this._createWith(this.data.newName);
  },

  onQuickCreate() {
    this._createWith('');
  },

  _createWith(raw) {
    const name = (raw || '').trim();
    const acc = name ? store.createAccount(name) : store.createAccount();
    wx.showToast({ title: '已创建并切换：' + (acc && acc.nickname || '新账号'), icon: 'none' });
    this.setData({ seg: 'made' });
    this._refresh();
  },

  onUseAccount(e) {
    const uid = e.currentTarget.dataset.uid;
    if (uid === this.data.user.uid) {
      this.toggleAccounts();
      return;
    }
    const next = store.switchAccount(uid);
    if (!next) {
      wx.showToast({ title: '切换失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已切换：' + next.nickname, icon: 'none' });
    this.setData({ showAccounts: false, seg: 'made' });
    this._navShow();
    this._refresh();
  },

  onRemoveAccount(e) {
    const uid = e.currentTarget.dataset.uid;
    if (uid === this.data.user.uid) {
      wx.showToast({ title: '当前账号请先切换到其它账号再删除', icon: 'none' });
      return;
    }
    const acc = this.data.accounts.find(a => a.uid === uid);
    wx.showModal({
      title: '删除账号',
      content: '删除「' + (acc && acc.nickname) + '」？该账号的收藏与标签记录将不再显示（制作的卡片仍保留在卡片墙）。',
      confirmText: '删除',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        const r = store.removeAccount(uid);
        if (!r.ok) {
          wx.showToast({ title: '至少保留一个账号', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已删除', icon: 'none' });
        this._refresh();
      }
    });
  },

  /* ---------- 标签词库预览（当前账号） ---------- */
  _phraseSheetData() {
    const presetIds = {};
    presets.PRESET_PHRASES.forEach(p => { presetIds[p.id] = true; });
    const list = store.getPhraseLibrary().map(p => Object.assign({}, p, {
      built: !!presetIds[p.id]
    }));
    return { phrasePreview: list, phraseBuilt: list.filter(p => p.built).length };
  },

  /** 词库变更后：刷新面板与统计 */
  _refreshPhraseSheet() {
    const patch = this._phraseSheetData();
    patch['stats.phrases'] = patch.phrasePreview.length;
    this.setData(patch, () => {
      if (this.data.showPhrases) this._fitSheet('.ph-sheet', 'phH', '.ph-sheet .ph-scroll-body');
    });
  },

  togglePhrases() {
    if (!this.data.showPhrases) {
      const patch = this._phraseSheetData();
      this.setData(Object.assign({ showPhrases: true, showAccounts: false, newTag: '' }, patch), () => {
        this._navHide();
        this._fitSheet('.ph-sheet', 'phH', '.ph-sheet .ph-scroll-body');
      });
    } else {
      this.setData({ showPhrases: false });
      this._navShow();
    }
  },

  onNewTag(e) {
    this.setData({ newTag: e.detail.value });
  },

  addTag() {
    const text = (this.data.newTag || '').trim();
    if (!text) {
      wx.showToast({ title: '请输入标签内容', icon: 'none' });
      return;
    }
    store.addCustomPhrase(text, '✨');
    this.setData({ newTag: '' });
    this._refreshPhraseSheet();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  renameTag(e) {
    const id = e.currentTarget.dataset.id;
    const cur = (this.data.phrasePreview || []).find(p => p.id === id);
    if (!cur) return;
    wx.showModal({
      title: '修改标签',
      editable: true,
      content: cur.text,
      placeholderText: '输入新的标签内容',
      success: (res) => {
        if (!res.confirm) return;
        const text = (res.content || '').trim();
        if (!text || text === cur.text) return;
        store.updatePhrase(id, text, cur.emoji);
        this._refreshPhraseSheet();
        wx.showToast({ title: '已修改', icon: 'success' });
      }
    });
  },

  deleteTag(e) {
    const id = e.currentTarget.dataset.id;
    const cur = (this.data.phrasePreview || []).find(p => p.id === id);
    if (!cur) return;
    wx.showModal({
      title: '删除标签',
      content: '删除「' + cur.text + '」？已制作卡片上的文字不受影响；该标签将从当前账号的词库中移除。',
      confirmText: '删除',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        store.removePhrase(id);
        this._refreshPhraseSheet();
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  },

  /* ---------- 卡片交互 ---------- */
  onCardTap(e) {
    const card = e.currentTarget.dataset.card;
    if (card) nav.go('/pages/detail/detail?cardId=' + card.id );
  },

  onToggleFav(e) {
    const id = e.currentTarget.dataset.id;
    const uid = this.data.user.uid;
    const res = store.toggleFav(uid, id);

    let madeList = this.data.madeList.map(c =>
      c.id === id ? Object.assign({}, c, { faved: res.liked }) : c
    );
    let favList = this.data.favList;
    if (res.liked) {
      if (!favList.some(c => c.id === id)) {
        const card = store.getCardById(id);
        if (card) {
          favList = [Object.assign({}, card, {
            createdDay: util.friendlyDate(card.createdAt),
            faved: true
          })].concat(favList);
        }
      }
    } else {
      favList = favList.filter(c => c.id !== id);
    }

    const stats = Object.assign({}, this.data.stats, {
      made: madeList.filter(c => c.ownerId === uid).length,
      fav: favList.length
    });
    this.setData({
      madeList,
      madeCols: this._makeCols(madeList),
      favList,
      favCols: this._makeCols(favList),
      stats
    }, () => {
      this._buildCollage(favList);
    });
    if (res.liked && wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  goCreate() {
    nav.go('/pages/create/create');
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
