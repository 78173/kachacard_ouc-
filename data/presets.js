/**
 * 预设数据：内置快捷语 + 卡片“比例(版式)”与“背景风格”两个独立维度
 * 快捷语库内置 + 用户新增，并按账号隔离（见 utils/store.js）。
 */

const PRESET_PHRASES = [
  { id: 'p01', emoji: '🌈', text: '心情愉悦' },
  { id: 'p02', emoji: '✨', text: '今日份快乐' },
  { id: 'p03', emoji: '🚗', text: '在路上' },
  { id: 'p04', emoji: '🍜', text: '干饭时间' },
  { id: 'p05', emoji: '🌸', text: '春暖花开' },
  { id: 'p06', emoji: '☕', text: '慢生活' },
  { id: 'p07', emoji: '🎂', text: '生日快乐' },
  { id: 'p08', emoji: '💪', text: '加油鸭' },
  { id: 'p09', emoji: '🏔️', text: '去看世界' },
  { id: 'p10', emoji: '🐶', text: '毛茸茸' },
  { id: 'p11', emoji: '🎧', text: '单曲循环' },
  { id: 'p12', emoji: '🌙', text: '晚安好梦' }
];

/** 卡片版式（照片比例），可独立于背景风格选择 */
const RATIOS = [
  { id: 'sq',   name: '1:1 方形', pct: 100 },
  { id: 'p45',  name: '4:5 竖版', pct: 125 },
  { id: 'p34',  name: '3:4 竖版', pct: 133.3 },
  { id: 'l169', name: '16:9 横版', pct: 56.25 },
  { id: 'l43',  name: '4:3 横版', pct: 75 },
  { id: 'l32',  name: '3:2 横版', pct: 66.7 }
];

/** 卡片背景/艺术风格 */
const STYLES = [
  { id: 'light',    name: '极简白',   desc: '干净留白',   swatch: 'linear-gradient(150deg,#ffffff,#dfe8ef)' },
  { id: 'paper',    name: '雾蓝信纸', desc: '淡蓝信纸',   swatch: 'linear-gradient(150deg,#eaf3fb,#bcd7ec)' },
  { id: 'polaroid', name: '拍立得',   desc: '白相纸',     swatch: 'linear-gradient(150deg,#ffffff,#dfe9f2)' },
  { id: 'film',     name: '胶片',     desc: '深色胶片',   swatch: 'linear-gradient(150deg,#1f2937,#0b1120)' },
  { id: 'dark',     name: '深空',     desc: '深蓝青辉光', swatch: 'linear-gradient(150deg,#1e293b,#0f766e)' },
  { id: 'vivid',    name: '冷色撞色', desc: '青紫渐变',   swatch: 'linear-gradient(140deg,#22d3ee,#818cf8,#e879f9)' }
];

/** 旧版单维 template → 版式默认映射（用于旧卡片兼容） */
const LEGACY_RATIO = {
  classic: 'sq', light: 'sq', paper: 'p45', polaroid: 'p34',
  film: 'l169', dark: 'l43', vivid: 'l32'
};

/** 更多自定义底色/背景 预设（css 可为纯色或渐变） */
const BG_SWATCHES = [
  { css: '#f8fafc', name: '云白' },
  { css: '#e0f2fe', name: '天蓝' },
  { css: '#d3f5ef', name: '薄荷' },
  { css: '#e7e9ff', name: '淡紫' },
  { css: '#fff1f2', name: '薄粉' },
  { css: '#fef9c3', name: '奶油' },
  { css: 'linear-gradient(135deg,#f0f9ff,#dbeafe)', name: '晴空' },
  { css: 'linear-gradient(135deg,#ccfbf1,#bae6fd)', name: '海湾' },
  { css: 'linear-gradient(135deg,#e0e7ff,#f0f9ff)', name: '晨雾' },
  { css: 'linear-gradient(135deg,#fdf2f8,#e0e7ff)', name: '晚霞' }
];

/** 时间快捷填入 */
const TIME_PRESETS = [
  { label: '此刻', value: 'now' },
  { label: '昨天', value: 'yesterday' },
  { label: '清空', value: 'clear' }
];

/** 地点常用标签 */
const PLACE_PRESETS = ['家', '公司', '咖啡馆', '公园', '海边', '山顶', '校园', '车站'];

/** 默认留言引导 */
const DEFAULT_RESERVED = '嗨，看到这张卡片的人，写下你想对我说的话吧～';

/** 心情色：给卡片定一个情绪基调（显示为卡片上的小徽章） */
const MOODS = [
  { id: 'happy',  emoji: '😄', text: '开心',   color: '#fbbf24' },
  { id: 'calm',   emoji: '🌊', text: '平静',   color: '#38bdf8' },
  { id: 'miss',   emoji: '🌙', text: '想念',   color: '#818cf8' },
  { id: 'power',  emoji: '⚡', text: '元气',   color: '#f472b6' },
  { id: 'soft',   emoji: '🌸', text: '温柔',   color: '#f9a8d4' },
  { id: 'wish',   emoji: '✨', text: '期待',   color: '#2dd4bf' }
];

/** 贴纸调色板：贴在照片上的小装饰（可拖动、可删除） */
const STICKERS = ['🌸', '⭐', '☁️', '🍃', '💛', '🎀', '🐾', '☀️', '🌊', '🍓', '✈️', '🎵'];

module.exports = {
  PRESET_PHRASES,
  RATIOS,
  STYLES,
  LEGACY_RATIO,
  BG_SWATCHES,
  TIME_PRESETS,
  PLACE_PRESETS,
  DEFAULT_RESERVED,
  MOODS,
  STICKERS
};
