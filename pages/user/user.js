const nav = require('../../utils/nav');
const store = require('../../utils/store');
const util = require('../../utils/util');
const presets = require('../../data/presets');

Page({
  data: {
    theme: '',
    uid: '',
    // 给一个安全占位，页面根节点不依赖 wx:if，避免数据异常时整页空白
    user: { nickname: '加载中…', uid: '', avatar: '', avatarColor: '#8ac6a0', ini: '咔' },
    err: '',
    isSelf: false,
    cards: [],
    cols: { left: [], right: [] },
    madeCount: 0,
    favGot: 0
  },

  onLoad(options) {
    if (options && options.uid) this.setData({ uid: options.uid });
    else this.setData({ err: '没有指定要查看的用户' });
  },

  onShow() {
    this._applyTheme();
    this._load();
  },

  _applyTheme() {
    const theme = store.getTheme();
    store.applyThemeUI(theme);
    this.setData({ theme });
  },

  _ratioPct(card) {
    let rid = card.ratio;
    if (!(presets.RATIOS || []).some(r => r.id === rid)) {
      rid = presets.LEGACY_RATIO[card.style] || presets.LEGACY_RATIO[card.template] || 'sq';
    }
    const def = (presets.RATIOS || []).find(r => r.id === rid);
    return def ? def.pct : 100;
  },

  _estCard(card) {
    const photo = 340 * (this._ratioPct(card) / 100);
    const n = Math.max(0, Math.min((card.phrases || []).length, 3) - 1);
    return photo + 96 + n * 26 + (card.locText ? 34 : 20);
  },

  _makeCols(list) {
    const left = [];
    const right = [];
    let lh = 0;
    let rh = 0;
    (list || []).forEach((c) => {
      const h = this._estCard(c);
      if (lh <= rh) { left.push(c); lh += h; } else { right.push(c); rh += h; }
    });
    return { left, right };
  },

  _load() {
    const uid = this.data.uid;
    if (!uid) {
      this.setData({ err: this.data.err || '没有指定要查看的用户' });
      return;
    }
    const me = store.getUser();
    const found = store.getUserById(uid);
    const profile = found || { uid, nickname: '某位朋友', avatar: '', avatarColor: '#8ac6a0' };
    const user = Object.assign({}, profile, {
      ini: (profile.nickname || '咔').slice(0, 1)
    });

    const cards = store.getCardsByOwner(uid).map(c => Object.assign({}, c, {
      createdDay: util.friendlyDate(c.createdAt)
    }));
    let favGot = 0;
    cards.forEach(c => { favGot += store.favCount(c.id); });

    wx.setNavigationBarTitle({ title: (profile.nickname || '用户') + ' 的主页' });
    this.setData({
      user,
      err: '',
      isSelf: uid === me.uid,
      cards,
      cols: this._makeCols(cards),
      madeCount: cards.length,
      favGot
    });
  },

  onCardTap(e) {
    const card = e.currentTarget.dataset.card;
    if (card) nav.go('/pages/detail/detail?cardId=' + card.id );
  },

  goSelf() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  onShareAppMessage() {
    return {
      title: (this.data.user && this.data.user.nickname || '用户') + ' 的卡片主页',
      path: '/pages/user/user?uid=' + this.data.uid
    };
  }
});
