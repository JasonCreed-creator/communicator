#!/usr/bin/env node
/**
 * 파비콘 생성기 — 브랜드 워드마크(`public/brand/remember-logo-black.png`)의 첫 글리프 'R'을 잘라
 * **동그란 웜 페이퍼 바탕**(2026-09-27 사용자 요청 "네모보다 동그라미") 위에 얹는다.
 *
 *   node scripts/make-favicon.mjs
 *
 * 산출물(전부 덮어쓴다):
 *   public/favicon.png          512px · 원형(모서리 투명)
 *   public/favicon.ico          16·32px PNG 엔트리 · 원형
 *   public/apple-touch-icon.png 180px · **정사각 꽉 찬 바탕**(iOS가 투명 부분을 검게 칠하고 모서리는 스스로 둥글린다)
 *   index.html                  <link rel="icon"> data URI(64px · 요청 0)
 *
 * 의존성 0 — PNG 읽기·쓰기(zlib)·ICO 포장까지 여기서 한다. 색은 tokens.css 값(--canvas·--ink·--border-strong)을 그대로 쓴다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = resolve(ROOT, 'public/brand/remember-logo-black.png');
const PAPER = [0xfb, 0xfa, 0xf6]; // --canvas
const INK = [0x1a, 0x1a, 0x1a]; // --ink
const RING = [0xc9, 0xc2, 0xb2]; // --border-strong — 흰 탭 줄 위에서도 원이 읽히게 하는 가는 테두리
const RING_RATIO = 1 / 40; // 지름 대비 테두리 두께(512px에서 약 13px · 64px에서 1.6px)
const GLYPH_HEIGHT_RATIO = 0.56; // 지름 대비 글리프 높이 — 원 안에 여유 있게

// ── PNG 읽기(8-bit RGBA·RGB · 비인터레이스만) ─────────────────────────────
function readPng(buf) {
  const sig = '\x89PNG\r\n\x1a\n';
  if (buf.toString('latin1', 0, 8) !== sig) throw new Error('PNG가 아닙니다');
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || data[12] !== 0 || (colorType !== 6 && colorType !== 2)) {
        throw new Error(`지원하지 않는 PNG(bitDepth ${bitDepth} · colorType ${colorType} · interlace ${data[12]})`);
      }
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * bpp];
      out[o + 1] = cur[x * bpp + 1];
      out[o + 2] = cur[x * bpp + 2];
      out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

// ── PNG 쓰기(RGBA · 필터 0) ───────────────────────────────────────────────
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
function writePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── ICO 포장(PNG 엔트리) ───────────────────────────────────────────────────
function writeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = [];
  const blobs = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, png } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    blobs.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...dir, ...blobs]);
}

// ── 글리프 잘라 내기: 연결 성분으로 'R'만 고른다 ─────────────────────────
// 워드마크의 R은 두 성분(기둥+볼 · 떨어진 다리)이고 다리와 'e' 사이에 빈 열이 없어 열 투영으로는 못 가른다.
// 규칙 = 맨 왼쪽 픽셀이 든 성분 A + A가 끝나기 전에 시작하는 성분(다리). 'e'는 A 뒤에서 시작하므로 빠진다.
function firstGlyph(img) {
  const { width, height, data } = img;
  const on = (x, y) => data[(y * width + x) * 4 + 3] > 8;
  const label = new Int32Array(width * height).fill(-1);
  const comps = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!on(x, y) || label[y * width + x] >= 0) continue;
      const id = comps.length;
      const c = { x0: x, x1: x + 1, y0: y, y1: y + 1 };
      comps.push(c);
      const stack = [[x, y]];
      label[y * width + x] = id;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < c.x0) c.x0 = cx;
        if (cx + 1 > c.x1) c.x1 = cx + 1;
        if (cy < c.y0) c.y0 = cy;
        if (cy + 1 > c.y1) c.y1 = cy + 1;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (!on(nx, ny) || label[ny * width + nx] >= 0) continue;
            label[ny * width + nx] = id;
            stack.push([nx, ny]);
          }
        }
      }
    }
  }
  let a = -1;
  for (let x = 0; x < width && a < 0; x++) for (let y = 0; y < height; y++) if (on(x, y)) { a = label[y * width + x]; break; }
  const A = comps[a];
  const picked = new Set([a]);
  comps.forEach((c, i) => { if (i !== a && c.x0 >= A.x0 && c.x0 < A.x1) picked.add(i); });
  const box = { x0: width, x1: 0, y0: height, y1: 0 };
  for (const i of picked) {
    const c = comps[i];
    box.x0 = Math.min(box.x0, c.x0); box.x1 = Math.max(box.x1, c.x1);
    box.y0 = Math.min(box.y0, c.y0); box.y1 = Math.max(box.y1, c.y1);
  }
  // 고른 성분의 알파만 남긴 사본(상자 안에 다른 글자 픽셀이 들어와도 섞이지 않게)
  const masked = { width, height, data: new Uint8Array(data.length) };
  for (let i = 0; i < width * height; i++) {
    if (label[i] >= 0 && picked.has(label[i])) masked.data[i * 4 + 3] = data[i * 4 + 3];
  }
  return { box, masked, components: picked.size, total: comps.length };
}

// 원본 알파를 쌍선형 보간으로 읽는다(글리프 상자 밖 = 0)
function sampleAlpha(img, box, gx, gy) {
  const sx = box.x0 + gx;
  const sy = box.y0 + gy;
  if (sx < box.x0 - 1 || sy < box.y0 - 1 || sx > box.x1 || sy > box.y1) return 0;
  const fx = Math.floor(sx);
  const fy = Math.floor(sy);
  const tx = sx - fx;
  const ty = sy - fy;
  const at = (x, y) => {
    if (x < box.x0 || x >= box.x1 || y < box.y0 || y >= box.y1) return 0;
    return img.data[(y * img.width + x) * 4 + 3] / 255;
  };
  const a00 = at(fx, fy);
  const a10 = at(fx + 1, fy);
  const a01 = at(fx, fy + 1);
  const a11 = at(fx + 1, fy + 1);
  return (a00 * (1 - tx) + a10 * tx) * (1 - ty) + (a01 * (1 - tx) + a11 * tx) * ty;
}

// ── 아이콘 렌더(size px · circle=true면 바깥 투명) ─────────────────────────
function render(logo, box, size, { circle }) {
  const out = new Uint8Array(size * size * 4);
  const gw = box.x1 - box.x0;
  const gh = box.y1 - box.y0;
  const scale = (size * GLYPH_HEIGHT_RATIO) / gh; // 원본 px → 아이콘 px
  const dw = gw * scale;
  const dh = gh * scale;
  const ox = (size - dw) / 2;
  const oy = (size - dh) / 2;
  const r = size / 2;
  const SS = 4; // 원 테두리 초과 샘플
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 1;
      let ring = 0;
      if (circle) {
        const rIn = r - size * RING_RATIO;
        let inside = 0;
        let onRing = 0;
        for (let j = 0; j < SS; j++) {
          for (let i = 0; i < SS; i++) {
            const px = x + (i + 0.5) / SS - r;
            const py = y + (j + 0.5) / SS - r;
            const d2 = px * px + py * py;
            if (d2 <= r * r) {
              inside++;
              if (d2 >= rIn * rIn) onRing++;
            }
          }
        }
        cover = inside / (SS * SS);
        ring = inside > 0 ? onRing / inside : 0;
      }
      const a = cover > 0 ? sampleAlpha(logo, box, (x + 0.5 - ox) / scale - 0.5, (y + 0.5 - oy) / scale - 0.5) : 0;
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        const base = PAPER[c] * (1 - ring) + RING[c] * ring;
        out[o + c] = Math.round(base * (1 - a) + INK[c] * a);
      }
      out[o + 3] = Math.round(cover * 255);
    }
  }
  return { width: size, height: size, data: out };
}

// 512 → 작은 크기: 프리멀티플라이드 박스 평균(원 테두리·글리프 가장자리가 고르게 섞인다)
function downscale(img, size) {
  const f = img.width / size;
  if (!Number.isInteger(f)) throw new Error(`정수 배율이 아닙니다: ${img.width} → ${size}`);
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < f; j++) {
        for (let i = 0; i < f; i++) {
          const o = ((y * f + j) * img.width + (x * f + i)) * 4;
          const al = img.data[o + 3] / 255;
          r += img.data[o] * al;
          g += img.data[o + 1] * al;
          b += img.data[o + 2] * al;
          a += al;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round((a / (f * f)) * 255);
    }
  }
  return { width: size, height: size, data: out };
}

// ── 실행 ───────────────────────────────────────────────────────────────────
const source = readPng(readFileSync(LOGO));
const { box, masked: logo, components, total } = firstGlyph(source);
if (box.x1 - box.x0 < 20 || box.y1 - box.y0 < 20) throw new Error(`글리프를 찾지 못했습니다: ${JSON.stringify(box)}`);
if (components !== 2) throw new Error(`'R'은 두 성분(기둥+볼·다리)이어야 합니다 — 고른 성분 ${components}개 / 전체 ${total}개`);

const big = render(logo, box, 512, { circle: true });
const png512 = writePng(big);
const png64 = writePng(downscale(big, 64));
const png32 = writePng(downscale(big, 32));
const png16 = writePng(downscale(big, 16));
// 홈 화면 아이콘: 원형 대신 정사각 — iOS는 투명 영역을 검게 채우고 모서리를 스스로 둥글린다
const touch = render(logo, box, 180, { circle: false });

writeFileSync(resolve(ROOT, 'public/favicon.png'), png512);
writeFileSync(resolve(ROOT, 'public/favicon.ico'), writeIco([{ size: 16, png: png16 }, { size: 32, png: png32 }]));
writeFileSync(resolve(ROOT, 'public/apple-touch-icon.png'), writePng(touch));

const htmlPath = resolve(ROOT, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const dataUri = `data:image/png;base64,${png64.toString('base64')}`;
const re = /(<link rel="icon" type="image\/png" href=")[^"]*(" \/>)/;
if (!re.test(html)) throw new Error('index.html에서 <link rel="icon" …>을 찾지 못했습니다');
writeFileSync(htmlPath, html.replace(re, `$1${dataUri}$2`));

console.log(
  `글리프 상자 x ${box.x0}–${box.x1} · y ${box.y0}–${box.y1} (${box.x1 - box.x0}×${box.y1 - box.y0}px · 성분 ${components}/${total}) → ` +
    `favicon.png 512 원형 · favicon.ico 16+32 · apple-touch-icon 180 정사각 · index.html data URI ${dataUri.length}자`,
);
