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
    liked: false,
    likedAnim: false,
    isOwner: false,
    msgs: [],
    msgText: '',
    msgLen: 0,
    msgMax: MAX_MSG,
    createdDay: '',
    autoPlay: true,
    theme: '',
    exportStyle: 'width:750px;height:900px;',
    exporting: false
  },

  _applyTheme() {
    const theme = store.getTheme();
    store.applyThemeUI(theme);
    this.setData({ theme });
  },

  toggleAutoPlay() {
    this.setData({ autoPlay: !this.data.autoPlay });
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
          exporter.exportCard(node, card, pct).then((path) => {
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
      wx.showToast({ title: '卡片不存在或已删除', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    const user = this.data.user || store.getUser();
    const msgs = (card.messages || []).slice().reverse().map(m => Object.assign({}, m, {
      timeLabel: util.friendlyDate(m.at),
      ini: (m.name || '咔').slice(0, 1)
    }));
    const ownerName = card.ownerName || '咔嚓用户';
    this.setData({
      card,
      user,
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
      msgText: '',
      msgLen: 0
    });
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
    wx.navigateTo({ url: '/pages/create/create?cardId=' + this.data.card.id });
  },

  goRemake() {
    // 任何访客都能“仿照制作一张自己的卡片”
    wx.navigateTo({ url: '/pages/create/create?copyCardId=' + this.data.card.id });
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
    const updated = store.addMessage(card.id, msg);
    if (updated) {
      this._load();
      wx.showToast({ title: '已送达 ✉️', icon: 'none' });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    } else {
      wx.showToast({ title: '留言失败', icon: 'none' });
    }
  },

  /* 分享能力已按需求移除：测试号无法把卡片真正导出到小程序外 */
});
