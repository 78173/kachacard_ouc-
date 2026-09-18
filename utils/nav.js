/**
 * 统一的页面跳转。
 *
 * 微信的页面栈最多 10 层，`wx.navigateTo` 超限后会**静默失败**——
 * 表现就是“点了按钮没反应 / 页面打不开”，而且因为 switchTab 会清空页面栈，
 * 很容易变成“首页总是好的、别的地方时好时坏”，非常难查。
 * 这里在超限时自动改用 redirectTo（替换当前页）把目标页面打开，
 * 用户永远能到达目的地，只是返回时的路径短一点。
 */

function go(url) {
  wx.navigateTo({
    url,
    fail: () => {
      wx.redirectTo({
        url,
        fail: () => {
          // 目标本身是 tab 页时 redirectTo 也不允许，兜底回首页
          wx.switchTab({ url: '/pages/index/index', fail: () => {} });
        }
      });
    }
  });
}

module.exports = { go };
