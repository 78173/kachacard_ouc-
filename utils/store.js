/**
 * 本地数据服务层。
 *
 * 测试号（无域名/无后端）场景下，所有数据存于本地存储 + 用户目录图片。
 * 数据结构按“多用户”预留：卡片带 ownerId，收藏按 uid 隔离，
 * “账号”可在个人页新建/删除/来回切换（本地游客账号体系）。
 * 接入微信云开发时，仅需把本文件各函数的实现替换为云数据库调用即可。
 */

const util = require('./util');
const { PRESET_PHRASES } = require('../data/presets');

const KEYS = {
  user: 'kk_user',           // 当前激活账号
  accounts: 'kk_accounts',   // 本地账号列表 [{uid,nickname,avatar,avatarColor,createdAt}]
  cards: 'kk_cards',         // 卡片数组
  favs: 'kk_favs',           // { [uid]: [cardId, ...] }
  theme: 'kk_theme'          // 'light' | 'dark'
  // 快捷语词库按账号隔离，键名带 uid（见下方短语函数）
};
// 兼容早期版本的旧键名（一次导入迁移）
const LEGACY_PHRASE_KEY = 'kk_custom_phrases';
const LEGACY_HIDDEN_KEY = 'kk_hidden_phrase_ids';

const DEFAULT_AVATAR_COLORS = ['#f2a65a', '#5aa9e6', '#8ac6a0', '#e58fb1', '#a08ad6', '#7fbf7f'];

function read(key, dflt) {
  try {
    const v = wx.getStorageSync(key);
    return v === '' || v === undefined || v === null ? dflt : v;
  } catch (e) {
    return dflt;
  }
}
function write(key, val) {
  try { wx.setStorageSync(key, val); } catch (e) { /* 容量超限时忽略 */ }
}

/* ================= 账号 ================= */

function defaultUser() {
  const uid = util.genUid();
  return {
    uid,
    nickname: '朋友 ' + uid.slice(0, 4).toUpperCase(),
    avatar: '',               // 图片路径（空则用文字头像）
    avatarColor: DEFAULT_AVATAR_COLORS[Math.floor(Math.random() * DEFAULT_AVATAR_COLORS.length)],
    createdAt: Date.now()
  };
}

function syncGlobal(user) {
  const app = getApp && getApp();
  if (app && app.globalData) app.globalData.user = user;
  return user;
}

function ensureInAccounts(u) {
  const list = read(KEYS.accounts, []);
  if (!list.some(a => a.uid === u.uid)) {
    list.unshift(JSON.parse(JSON.stringify(u)));
    write(KEYS.accounts, list);
  }
}

/** 首次启动 / 读取当前激活账号，若缺失则创建并登记到账号列表 */
function ensureUser() {
  let u = read(KEYS.user, null);
  if (!u || !u.uid) {
    u = defaultUser();
    write(KEYS.user, u);
  }
  ensureInAccounts(u);
  return u;
}

function getUser() {
  return ensureUser();
}

/** 修改当前账号资料（同步到账号列表） */
function updateProfile(patch) {
  const active = getUser();
  const next = Object.assign({}, active, patch);
  write(KEYS.user, next);
  const list = read(KEYS.accounts, []);
  const i = list.findIndex(a => a.uid === active.uid);
  if (i >= 0) list[i] = JSON.parse(JSON.stringify(next));
  write(KEYS.accounts, list);
  return syncGlobal(next);
}

function getAccounts() {
  ensureUser();
  return read(KEYS.accounts, []);
}

/** 切换激活账号，返回切换后的账号 */
function switchAccount(uid) {
  const list = getAccounts();
  const acc = list.find(a => a.uid === uid);
  if (!acc) return null;
  write(KEYS.user, JSON.parse(JSON.stringify(acc)));
  return syncGlobal(acc);
}

/** 新建账号并切换过去，nickname 可指定 */
function createAccount(nickname) {
  const u = defaultUser();
  if (nickname) u.nickname = nickname.trim().slice(0, 20) || u.nickname;
  const list = getAccounts();
  list.unshift(JSON.parse(JSON.stringify(u)));
  write(KEYS.accounts, list);
  write(KEYS.user, JSON.parse(JSON.stringify(u)));
  return syncGlobal(u);
}

/**
 * 删除账号。
 * - 不允许删除最后一个账号（否则本地将无任何身份）
 * - 删除的是当前激活账号时，自动切换到列表里第一个账号
 * 返回 { ok, active }，ok=false 表示拒绝删除。
 */
function removeAccount(uid) {
  const list = getAccounts();
  if (list.length <= 1) return { ok: false, active: getUser() };
  const next = list.filter(a => a.uid !== uid);
  write(KEYS.accounts, next);
  if (uid === getUser().uid) {
    const fallback = next[0];
    write(KEYS.user, JSON.parse(JSON.stringify(fallback)));
    return { ok: true, active: syncGlobal(fallback) };
  }
  return { ok: true, active: getUser() };
}

/* ================= 快捷语库（按账号隔离） ================= */

function phraseCustomKey(uid) { return 'kk_custom_' + uid; }
function phraseHiddenKey(uid) { return 'kk_hidden_' + uid; }
function madeOrderKey(uid) { return 'kk_made_order_' + uid; }
function currentUid() {
  return ensureUser().uid;
}

/** 首次为新账号迁移一次早期版本的全局词库（可选） */
function migrateLegacyPhrases(uid) {
  const legacy = wx.getStorageSync(LEGACY_PHRASE_KEY);
  const legacyHidden = wx.getStorageSync(LEGACY_HIDDEN_KEY);
  if ((legacy && legacy.length) || (legacyHidden && legacyHidden.length)) {
    if (legacy && legacy.length && !read(phraseCustomKey(uid), null)) {
      write(phraseCustomKey(uid), legacy);
    }
    if (legacyHidden && legacyHidden.length && !read(phraseHiddenKey(uid), null)) {
      write(phraseHiddenKey(uid), legacyHidden);
    }
    wx.removeStorageSync(LEGACY_PHRASE_KEY);
    wx.removeStorageSync(LEGACY_HIDDEN_KEY);
  }
}

/** 读取某账号（默认当前账号）的快捷语库 */
function getPhraseLibrary(uid) {
  const u = uid || currentUid();
  migrateLegacyPhrases(u);
  const hidden = new Set(read(phraseHiddenKey(u), []));
  const custom = read(phraseCustomKey(u), []);
  return PRESET_PHRASES.filter(p => !hidden.has(p.id)).concat(custom);
}

function isPresetId(id) {
  return PRESET_PHRASES.some(p => p.id === id);
}

function addCustomPhrase(text, emoji, uid) {
  const u = uid || currentUid();
  const custom = read(phraseCustomKey(u), []);
  const p = { id: util.genId('ph'), emoji: emoji || '', text: text };
  custom.unshift(p);
  write(phraseCustomKey(u), custom);
  return p;
}

/**
 * 修改标签（作用于指定账号，默认当前账号）。
 * 自建词直接改文本；内置词则“隐藏原词 + 以新文本新增一条自建词”。
 * 已制作卡片上的文字为快照，不受影响。
 */
function updatePhrase(id, text, emoji, uid) {
  const u = uid || currentUid();
  const nextText = (text || '').trim();
  if (!nextText) return null;
  if (isPresetId(id)) {
    const hidden = read(phraseHiddenKey(u), []);
    if (hidden.indexOf(id) < 0) hidden.push(id);
    write(phraseHiddenKey(u), hidden);
    return addCustomPhrase(nextText, emoji || '', u);
  }
  const custom = read(phraseCustomKey(u), []);
  const i = custom.findIndex(p => p.id === id);
  if (i < 0) return null;
  custom[i] = Object.assign({}, custom[i], { text: nextText, emoji: emoji || custom[i].emoji || '' });
  write(phraseCustomKey(u), custom);
  return custom[i];
}

/**
 * 删除（隐藏）快捷语（作用于指定账号，默认当前账号）：
 * 内置词进入该账号隐藏名单，自建词从该账号列表移除。
 * 已制作卡片上的文字为快照，不受影响。
 */
function removePhrase(id, uid) {
  const u = uid || currentUid();
  if (isPresetId(id)) {
    const hidden = read(phraseHiddenKey(u), []);
    if (hidden.indexOf(id) < 0) hidden.push(id);
    write(phraseHiddenKey(u), hidden);
  } else {
    const custom = read(phraseCustomKey(u), []);
    write(phraseCustomKey(u), custom.filter(p => p.id !== id));
  }
}

/* ================= 图片持久化 ================= */

function photoDir() {
  return wx.env.USER_DATA_PATH + '/kk_photos';
}
function ensureDir(p) {
  try {
    const fs = wx.getFileSystemManager();
    fs.accessSync(p);
  } catch (e) {
    try { wx.getFileSystemManager().mkdirSync(p, true); } catch (e2) { /* ignore */ }
  }
}

/** 把相册临时文件拷贝进用户数据目录，防止临时目录被回收 */
function persistImage(tempPath) {
  ensureDir(photoDir());
  const fs = wx.getFileSystemManager();
  const extMatch = /\.(\w+)$/.exec(tempPath);
  const ext = extMatch && ['jpg', 'jpeg', 'png', 'webp', 'gif'].indexOf(extMatch[1].toLowerCase()) >= 0
    ? '.' + extMatch[1].toLowerCase()
    : '.jpg';
  const dst = photoDir() + '/p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext;
  try {
    fs.copyFileSync(tempPath, dst);
    return dst;
  } catch (e) {
    return tempPath; // 拷贝失败则退回使用原临时路径（仅本次会话内有效）
  }
}

function removeImages(paths) {
  const fs = wx.getFileSystemManager();
  (paths || []).forEach(p => {
    if (!p || p.indexOf(wx.env.USER_DATA_PATH) !== 0) return; // 只清理自己管理的文件
    try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
  });
}

/* ================= 卡片 ================= */

function getCards() {
  const list = read(KEYS.cards, []);
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function getCardById(id) {
  return read(KEYS.cards, []).find(c => c.id === id) || null;
}

function upsertCard(card) {
  const list = read(KEYS.cards, []);
  const idx = list.findIndex(c => c.id === card.id);
  if (idx >= 0) list[idx] = card; else list.unshift(card);
  write(KEYS.cards, list);
  return card;
}

/** 删除卡片：返回被删卡片（含照片文件），由调用方决定是否物理清理 */
function removeCard(id) {
  const list = read(KEYS.cards, []);
  const idx = list.findIndex(c => c.id === id);
  if (idx < 0) return null;
  const removed = list.splice(idx, 1)[0];
  write(KEYS.cards, list);
  const favs = read(KEYS.favs, {});
  Object.keys(favs).forEach(k => {
    favs[k] = (favs[k] || []).filter(cid => cid !== id);
  });
  write(KEYS.favs, favs);
  return removed;
}

/** 向卡片追加一条留言 */
function addMessage(cardId, msg) {
  const list = read(KEYS.cards, []);
  const card = list.find(c => c.id === cardId);
  if (!card) return null;
  card.messages = card.messages || [];
  card.messages.push(msg);
  write(KEYS.cards, list);
  return card;
}

/* ================= 收藏 ================= */

function getFavIds(uid) {
  const favs = read(KEYS.favs, {});
  return (favs[uid] || []).slice();
}

/** 切换收藏，返回 { liked, favIds } */
function toggleFav(uid, cardId) {
  const favs = read(KEYS.favs, {});
  let arr = favs[uid] || [];
  const liked = arr.indexOf(cardId) >= 0;
  if (liked) arr = arr.filter(id => id !== cardId);
  else arr.unshift(cardId);
  favs[uid] = arr;
  write(KEYS.favs, favs);
  return { liked: !liked, favIds: arr.slice() };
}

/* ================= 统计 ================= */

function statsFor(uid) {
  const cards = getCards();
  const mine = cards.filter(c => c.ownerId === uid);
  const favIds = getFavIds(uid);
  const favCards = favIds.map(id => getCardById(id)).filter(Boolean);
  return { made: mine.length, fav: favCards.length };
}

/* ================= 主题 ================= */

function getTheme() {
  return read(KEYS.theme, 'light') === 'dark' ? 'dark' : 'light';
}

function setTheme(mode) {
  write(KEYS.theme, mode === 'dark' ? 'dark' : 'light');
  return mode === 'dark' ? 'dark' : 'light';
}

/** 应用主题到系统级 UI（导航栏、下拉背景等），返回是否暗色 */
function applyThemeUI(mode) {
  const dark = mode === 'dark';
  try {
    wx.setNavigationBarColor({
      frontColor: dark ? '#ffffff' : '#000000',
      backgroundColor: dark ? '#101a2c' : '#ffffff',
      animation: { duration: 200 }
    });
  } catch (e) { /* ignore */ }
  try {
    wx.setBackgroundColor({ backgroundColor: dark ? '#0b1220' : '#f3f6f9' });
  } catch (e) { /* ignore */ }
  try {
    wx.setBackgroundTextStyle({ textStyle: dark ? 'light' : 'dark' });
  } catch (e) { /* ignore */ }
  return dark;
}

function getMadeOrder(uid) { return read(madeOrderKey(uid), []); }

function setMadeOrder(uid, ids) { write(madeOrderKey(uid), ids.slice()); }

/** 收藏顺序随 favs[uid] 数组持久化 */
function getFavOrder(uid) {
  const favs = read(KEYS.favs, {});
  return (favs[uid] || []).slice();
}

function setFavOrder(uid, ids) {
  const favs = read(KEYS.favs, {});
  favs[uid] = ids.slice();
  write(KEYS.favs, favs);
}

/** 收藏拼图墙：每张卡的尺寸记忆（half | wide） */
function favSizeKey(uid) { return 'kk_fav_size_' + uid; }

function getFavSizes(uid) { return read(favSizeKey(uid), {}) || {}; }

function setFavSizes(uid, map) { write(favSizeKey(uid), map || {}); }

module.exports = {
  ensureUser,
  getUser,
  updateProfile,
  getAccounts,
  switchAccount,
  createAccount,
  removeAccount,
  getPhraseLibrary,
  addCustomPhrase,
  updatePhrase,
  removePhrase,
  persistImage,
  removeImages,
  getCards,
  getCardById,
  upsertCard,
  removeCard,
  addMessage,
  getFavIds,
  toggleFav,
  statsFor,
  getMadeOrder,
  setMadeOrder,
  getFavOrder,
  setFavOrder,
  getFavSizes,
  setFavSizes,
  getTheme,
  setTheme,
  applyThemeUI
};
