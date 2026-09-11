const store = require('../../utils/store');
const util = require('../../utils/util');
const presets = require('../../data/presets');

const MAX_PHOTOS = 9;
const MAX_PHRASES = 4;
const MAX_RESERVED = 300;

function resolveCard(card) {
  const hasStyle = presets.STYLES.some(s => s.id === card.style);
  const style = hasStyle ? card.style
    : (card.template === 'classic' ? 'light'
      : (presets.STYLES.some(s => s.id === card.template) ? card.template : 'light'));
  const hasRatio = presets.RATIOS.some(r => r.id === card.ratio);
  const ratio = hasRatio ? card.ratio
    : (presets.LEGACY_RATIO[card.style] || presets.LEGACY_RATIO[card.template] || 'sq');
  return { style, ratio };
}

Page({
  data: {
    isEdit: false,
    cardId: '',
    photos: [],
    maxPhotos: MAX_PHOTOS,
    // 照片拖动排序（第 1 张为封面）
    reorderPhoto: false,
    pDrag: false,
    pCur: -1,
    pFrom: -1,
    pY: 0,
    // 版式（照片比例）
    ratios: presets.RATIOS,
    ratio: 'sq',
    // 背景风格
    styles: presets.STYLES,
    style: 'light',
    bgSwatches: presets.BG_SWATCHES,
    customBg: null,          // { v: css|图片路径, img: bool } 自定义底色/背景图
    layoutHint: '',
    phraseLibrary: [],
    phraseChips: [],
    phrases: [],
    selPhrase: {},
    managePhrase: false,
    timeText: '',
    locText: '',
    timePresets: presets.TIME_PRESETS,
    placePresets: presets.PLACE_PRESETS,
    reservedText: '',
    reservedLen: 0,
    reservedMax: MAX_RESERVED,
    reservedDefault: presets.DEFAULT_RESERVED,
    previewCard: null,
    theme: ''
  },

  onShow() {
    this._applyTheme();
  },

  _applyTheme() {
    const theme = store.getTheme();
    store.applyThemeUI(theme);
    this.setData({ theme });
  },

  onUnload() {
    if (!this.data.isEdit && !this._saved && this._pendingDelete && this._pendingDelete.length) {
      store.removeImages(this._pendingDelete);
    }
    this._pendingDelete = [];
  },

  onLoad(options) {
    if (options.cardId) {
      const user = store.getUser();
      const card = store.getCardById(options.cardId);
      if (card && card.ownerId === user.uid) {
        this._fill(card, true);
        wx.setNavigationBarTitle({ title: '编辑卡片' });
        return;
      }
      wx.showToast({ title: '只能编辑自己制作的卡片', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    if (options.copyCardId) {
      const src = store.getCardById(options.copyCardId);
      if (!src) {
        wx.showToast({ title: '源卡片不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      const photos = (src.photos || []).map(p => store.persistImage(p));
      const copy = Object.assign({}, src, { photos });
      this._fill(copy, false);
      wx.setNavigationBarTitle({ title: '仿照制作一张' });
      return;
    }
    this._initFresh();
  },

  _initFresh() {
    this.setData({
      isEdit: false,
      cardId: '',
      photos: [],
      ratio: 'sq',
      style: 'light',
      customBg: null,
      phraseLibrary: store.getPhraseLibrary(),
      phrases: [],
      timeText: '',
      locText: '',
      reservedText: '',
      reservedLen: 0,
      previewCard: null
    }, () => this._rebuild());
  },

  _fill(card, isEdit) {
    const layout = resolveCard(card);
    this.setData({
      isEdit: isEdit,
      cardId: isEdit ? card.id : '',
      photos: (card.photos || []).slice(),
      ratio: layout.ratio,
      style: layout.style,
      customBg: card.customBg || null,
      phraseLibrary: store.getPhraseLibrary(),
      phrases: (card.phrases || []).slice(),
      timeText: card.timeText || '',
      locText: card.locText || '',
      reservedText: card.reservedText || '',
      reservedLen: (card.reservedText || '').length,
      previewCard: null
    }, () => this._rebuild());
  },

  /* ---------------- 状态同步 + 实时预览 ---------------- */
  _rebuild() {
    const d = this.data;
    const styleObj = presets.STYLES.find(s => s.id === d.style) || presets.STYLES[0];
    const ratioObj = presets.RATIOS.find(r => r.id === d.ratio) || presets.RATIOS[0];
    const selPhrase = {};
    (d.phrases || []).forEach(p => { selPhrase[p.id] = true; });

    const patch = {
      selPhrase,
      layoutHint: styleObj.name + ' · ' + ratioObj.name,
      phraseChips: (d.phraseLibrary || []).map(p => Object.assign({}, p, {
        on: !!selPhrase[p.id]
      }))
    };

    if (!d.photos.length) {
      patch.previewCard = null;
      this.setData(patch);
      return;
    }
    patch.previewCard = {
      id: 'preview',
      style: d.style,
      ratio: d.ratio,
      photos: d.photos,
      phrases: d.phrases,
      timeText: d.timeText,
      locText: d.locText,
      customBg: d.customBg || null
    };
    this.setData(patch);
  },

  /* ============ ① 照片 ============ */
  addPhotos() {
    const remain = MAX_PHOTOS - this.data.photos.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多 9 张照片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const added = res.tempFiles.map(f => store.persistImage(f.tempFilePath));
        this.setData({ photos: this.data.photos.concat(added) }, () => this._rebuild());
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') < 0) {
          wx.showToast({ title: '读取相册失败', icon: 'none' });
        }
      }
    });
  },

  removePhoto(e) {
    const i = e.currentTarget.dataset.i;
    const photos = this.data.photos.slice();
    const gone = photos.splice(i, 1);
    this._pendingDelete = (this._pendingDelete || []).concat(gone);
    this.setData({ photos }, () => this._rebuild());
  },

  setCover(e) {
    const i = e.currentTarget.dataset.i;
    if (i === 0) return;
    const photos = this.data.photos.slice();
    const [img] = photos.splice(i, 1);
    photos.unshift(img);
    this.setData({ photos }, () => this._rebuild());
    wx.showToast({ title: '已设为封面', icon: 'none' });
  },

  previewPhoto(e) {
    const i = e.currentTarget.dataset.i;
    wx.previewImage({ urls: this.data.photos, current: this.data.photos[i] });
  },

  /* ---------- 照片拖动排序（第 1 张即封面） ---------- */
  togglePhotoOrder() {
    if (this.data.photos.length < 2) {
      wx.showToast({ title: '至少两张才能排序', icon: 'none' });
      return;
    }
    this.setData({ reorderPhoto: !this.data.reorderPhoto, pDrag: false });
  },

  photoRowStart(e) {
    if (!this.data.reorderPhoto) return;
    if (!this._pRow) {
      try {
        const w = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).windowWidth || 375;
        this._pRow = Math.round((w * 150) / 750);
      } catch (err) { this._pRow = 75; }
    }
    const from = Number(e.currentTarget.dataset.i);
    const y = (e.touches && e.touches[0]) ? e.touches[0].clientY : 0;
    this.setData({ pDrag: true, pFrom: from, pCur: from, pY: y });
  },

  photoRowMove(e) {
    if (!this.data.pDrag) return;
    const y = (e.touches && e.touches[0]) ? e.touches[0].clientY : this.data.pY;
    const H = this._pRow || 75;
    const list = this.data.photos.slice();
    const n = list.length;
    const shift = Math.round((y - this.data.pY) / H);
    let idx = this.data.pFrom + shift;
    idx = Math.max(0, Math.min(n - 1, idx));
    if (idx === this.data.pCur) return;
    const item = list.splice(this.data.pFrom, 1)[0];
    list.splice(idx, 0, item);
    this.setData({ photos: list, pCur: idx, pFrom: idx, pY: y }, () => this._rebuild());
  },

  photoRowEnd() {
    if (!this.data.pDrag) return;
    this.setData({ pDrag: false, pCur: -1, pFrom: -1 });
    if (this.data.photos.length) this._rebuild();
    wx.showToast({ title: '封面已更新', icon: 'none' });
  },

  /* ============ ② 版式 / 风格 ============ */
  pickRatio(e) {
    const r = this.data.ratios[e.currentTarget.dataset.i];
    if (!r || r.id === this.data.ratio) return;
    this.setData({ ratio: r.id }, () => this._rebuild());
  },

  pickStyle(e) {
    const s = this.data.styles[e.currentTarget.dataset.i];
    if (!s || s.id === this.data.style) return;
    this.setData({ style: s.id }, () => this._rebuild());
  },

  /* ---------- 自定义底色 / 背景图 ---------- */
  pickBg(e) {
    const bg = this.data.bgSwatches[e.currentTarget.dataset.i];
    if (!bg) return;
    this.setData({ customBg: { v: bg.css, img: false } }, () => this._rebuild());
  },

  chooseBgImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const path = store.persistImage(res.tempFiles[0].tempFilePath);
        this.setData({ customBg: { v: path, img: true } }, () => this._rebuild());
      }
    });
  },

  clearBg() {
    this.setData({ customBg: null }, () => this._rebuild());
  },

  /* ============ ③ 标签 ============ */
  toggleManage() {
    this.setData({ managePhrase: !this.data.managePhrase });
  },

  removePhrase(e) {
    const chip = this.data.phraseChips[e.currentTarget.dataset.i];
    if (!chip) return;
    wx.showModal({
      title: '删除标签',
      content: '删除「' + chip.text + '」？已制作卡片上的文字不受影响；该标签将从当前账号的词库中移除。',
      confirmText: '删除',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        store.removePhrase(chip.id);
        const phrases = this.data.phrases.filter(p => p.id !== chip.id);
        this.setData({
          phraseLibrary: store.getPhraseLibrary(),
          phrases
        }, () => this._rebuild());
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  },

  onPickPhrase(e) {
    const idx = e.currentTarget.dataset.i;
    const picked = this.data.phraseLibrary[idx];
    if (!picked) return;
    const phrases = this.data.phrases.slice();
    const has = phrases.findIndex(p => p.id === picked.id);
    if (has >= 0) phrases.splice(has, 1);
    else {
      if (phrases.length >= MAX_PHRASES) {
        wx.showToast({ title: '最多选 ' + MAX_PHRASES + ' 句', icon: 'none' });
        return;
      }
      phrases.push(picked);
    }
    this.setData({ phrases }, () => this._rebuild());
  },

  addCustomPhrase() {
    wx.showModal({
      title: '新增标签',
      editable: true,
      placeholderText: '例如：今天也要元气满满',
      success: (res) => {
        if (!res.confirm) return;
        const text = (res.content || '').trim();
        if (!text) {
          wx.showToast({ title: '标签不能为空', icon: 'none' });
          return;
        }
        const p = store.addCustomPhrase(text, '✨');
        const phrases = this.data.phrases.slice();
        if (phrases.length < MAX_PHRASES) phrases.push(p);
        this.setData({
          phraseLibrary: store.getPhraseLibrary(),
          phrases
        }, () => this._rebuild());
        wx.showToast({ title: '已加入当前账号词库', icon: 'success' });
      }
    });
  },

  /* ============ ④ 时间 / 地点 ============ */
  onTimePreset(e) {
    const v = e.currentTarget.dataset.v;
    let timeText = '';
    if (v === 'now') timeText = util.formatDateTime(Date.now());
    else if (v === 'yesterday') timeText = util.formatDateTime(Date.now() - 86400000);
    this.setData({ timeText }, () => this._rebuild());
  },

  onTimeInput(e) {
    this.setData({ timeText: e.detail.value }, () => this._rebuild());
  },

  onPlacePreset(e) {
    const v = e.currentTarget.dataset.v;
    this.setData({ locText: v }, () => this._rebuild());
  },

  onLocInput(e) {
    this.setData({ locText: e.detail.value }, () => this._rebuild());
  },

  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        const name = res.name || res.address || '';
        if (name) this.setData({ locText: name }, () => this._rebuild());
      },
      fail: () => {
        wx.showToast({ title: '未获取定位，可手动填写', icon: 'none' });
      }
    });
  },

  /* ============ ⑤ 预留长文本 ============ */
  onReservedInput(e) {
    const v = (e.detail.value || '').slice(0, MAX_RESERVED);
    this.setData({ reservedText: v, reservedLen: v.length });
  },

  onReservedFill() {
    this.setData({
      reservedText: presets.DEFAULT_RESERVED,
      reservedLen: presets.DEFAULT_RESERVED.length
    });
  },

  onReservedClear() {
    this.setData({ reservedText: '', reservedLen: 0 });
  },

  /* ============ 保存 ============ */
  save() {
    const d = this.data;
    if (!d.photos.length) return this._tip('请至少添加 1 张照片');
    if (!d.phrases.length) return this._tip('请至少选一句标签作说明');

    const user = store.getUser();
    const existing = d.isEdit ? store.getCardById(d.cardId) : null;

    let card;
    if (existing) {
      const oldPhotos = (existing.photos || []).slice();
      card = Object.assign({}, existing, {
        ratio: d.ratio,
        style: d.style,
        customBg: d.customBg || null,
        photos: d.photos.slice(),
        phrases: d.phrases.slice(),
        timeText: d.timeText.trim(),
        locText: d.locText.trim(),
        reservedText: d.reservedText,
        ownerName: existing.ownerName || user.nickname,
        ownerAvatar: existing.ownerAvatar || user.avatar,
        ownerAvatarColor: existing.ownerAvatarColor || user.avatarColor
      });
      const removed = oldPhotos.filter(p => d.photos.indexOf(p) < 0);
      if (removed.length) store.removeImages(removed);
    } else {
      card = {
        id: util.genId('card'),
        ownerId: user.uid,
        ownerName: user.nickname,
        ownerAvatar: user.avatar || '',
        ownerAvatarColor: user.avatarColor || '#8ac6a0',
        createdAt: Date.now(),
        ratio: d.ratio,
        style: d.style,
        customBg: d.customBg || null,
        photos: d.photos.slice(),
        phrases: d.phrases.slice(),
        timeText: d.timeText.trim(),
        locText: d.locText.trim(),
        reservedText: d.reservedText,
        messages: []
      };
    }

    store.upsertCard(card);
    this._saved = true;
    if (this._pendingDelete && this._pendingDelete.length) {
      const removed = this._pendingDelete.filter(p => d.photos.indexOf(p) < 0 && card.photos.indexOf(p) < 0);
      if (removed.length) store.removeImages(removed);
    }
    this._pendingDelete = [];

    wx.showToast({ title: d.isEdit ? '已保存修改' : '制作完成', icon: 'success' });
    setTimeout(() => {
      if (d.isEdit) wx.navigateBack();
      else wx.redirectTo({ url: '/pages/detail/detail?cardId=' + card.id });
    }, 500);
  },

  _tip(msg) {
    wx.showToast({ title: msg, icon: 'none' });
  }
});
