const nav = require('../utils/nav');
/**
 * 自定义底部导航（经典三格：首页 | 中央“做卡片” | 我的）
 * - 左右两格为 tab 页（switchTab）
 * - 中央按钮打开“制作卡片”全屏页（navigateTo）
 * 由 tab 页在 onShow 里通过 getTabBar().setData({ selected }) 同步高亮。
 */
Component({
  data: {
    selected: 0,
    dark: false,
    hidden: false
  },

  methods: {
    onSwitch(e) {
      const path = e.currentTarget.dataset.path;
      const index = e.currentTarget.dataset.index;
      if (index === this.data.selected) return;
      wx.switchTab({ url: path });
    },
    onMakeCard() {
      nav.go('/pages/create/create');
    }
  }
});
