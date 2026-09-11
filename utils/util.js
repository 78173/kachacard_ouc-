/** 通用工具函数 */

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 生成唯一 id */
function genId(prefix) {
  const p = prefix || 'id';
  return p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** 生成短 uid（可读性好一点） */
function genUid() {
  let s = '';
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (let i = 0; i < 8; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/** ts -> 'YYYY-MM-DD HH:mm' */
function formatDateTime(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** ts -> 当月天日期 'YYYY.MM.DD' */
function formatDay(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 距今天的天数（0=今天 1=昨天 …） */
function dayGap(ts) {
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  return Math.round((today - day) / 86400000);
}

/** 友好时间：今天 / 昨天 / M月D日 */
function friendlyDate(ts) {
  const gap = dayGap(ts);
  const d = new Date(ts);
  if (gap === 0) return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (gap === 1) return '昨天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

/** 时间分类桶 */
function timeBucket(ts) {
  const gap = dayGap(ts);
  if (gap === 0) return 'today';
  if (gap >= 1 && gap <= 6) return 'week';
  return 'earlier';
}

function bucketLabel(bucket) {
  return { today: '今天', week: '近 7 天', earlier: '更早之前' }[bucket] || bucket;
}

function clone(obj) {
  if (obj == null) return obj;
  return JSON.parse(JSON.stringify(obj));
}

/** 只取前 n 个字符 */
function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

module.exports = {
  pad,
  genId,
  genUid,
  formatDateTime,
  formatDay,
  dayGap,
  friendlyDate,
  timeBucket,
  bucketLabel,
  clone,
  truncate
};
