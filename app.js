const store = require('./utils/store');

App({
  globalData: {
    user: null
  },

  onLaunch() {
    // 测试号无后端，首次启动时在本地初始化一个身份 uid 用于区分“用户”；
    // 接入云开发后，可把 utils/store.js 替换成基于 openid 的数据源，前端逻辑无需改动。
    try {
      this.globalData.user = store.ensureUser();
    } catch (e) {
      // 初始化失败也要让页面能打开（各页面都有自己的兜底文案），并把原因打到控制台
      console.error('[咔嚓卡片] 账号初始化失败：', e);
    }
  },

  /** 兜底：未捕获的脚本错误统一打到控制台，方便定位“白屏” */
  onError(err) {
    console.error('[咔嚓卡片] 未捕获错误：', err);
  },

  /** 打开不存在的页面时回首页，而不是停在空白页 */
  onPageNotFound(res) {
    console.error('[咔嚓卡片] 页面不存在：', res && res.path);
    wx.switchTab({ url: '/pages/index/index', fail: () => {} });
  }
});
