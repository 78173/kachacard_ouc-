/**
 * 本地数据服务层。
 *
 * 测试号（无域名/无后端）场景下，所有数据存于本地存储 + 用户目录图片。
 * 数据结构按“多用户”预留：卡片带 ownerId，收藏按 uid 隔离，
 * “账号”可在个人页新建/删除/来回切换（本地游客账号体系）。
 * 接入微信云开发时，仅需把本文件各函数的实现替换为云数据库调用即可。
 */

const util = require('./util');
// 不用解构写法：部分版本的开发者工具在转 ES5 时会为解构生成运行时辅助模块，
// 而它的运行时里未必打包了这些模块，会出现 “module '@swc/runtime/...' is not defined”。
const presetsData = require('../data/presets');
const PRESET_PHRASES = presetsData.PRESET_PHRASES;

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
  migrateData(u);
  return u;
}

/* ================= 旧存档兼容：把早期结构补齐 =================
 * 早期版本的卡片/账号可能缺少后来才加的字段（ownerId、ratio、phrases、
 * messages[].replies、stickers、mood…），缺字段会让卡片在某些页面里
 * 匹配不上或渲染不出来。这里统一补全一次，让老存档在新版本里照常打开。
 */

function normalizeAccount(a) {
  if (!a || !a.uid) return null;
  return {
    uid: a.uid,
    nickname: a.nickname || ('朋友 ' + String(a.uid).slice(0, 4).toUpperCase()),
    avatar: a.avatar || '',
    avatarColor: a.avatarColor || DEFAULT_AVATAR_COLORS[0],
    createdAt: a.createdAt || Date.now()
  };
}

function normalizeCard(c, fallbackOwnerId, knownUids) {
  if (!c || typeof c !== 'object') return null;
  const out = Object.assign({}, c);
  out.id = c.id || util.genId('card');
  // 没有归属、或归属账号已不在本地账号列表里的老卡片，认领给当前账号；
  // 否则它既不会出现在「我制作的」里，作者本人也编辑/删除不了。
  const own = c.ownerId;
  out.ownerId = (own && (!knownUids || knownUids[own])) ? own : (fallbackOwnerId || own || '');
  out.ownerName = c.ownerName || '';
  out.createdAt = c.createdAt || Date.now();
  out.photos = Array.isArray(c.photos) ? c.photos.filter(Boolean) : [];
  out.phrases = Array.isArray(c.phrases) ? c.phrases.filter(p => p && (p.text || p.emoji)) : [];
  out.messages = Array.isArray(c.messages) ? c.messages.map(m => Object.assign({}, m, {
    replies: Array.isArray(m && m.replies) ? m.replies : []
  })) : [];
  out.stickers = Array.isArray(c.stickers) ? c.stickers.filter(s => s && s.emoji) : [];
  out.mood = c.mood || '';
  out.customBg = c.customBg || null;
  out.timeText = c.timeText || '';
  out.locText = c.locText || '';
  out.reservedText = c.reservedText || '';
  return out;
}

let _migrated = false;
function migrateData(activeUser) {
  if (_migrated) return;
  _migrated = true;
  try {
    const uid = (activeUser && activeUser.uid) || '';

    // 1) 账号：补字段、去重、确保当前账号在列表里
    const rawAccounts = read(KEYS.accounts, []);
    const accounts = [];
    const seen = {};
    (Array.isArray(rawAccounts) ? rawAccounts : []).forEach((a) => {
      const n = normalizeAccount(a);
      if (!n || seen[n.uid]) return;
      seen[n.uid] = true;
      accounts.push(n);
    });
    if (uid && !seen[uid]) {
      const me = read(KEYS.user, null);
      const n = normalizeAccount(me) || normalizeAccount(Object.assign({ uid }, activeUser));
      if (n) { accounts.unshift(n); seen[n.uid] = true; }
    }
    if (JSON.stringify(accounts) !== JSON.stringify(rawAccounts)) write(KEYS.accounts, accounts);

    // 2) 卡片：补字段；没有归属或归属已不存在的卡片，认领给当前账号
    const rawCards = read(KEYS.cards, []);
    if (Array.isArray(rawCards) && rawCards.length) {
      const cards = rawCards.map(c => normalizeCard(c, uid, seen)).filter(Boolean);
      if (JSON.stringify(cards) !== JSON.stringify(rawCards)) write(KEYS.cards, cards);
    }

    // 3) 收藏表：确保是 { uid: [cardId] } 的形状
    const rawFavs = read(KEYS.favs, {});
    if (!rawFavs || typeof rawFavs !== 'object' || Array.isArray(rawFavs)) {
      write(KEYS.favs, {});
    } else {
      const favs = {};
      let dirty = false;
      Object.keys(rawFavs).forEach((k) => {
        if (Array.isArray(rawFavs[k])) favs[k] = rawFavs[k].filter(Boolean);
        else { favs[k] = []; dirty = true; }
      });
      if (dirty) write(KEYS.favs, favs);
    }
  } catch (e) {
    console.error('[咔嚓卡片] 旧数据迁移失败（已跳过，不影响使用）：', e);
  }
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

/** 向卡片追加一条留言；留言他人卡片时通知作者 */
function addMessage(cardId, msg) {
  const list = read(KEYS.cards, []);
  const card = list.find(c => c.id === cardId);
  if (!card) return null;
  card.messages = card.messages || [];
  card.messages.push(msg);
  write(KEYS.cards, list);

  if (card.ownerId && card.ownerId !== msg.uid) {
    addNotify(card.ownerId, {
      type: 'msg',
      cardId,
      cardLabel: (card.phrases && card.phrases[0] && card.phrases[0].text) || '卡片',
      fromUid: msg.uid,
      fromName: msg.name,
      content: msg.content
    });
  }
  return card;
}

/* ================= 收藏 ================= */

function getFavIds(uid) {
  const favs = read(KEYS.favs, {});
  return (favs[uid] || []).slice();
}

function nameOf(uid) {
  const active = read(KEYS.user, null);
  if (active && active.uid === uid) return active.nickname || '朋友';
  const acc = getUserById(uid);
  return (acc && acc.nickname) || '有人';
}

/** 切换收藏，返回 { liked, favIds }；收藏他人卡片时通知作者 */
function toggleFav(uid, cardId) {
  const favs = read(KEYS.favs, {});
  let arr = favs[uid] || [];
  const liked = arr.indexOf(cardId) >= 0;
  if (liked) arr = arr.filter(id => id !== cardId);
  else arr.unshift(cardId);
  favs[uid] = arr;
  write(KEYS.favs, favs);

  if (!liked) {
    const card = getCardById(cardId);
    if (card && card.ownerId && card.ownerId !== uid) {
      addNotify(card.ownerId, {
        type: 'fav',
        cardId,
        cardLabel: (card.phrases && card.phrases[0] && card.phrases[0].text) || '卡片',
        fromUid: uid,
        fromName: nameOf(uid)
      });
    }
  }
  return { liked: !liked, favIds: arr.slice() };
}

/* ================= 统计 ================= */

/* ================= 他人主页 / 互动反馈 ================= */

/** 按 uid 取账号资料（用于他人主页） */
function getUserById(uid) {
  const list = read(KEYS.accounts, []);
  return list.find(a => a.uid === uid) || null;
}

/** 某个账号制作的卡片 */
function getCardsByOwner(uid) {
  return getCards().filter(c => c.ownerId === uid);
}

/** 一张卡被多少人收藏 */
function favCount(cardId) {
  const favs = read(KEYS.favs, {});
  return Object.keys(favs).filter(k => (favs[k] || []).indexOf(cardId) >= 0).length;
}

function notifyKey(uid) { return 'kk_notify_' + uid; }

/** 给某账号追加一条互动反馈 */
function addNotify(toUid, payload) {
  if (!toUid) return;
  const list = read(notifyKey(toUid), []);
  list.unshift(Object.assign({
    id: util.genId('nt'),
    at: Date.now(),
    read: false
  }, payload));
  write(notifyKey(toUid), list.slice(0, 200));
}

function getNotifies(uid) { return read(notifyKey(uid), []); }

function unreadNotifyCount(uid) {
  return getNotifies(uid).filter(n => !n.read).length;
}

function markNotifiesRead(uid) {
  const list = getNotifies(uid).map(n => Object.assign({}, n, { read: true }));
  write(notifyKey(uid), list);
}

/** 回复某条留言（一级评论下的回复） */
function addReply(cardId, msgId, reply) {
  const list = read(KEYS.cards, []);
  const card = list.find(c => c.id === cardId);
  if (!card) return null;
  const msg = (card.messages || []).find(m => m.id === msgId);
  if (!msg) return null;
  msg.replies = msg.replies || [];
  msg.replies.push(reply);
  write(KEYS.cards, list);

  const label = (card.phrases && card.phrases[0] && card.phrases[0].text) || '你的卡片';
  // 通知卡片作者
  if (card.ownerId && card.ownerId !== reply.uid) {
    addNotify(card.ownerId, {
      type: 'reply', cardId, cardLabel: label,
      fromUid: reply.uid, fromName: reply.name,
      content: reply.content, toName: reply.replyToName || ''
    });
  }
  // 通知被回复的留言作者
  if (msg.uid && msg.uid !== reply.uid && msg.uid !== card.ownerId) {
    addNotify(msg.uid, {
      type: 'reply', cardId, cardLabel: label,
      fromUid: reply.uid, fromName: reply.name,
      content: reply.content, toName: reply.replyToName || msg.name
    });
  }
  return card;
}

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
  getCardsByOwner,
  getUserById,
  upsertCard,
  removeCard,
  addMessage,
  addReply,
  favCount,
  getNotifies,
  unreadNotifyCount,
  markNotifiesRead,
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
