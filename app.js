const store = require('./utils/store');

App({
  globalData: {
    user: null
  },

  onLaunch() {
    // 测试号无后端，首次启动时在本地初始化一个身份 uid 用于区分“用户”；
    // 接入云开发后，可把 utils/store.js 替换成基于 openid 的数据源，前端逻辑无需改动。
    this.globalData.user = store.ensureUser();
  }
});
