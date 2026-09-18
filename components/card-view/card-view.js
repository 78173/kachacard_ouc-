const presets = require('../../data/presets');

/**
 * 模板化卡片渲染组件。
 *
 * 属性：
 *  card     {Object} 卡片数据
 *           ratio：版式 id（r-* 类，控制照片比例）
 *           style：背景风格 id（s-* 类，控制配色/边框/装饰）
 *           template：旧字段，无 ratio/style 时用于兼容映射
 *  mode     {String} 'full' | 'poster'
 *  autoplay {Boolean} 多图时是否自动轮播
 *
 * 事件：cardtap
 */
Component({
  properties: {
    card: { type: Object, value: null },
    mode: { type: String, value: 'full' },
    autoplay: { type: Boolean, value: false },
    posterLimit: { type: Number, value: 3 }, // 海报模式下最多显示的标签数（含主标签）
    stickerEdit: { type: Boolean, value: false } // 制作页开启后可拖动贴纸
  },

  data: {
    current: 0,
    view: null,
    bgStyle: '',       // 自定义背景的内联样式
    hasScrim: false,   // 是否需要遮罩保证文字可读
    scrimDark: false,
    lines: [],         // 预计算后要展示的标签行（避免在 WXML 里写逻辑）
    shots: [],         // 预计算后的照片列表（同上）
    stickers: [],      // 贴纸（含算好的定位样式）
    mood: null,        // 心情色徽章
    skDragCur: -1      // 正在拖动的贴纸下标
  },

  observers: {
    'card, mode, posterLimit': function () {
      this._syncCard();
    }
  },

  lifetimes: {
    attached() { this._syncCard(); },
    detached() { clearInterval(this._timer); }
  },

  methods: {
    _syncCard() {
      const c = this.properties.card;
      if (!c) return;
      const ratioOk = (presets.RATIOS || []).some(r => r.id === c.ratio);
      const ratio = ratioOk ? c.ratio
        : (presets.LEGACY_RATIO[c.style] || presets.LEGACY_RATIO[c.template] || 'sq');

      const styleMap = { classic: 'light' };
      const styleRaw = c.style || c.template || 'light';
      const style = (presets.STYLES || []).some(s => s.id === styleRaw)
        ? styleRaw
        : (styleMap[styleRaw] || 'light');

      // 自定义底色 / 背景图
      let bgStyle = '';
      let hasScrim = false;
      let scrimDark = false;
      const bg = c.customBg;
      if (bg && bg.v) {
        if (bg.img) {
          bgStyle = 'background:url("' + bg.v + '") center/cover no-repeat;';
          hasScrim = true;
        } else {
          bgStyle = 'background:' + bg.v + ';';
          hasScrim = true;
          const hex = /^#([0-9a-fA-F]{6})$/.exec((bg.v || '').trim());
          if (hex) {
            const n = parseInt(hex[1], 16);
            const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
            if (r + g + b < 330) scrimDark = true;
          }
        }
        // 深色风格默认给深色遮罩
        if (['film', 'dark', 'vivid'].indexOf(style) >= 0) scrimDark = true;
      }

      // 标签展示策略在 JS 里算好：full 模式全显示，poster 模式只留前 posterLimit 条。
      // （WXML 里不允许 wx:for 与 wx:if 写在同一节点，所以不把判断放到视图层）
      const all = (c.phrases || []).filter(p => p && (p.text || p.emoji));
      const limit = this.properties.mode === 'full' ? all.length : Math.max(1, this.properties.posterLimit || 3);
      const lines = all.slice(0, limit).map((p, i) => ({
        id: p.id || ('p' + i),
        emoji: p.emoji || '',
        text: p.text || '',
        main: i === 0
      }));

      const shots = (c.photos || []).filter(Boolean);

      // 贴纸：x/y 为相对照片区的百分比，旋转角固定由 id 派生（同一张贴纸始终同一个角度）
      const stickers = (c.stickers || []).filter(s => s && s.emoji).map((s, i) => ({
        id: s.id || ('sk' + i),
        emoji: s.emoji,
        x: typeof s.x === 'number' ? s.x : 50,
        y: typeof s.y === 'number' ? s.y : 50,
        size: s.size || 54,
        rot: typeof s.rot === 'number' ? s.rot : (i % 2 ? 8 : -8),
        style: 'left:' + (typeof s.x === 'number' ? s.x : 50) + '%;' +
               'top:' + (typeof s.y === 'number' ? s.y : 50) + '%;' +
               'font-size:' + (s.size || 54) + 'rpx;' +
               'transform:translate(-50%,-50%) rotate(' + (typeof s.rot === 'number' ? s.rot : (i % 2 ? 8 : -8)) + 'deg);'
      }));

      // 心情色徽章
      const moods = presets.MOODS || [];
      const moodDef = moods.filter(m => m.id === c.mood)[0] || null;
      const mood = moodDef
        ? { id: moodDef.id, emoji: moodDef.emoji, text: moodDef.text, color: moodDef.color, style: 'background:' + moodDef.color + ';' }
        : null;

      this.setData({
        view: { ratio, style },
        bgStyle,
        hasScrim,
        scrimDark,
        lines,
        shots,
        stickers,
        mood
      });
      if (this.data.current !== 0) this.setData({ current: 0 });
    },

    onSwiperChange(e) {
      this.setData({ current: e.detail.current });
    },

    /** 手指按下 swiper：通知页面“用户接管”，可据此暂停自动播放 */
    onSwiperTouch() {
      this.triggerEvent('swipertouch');
    },

    onTapCard() {
      this.triggerEvent('cardtap', { card: this.properties.card });
    },

    /* ---------- 贴纸拖动（仅制作页开启 stickerEdit 时生效） ---------- */
    _measureShot(cb) {
      wx.createSelectorQuery().in(this).select('.shot').boundingClientRect().exec((r) => {
        const rect = (r && r[0]) || null;
        if (rect && rect.width) this._shotRect = rect;
        if (cb) cb(this._shotRect);
      });
    },

    onStickerStart(e) {
      if (!this.properties.stickerEdit) return;
      const i = Number(e.currentTarget.dataset.i);
      const t = e.touches && e.touches[0];
      this._skIdx = i;
      this._skMoved = false;
      this._skFrom = t ? { x: t.clientX, y: t.clientY } : { x: 0, y: 0 };
      const list = this.data.stickers || [];
      const cur = list[i];
      if (!cur) return;
      this._skPos = { x: cur.x, y: cur.y };
      this._measureShot();
      this.setData({ skDragCur: i });
    },

    onStickerMove(e) {
      if (!this.properties.stickerEdit || this._skIdx == null || this._skIdx < 0) return;
      const t = e.touches && e.touches[0];
      const rect = this._shotRect;
      if (!t || !rect || !rect.width) return;
      this._skMoved = true;
      const x = Math.max(4, Math.min(96, ((t.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(4, Math.min(96, ((t.clientY - rect.top) / rect.height) * 100));
      const list = (this.data.stickers || []).slice();
      const cur = list[this._skIdx];
      if (!cur) return;
      cur.x = Math.round(x);
      cur.y = Math.round(y);
      cur.style = 'left:' + cur.x + '%;top:' + cur.y + '%;font-size:' + cur.size + 'rpx;' +
        'transform:translate(-50%,-50%) rotate(' + cur.rot + 'deg);';
      this._skPos = { x: cur.x, y: cur.y };
      this.setData({ stickers: list });
    },

    onStickerEnd() {
      if (this._skIdx == null || this._skIdx < 0) return;
      const i = this._skIdx;
      const moved = this._skMoved;
      this._skIdx = -1;
      this.setData({ skDragCur: -1 });
      if (moved && this._skPos) {
        this.triggerEvent('stickerchange', { index: i, x: this._skPos.x, y: this._skPos.y });
      }
    },

    /** 长按贴纸：交给页面决定是否删除 */
    onStickerLongPress(e) {
      if (!this.properties.stickerEdit) return;
      const i = Number(e.currentTarget.dataset.i);
      this.triggerEvent('stickerremove', { index: i });
    }
  }
});
