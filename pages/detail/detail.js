const nav = require('../../utils/nav');
const store = require('../../utils/store');
const util = require('../../utils/util');
const presets = require('../../data/presets');
const exporter = require('../../utils/cardExporter');

const MAX_MSG = 500;

function ratioPctOf(card) {
  let rid = card.ratio;
  if (!(presets.RATIOS || []).some(r => r.id === rid)) {
    rid = presets.LEGACY_RATIO[card.style] || presets.LEGACY_RATIO[card.template] || 'sq';
  }
  const def = (presets.RATIOS || []).find(r => r.id === rid);
  return def ? def.pct : 100;
}

Page({
  data: {
    cardId: '',
    card: null,
    user: null,
    owner: null,
    err: '',
    // 翻面看“卡片背面”
    flipped: false,
    backMood: null,
    backTitle: '',
    backTags: [],
    backQuote: '',
    stickerCount: 0,
    photoCount: 0,
    liked: false,
    likedAnim: false,
    isOwner: false,
    msgs: [],
    msgText: '',
    msgLen: 0,
    msgMax: MAX_MSG,
    createdDay: '',
    favCount: 0,
    msgCount: 0,
    replyTo: '',
    replyToName: '',
    autoPlay: true,
    theme: '',
    exportStyle: 'width:750px;height:900px;',
    exporting: false,
    // 导出图片选择
    showPick: false,
    pickItems: [],
    pickCount: 0,
    pickLabel: '保存选中原图',
    pickH: 300
  },

  _applyTheme() {
    const theme = store.getTheme();
    store.applyThemeUI(theme);
    this.setData({ theme });
  },

  toggleAutoPlay() {
    this.setData({ autoPlay: !this.data.autoPlay });
  },

  /** 手指触碰图片：立即暂停自动播放，交还手动滑动 */
  onSwiperTouch() {
    if (this.data.autoPlay) this.setData({ autoPlay: false });
  },

  noop() { /* 拦截 touchmove，避免底层页面跟随滚动 */ },

  /* ---------- 翻面：看卡片的“背面” ---------- */
  toggleFlip() {
    if (!this.data.card) return;
    const next = !this.data.flipped;
    // 看背面时让轮播停下来，翻回正面再恢复自动播放
    this.setData({ flipped: next, autoPlay: next ? false : ((this.data.card.photos || []).length > 1) });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  /** 组织背面要展示的内容 */
  _buildBack(card, msgs) {
    const phrases = card.phrases || [];
    const first = phrases[0] || null;
    const backTitle = first ? ((first.emoji ? first.emoji + ' ' : '') + first.text) : '一张没有标题的卡片';
    const backTags = phrases.slice(1, 5).map(p => (p.emoji ? p.emoji + ' ' : '') + p.text);
    const moodDef = (presets.MOODS || []).filter(m => m.id === card.mood)[0] || null;
    const last = msgs[0];
    const backQuote = last
      ? '「' + (last.content || '').slice(0, 48) + (last.content && last.content.length > 48 ? '…' : '') + '」 —— ' + (last.name || '一位朋友')
      : (card.reservedText || '这张卡片还没有人留言，背面空地等着被写满。');
    return {
      backTitle,
      backTags,
      backQuote,
      backMood: moodDef
        ? { emoji: moodDef.emoji, text: moodDef.text, style: 'background:' + moodDef.color + ';' }
        : null
    };
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  /* 下滑定位到评论区 */
  goComment() {
    const q = wx.createSelectorQuery();
    q.select('#comment-sec').boundingClientRect();
    q.selectViewport().scrollOffset();
    q.exec((res) => {
      const top = res && res[0] ? res[0].top : 0;
      const st = res && res[1] ? res[1].scrollTop : 0;
      wx.pageScrollTo({ scrollTop: Math.max(0, st + top - 100), duration: 320 });
    });
  },

  /* ---------- 导出卡片图片 / 分享 ---------- */
  exportCard() {
    const card = this.data.card;
    if (!card || this.data.exporting) return;
    const picked = (this._picked && this._picked.length)
      ? this._picked
      : (card.photos || []);
    const pct = ratioPctOf(card);
    const H = exporter.measureHeight(pct);
    this.setData({ exporting: true, exportStyle: 'width:750px;height:' + H + 'px;' }, () => {
      wx.nextTick(() => {
        wx.createSelectorQuery().select('#exportCanvas').fields({ node: true, size: true }).exec((res) => {
          const node = res && res[0] && res[0].node;
          if (!node) {
            this.setData({ exporting: false });
            wx.showToast({ title: '导出失败', icon: 'none' });
            return;
          }
          exporter.exportCard(node, card, pct, picked).then((path) => {
            this._shareImage = path;
            this.setData({ exporting: false });
            this._offerShare(path);
          }).catch(() => {
            this.setData({ exporting: false });
            wx.showToast({ title: '导出失败，请重试', icon: 'none' });
          });
        });
      });
    });
  },

  /* ---------- 选择要导出的图片 ---------- */
  openPicker() {
    const card = this.data.card;
    if (!card || !(card.photos || []).length) return;
    const items = card.photos.map(src => ({ src, sel: true }));
    let h = 300;
    try {
      const win = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
      h = Math.round((win.windowHeight || 700) * 0.4);
    } catch (e) { /* ignore */ }
    this.setData({
      showPick: true,
      pickItems: items,
      pickCount: items.length,
      pickLabel: '保存选中原图（' + items.length + '）',
      pickH: h
    });
  },

  closePick() {
    this.setData({ showPick: false });
  },

  _updatePick(items, extra) {
    const n = items.filter(i => i.sel).length;
    this.setData(Object.assign({
      pickItems: items,
      pickCount: n,
      pickLabel: n ? '保存选中原图（' + n + '）' : '保存选中原图'
    }, extra || {}));
  },

  togglePick(e) {
    const i = Number(e.currentTarget.dataset.i);
    const items = this.data.pickItems.slice();
    items[i] = Object.assign({}, items[i], { sel: !items[i].sel });
    this._updatePick(items);
  },

  pickAll() {
    this._updatePick(this.data.pickItems.map(i => Object.assign({}, i, { sel: true })));
  },

  pickNone() {
    this._updatePick(this.data.pickItems.map(i => Object.assign({}, i, { sel: false })));
  },

  pickFirstOnly() {
    this._updatePick(this.data.pickItems.map((i, idx) => Object.assign({}, i, { sel: idx === 0 })));
  },

  _pickedPaths() {
    return (this.data.pickItems || []).filter(i => i.sel).map(i => i.src);
  },

  savePickedOriginals() {
    const paths = this._pickedPaths();
    if (!paths.length) {
      wx.showToast({ title: '请至少选择一张', icon: 'none' });
      return;
    }
    this.setData({ showPick: false });
    this._saveAllPhotos(paths);
  },

  makeCardImage() {
    const paths = this._pickedPaths();
    if (!paths.length) {
      wx.showToast({ title: '请至少选择一张', icon: 'none' });
      return;
    }
    this._picked = paths;              // 只选 1 张时，效果等同原来的单张导出
    this.setData({ showPick: false }, () => this.exportCard());
  },

  _offerShare(path) {
    wx.showActionSheet({
      itemList: ['保存到相册', '发送给朋友'],
      success: (res) => {
        if (res.tapIndex === 0) this._saveToAlbum(path);
        else if (res.tapIndex === 1) this._shareImageMenu(path);
      },
      fail: () => {}
    });
  },

  /** 逐张保存原始照片 */
  _saveAllPhotos(photos) {
    let done = 0;
    let ok = 0;
    wx.showLoading({ title: '保存中…', mask: true });
    photos.forEach((p) => {
      wx.saveImageToPhotosAlbum({
        filePath: p,
        success: () => { ok += 1; },
        complete: () => {
          done += 1;
          if (done === photos.length) {
            wx.hideLoading();
            wx.showToast({ title: '已保存 ' + ok + ' 张原图', icon: 'none' });
          }
        }
      });
    });
  },

  _saveToAlbum(path) {
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize') >= 0 || msg.indexOf('auth denied') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许“保存到相册”',
            confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting(); }
          });
        } else if (msg.indexOf('cancel') < 0) {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  _shareImageMenu(path) {
    if (wx.showShareImageMenu) {
      wx.showShareImageMenu({ path, fail: () => {} });
    } else {
      wx.previewImage({ urls: [path] });
      wx.showToast({ title: '长按图片可转发', icon: 'none' });
    }
  },

  onShareAppMessage() {
    const card = this.data.card || {};
    const phrase = (card.phrases && card.phrases[0] && card.phrases[0].text) || '咔嚓卡片';
    const res = {
      title: '「' + phrase + '」· 咔嚓卡片',
      path: '/pages/detail/detail?cardId=' + this.data.cardId
    };
    if (this._shareImage) res.imageUrl = this._shareImage;
    return res;
  },

  onShareTimeline() {
    const card = this.data.card || {};
    const phrase = (card.phrases && card.phrases[0] && card.phrases[0].text) || '咔嚓卡片';
    return { title: '「' + phrase + '」· 咔嚓卡片' };
  },

  onLoad(options) {
    if (!options.cardId) {
      wx.showToast({ title: '参数缺失', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    wx.setNavigationBarTitle({ title: '卡片详情' });
    this.setData({ cardId: options.cardId, user: store.getUser() });
    this._load();
  },

  onShow() {
    this._applyTheme();
    if (this.data.cardId) this._load();
  },

  _load() {
    const card = store.getCardById(this.data.cardId);
    if (!card) {
      this.setData({ err: '这张卡片不存在，可能已经被删除了' });
      wx.showToast({ title: '卡片不存在或已删除', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 900);
      return;
    }
    const user = this.data.user || store.getUser();
    const msgs = (card.messages || []).slice().reverse().map(m => Object.assign({}, m, {
      timeLabel: util.friendlyDate(m.at),
      ini: (m.name || '咔').slice(0, 1),
      mine: m.uid === user.uid,
      replies: (m.replies || []).map(r => Object.assign({}, r, {
        timeLabel: util.friendlyDate(r.at),
        ini: (r.name || '咔').slice(0, 1),
        mine: r.uid === user.uid
      }))
    }));
    const ownerName = card.ownerName || '咔嚓用户';
    const back = this._buildBack(card, msgs);
    this.setData(Object.assign({
      card,
      user,
      err: '',
      stickerCount: (card.stickers || []).length,
      photoCount: (card.photos || []).length,
      owner: {
        name: ownerName,
        ini: ownerName.slice(0, 1),
        avatar: card.ownerAvatar || '',
        color: card.ownerAvatarColor || '#8ac6a0'
      },
      msgs,
      liked: store.getFavIds(user.uid).indexOf(card.id) >= 0,
      isOwner: card.ownerId === user.uid,
      createdDay: util.friendlyDate(card.createdAt),
      favCount: store.favCount(card.id),
      msgCount: msgs.length,
      msgText: '',
      msgLen: 0,
      replyTo: '',
      replyToName: ''
    }, back));
  },

  /* ---------------- 收藏 ---------------- */
  toggleFav() {
    if (!this.data.card) return;
    const res = store.toggleFav(this.data.user.uid, this.data.card.id);
    this.setData({ liked: res.liked, likedAnim: true });
    setTimeout(() => this.setData({ likedAnim: false }), 500);
    if (res.liked && wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  /* ---------------- 创作者操作 ---------------- */
  goEdit() {
    if (!this.data.card) return;
    nav.go('/pages/create/create?cardId=' + this.data.card.id );
  },

  goRemake() {
    // 任何访客都能“仿照制作一张自己的卡片”
    nav.go('/pages/create/create?copyCardId=' + this.data.card.id );
  },

  onDelete() {
    const card = this.data.card;
    wx.showModal({
      title: '删除卡片',
      content: '删除后照片与本卡片的留言将一并移除，确定吗？',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        const removed = store.removeCard(card.id);
        if (removed) store.removeImages(removed.photos || []);
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 450);
      }
    });
  },

  /* ---------------- 留言 ---------------- */
  onMsgInput(e) {
    const v = (e.detail.value || '').slice(0, MAX_MSG);
    this.setData({ msgText: v, msgLen: v.length });
  },

  sendMsg() {
    const content = (this.data.msgText || '').trim();
    if (!content) {
      wx.showToast({ title: '先写点什么吧', icon: 'none' });
      return;
    }
    const card = this.data.card;
    const u = this.data.user;
    const msg = {
      id: util.genId('msg'),
      uid: u.uid,
      name: u.nickname,
      avatar: u.avatar || '',
      avatarColor: u.avatarColor || '#8ac6a0',
      content: content,
      at: Date.now()
    };
    let updated = null;
    if (this.data.replyTo) {
      msg.replyToName = this.data.replyToName || '';
      updated = store.addReply(card.id, this.data.replyTo, msg);
    } else {
      updated = store.addMessage(card.id, msg);
    }
    if (updated) {
      const wasReply = !!this.data.replyTo;
      this.setData({ replyTo: '', replyToName: '' });
      this._load();
      wx.showToast({ title: wasReply ? '已回复 ↩' : '已送达 ✉️', icon: 'none' });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    } else {
      wx.showToast({ title: '发送失败', icon: 'none' });
    }
  },

  /* ---------- 回复某条留言 / 跳转他人主页 ---------- */
  onReply(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '';
    this.setData({ replyTo: id, replyToName: name });
    this.goComment();
  },

  cancelReply() {
    this.setData({ replyTo: '', replyToName: '' });
  },

  onUserTap(e) {
    const uid = e.currentTarget.dataset.uid;
    if (!uid) return;
    if (this.data.user && uid === this.data.user.uid) {
      wx.switchTab({ url: '/pages/profile/profile' });
      return;
    }
    nav.go('/pages/user/user?uid=' + uid );
  },

  /* 分享能力已按需求移除：测试号无法把卡片真正导出到小程序外 */
});
