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
    posterLimit: { type: Number, value: 3 } // 海报模式下最多显示的标签数（含主标签）
  },

  data: {
    current: 0,
    view: null,
    bgStyle: '',       // 自定义背景的内联样式
    hasScrim: false,   // 是否需要遮罩保证文字可读
    scrimDark: false
  },

  observers: {
    'card': function () {
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

      this.setData({ view: { ratio, style }, bgStyle, hasScrim, scrimDark });
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
    }
  }
});
