/**
 * 卡片导出：用 Canvas 2D 把「照片 + 标签 + 时间地点」渲染成一张图片，
 * 用于保存到相册 / 作为图片分享给好友（无需后端）。
 */

const W = 750;          // 逻辑宽度
const PAD = 30;         // 内边距
const INFO_H = 210;     // 底部说明区高度

const MOODS = [
  { id: 'happy', emoji: '😄', text: '开心', color: '#fbbf24' },
  { id: 'calm', emoji: '🌊', text: '平静', color: '#38bdf8' },
  { id: 'miss', emoji: '🌙', text: '想念', color: '#818cf8' },
  { id: 'power', emoji: '⚡', text: '元气', color: '#f472b6' },
  { id: 'soft', emoji: '🌸', text: '温柔', color: '#f9a8d4' },
  { id: 'wish', emoji: '✨', text: '期待', color: '#2dd4bf' }
];

function isDarkStyle(style) {
  return ['film', 'dark'].indexOf(style) >= 0;
}

function pickBg(card) {
  const bg = card.customBg;
  if (bg && bg.v && !bg.img && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((bg.v || '').trim())) {
    return bg.v.trim();
  }
  const map = {
    light: '#ffffff', paper: '#eef6fc', polaroid: '#ffffff',
    film: '#141a26', dark: '#1b2938', vivid: '#e8f7fa'
  };
  return map[card.style || card.template || 'light'] || '#ffffff';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** 等比裁剪填充绘制 */
function drawCover(ctx, img, x, y, w, h, r) {
  const iw = img.width || w;
  const ih = img.height || h;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

/** 多张照片时：在照片区内按网格排布（全部照片都进图） */
function drawPhotoGrid(ctx, imgs, x, y, w, h) {
  const n = imgs.length;
  if (n <= 1) {
    drawCover(ctx, imgs[0], x, y, w, h, 20);
    return;
  }
  let cols;
  if (n === 2) cols = 2;
  else if (n === 3) cols = 3;
  else if (n === 4) cols = 2;
  else cols = 3;
  const gap = 8;
  const rows = Math.ceil(n / cols);
  const cw = (w - (cols - 1) * gap) / cols;
  const ch = (h - (rows - 1) * gap) / rows;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    drawCover(ctx, imgs[i], x + c * (cw + gap), y + r * (ch + gap), cw, ch, 12);
  }
}

/** 把照片区上的贴纸按相同百分比位置画进图里 */
function drawStickers(ctx, card, x, y, w, h) {
  const list = (card.stickers || []).filter(s => s && s.emoji);
  list.forEach((s, i) => {
    const px = x + (typeof s.x === 'number' ? s.x : 50) / 100 * w;
    const py = y + (typeof s.y === 'number' ? s.y : 50) / 100 * h;
    const size = s.size || 54;
    const rot = (typeof s.rot === 'number' ? s.rot : (i % 2 ? 8 : -8)) * Math.PI / 180;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = size + 'px sans-serif';
    ctx.shadowColor = 'rgba(15,23,42,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillText(s.emoji, 0, 0);
    ctx.restore();
  });
}

/** 左上角的心情色徽章 */
function drawMood(ctx, card, x, y) {
  const m = MOODS.filter(mm => mm.id === card.mood)[0];
  if (!m) return;
  const label = m.emoji + ' ' + m.text;
  ctx.save();
  ctx.font = 'bold 22px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const tw = ctx.measureText(label).width;
  const bw = tw + 34;
  const bh = 46;
  roundRect(ctx, x, y, bw, bh, bh / 2);
  ctx.fillStyle = m.color;
  ctx.fill();
  ctx.fillStyle = '#1f2d3d';
  ctx.fillText(label, x + 17, y + bh / 2 + 1);
  ctx.restore();
}

function measureHeight(ratioPct) {
  const photoH = Math.round(W * (ratioPct || 100) / 100);
  return photoH + INFO_H;
}

/**
 * 渲染并导出图片
 * @returns Promise<string> 临时图片路径
 */
function exportCard(canvas, card, ratioPct, pickedPhotos) {
  return new Promise((resolve, reject) => {
    // pickedPhotos 为用户自选的图片；不传则默认全部（最多 9 张）
    const source = (pickedPhotos && pickedPhotos.length) ? pickedPhotos : (card.photos || []);
    const photos = source.slice(0, 9);
    if (!photos.length) return reject(new Error('no photo'));

    const photoH = Math.round(W * (ratioPct || 100) / 100);
    const H = photoH + INFO_H;
    const style = card.style || card.template || 'light';
    const dark = isDarkStyle(style);

    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const bg = pickBg(card);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 底部说明区淡淡的色块，保证文字可读
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
    ctx.fillRect(0, photoH, W, INFO_H);

    // 逐张加载（失败的就跳过），再统一排版
    Promise.all(photos.map(p => loadImage(canvas, p).catch(() => null))).then((loaded) => {
      const imgs = loaded.filter(Boolean);
      if (!imgs.length) return reject(new Error('image load failed'));
      drawPhotoGrid(ctx, imgs, PAD, PAD, W - PAD * 2, photoH - PAD * 2);
      // 贴纸与心情徽章：跟界面上看到的位置一致
      drawStickers(ctx, card, PAD, PAD, W - PAD * 2, photoH - PAD * 2);
      drawMood(ctx, card, PAD + 16, PAD + 16);

      const ink = dark ? '#eaf6ff' : '#20303c';
      const sub = dark ? 'rgba(214,240,255,0.75)' : 'rgba(40,60,75,0.62)';

      // 主标签
      const phrases = card.phrases || [];
      let y = photoH + 62;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ink;
      ctx.font = 'bold 38px sans-serif';
      const main = phrases[0] ? ((phrases[0].emoji ? phrases[0].emoji + ' ' : '') + phrases[0].text) : '咔嚓卡片';
      ctx.fillText(main.length > 18 ? main.slice(0, 18) + '…' : main, PAD, y);

      // 其余标签（逐行）
      y += 46;
      ctx.font = '24px sans-serif';
      ctx.fillStyle = sub;
      for (let i = 1; i < Math.min(phrases.length, 4); i++) {
        const p = phrases[i];
        const t = (p.emoji ? p.emoji + ' ' : '') + p.text;
        ctx.fillText('· ' + (t.length > 24 ? t.slice(0, 24) + '…' : t), PAD, y);
        y += 32;
      }

      // 时间 / 地点
      const meta = [];
      if (card.timeText) meta.push('🕰 ' + card.timeText);
      if (card.locText) meta.push('📍 ' + card.locText);
      if (meta.length) {
        ctx.font = '22px sans-serif';
        ctx.fillStyle = sub;
        ctx.fillText(meta.join('    '), PAD, H - 46);
      }

      // 水印
      ctx.font = '22px sans-serif';
      ctx.fillStyle = dark ? 'rgba(214,240,255,0.5)' : 'rgba(40,60,75,0.35)';
      ctx.textAlign = 'right';
      ctx.fillText('✿ 咔嚓卡片', W - PAD, H - 46);
      ctx.textAlign = 'left';

      wx.canvasToTempFilePath({
        canvas,
        x: 0,
        y: 0,
        width: W,
        height: H,
        destWidth: W * 2,
        destHeight: H * 2,
        fileType: 'png',
        success: (res) => resolve(res.tempFilePath),
        fail: reject
      });
    }).catch(reject);
  });
}

module.exports = {
  exportCard,
  measureHeight
};
