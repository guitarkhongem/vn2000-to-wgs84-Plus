/*
 * Ảnh bay / ảnh trực giao trên bản đồ — mở file trên máy, không tải lên mạng.
 *
 *   GeoTIFF (.tif/.tiff, kể cả BigTIFF) toạ độ VN-2000 TM-3 hoặc WGS84 độ; ảnh TIF/JPG/PNG kèm file world
 *   (.tfw/.jgw/.pgw/.wld) và .prj nếu có.
 *
 * Bộ đọc TIFF tự viết (không thư viện ngoài): dạng ô (tile) hoặc dải (strip), nén không nén / LZW / Deflate /
 * PackBits / JPEG (giải mã JPEG bằng trình duyệt), predictor 2, RGB / RGBA / xám / bảng màu, 8 và 16 bit,
 * PlanarConfig 1–2, overview (IFD giảm độ phân giải hoặc SubIFD) và mặt nạ trong suốt (mask IFD), GDAL_NODATA.
 * Chỉ đọc phần file cần cho khung nhìn (Blob.slice) → file 0,5–2 GB vẫn mở được; có overview thì xem được ở mọi
 * mức zoom, không có thì chỉ hiện ảnh khi phóng đủ gần (ngoài ra vẽ khung bao ảnh).
 *
 * Đổi toạ độ: mỗi ô bản đồ 256 px lấy lưới 9×9 điểm, đổi WGS84 → VN-2000 bằng VN.wgs84ToVn2000 (thuật toán của
 * ứng dụng, docs/js/converter.js — không viết lại công thức), nội suy song tuyến cho từng điểm ảnh. Khung bao ảnh
 * đổi ngược bằng VN.vn2000ToWgs84. Ô ảnh vẽ qua giao thức "anhbay://" của MapLibre (addProtocol).
 */
(function (root) {
  "use strict";
  root.VN = root.VN || {};

  // ======================================================================= đọc TIFF
  const KT = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };
  const docBlob = async (blob, off, len) => new Uint8Array(await blob.slice(off, off + len).arrayBuffer());

  function giaTri(dv, p, type, le) {
    switch (type) {
      case 1: case 6: case 7: case 2: return dv.getUint8(p);
      case 3: return dv.getUint16(p, le);
      case 8: return dv.getInt16(p, le);
      case 4: return dv.getUint32(p, le);
      case 9: return dv.getInt32(p, le);
      case 5: return dv.getUint32(p, le) / (dv.getUint32(p + 4, le) || 1);
      case 10: return dv.getInt32(p, le) / (dv.getInt32(p + 4, le) || 1);
      case 11: return dv.getFloat32(p, le);
      case 12: return dv.getFloat64(p, le);
      case 16: case 18: return Number(dv.getBigUint64(p, le));
      case 17: return Number(dv.getBigInt64(p, le));
      default: return 0;
    }
  }

  async function docIfd(blob, off, le, big) {
    const nLen = big ? 8 : 2, eLen = big ? 20 : 12, inl = big ? 8 : 4;
    const h = await docBlob(blob, off, nLen);
    const hv = new DataView(h.buffer);
    const n = big ? Number(hv.getBigUint64(0, le)) : hv.getUint16(0, le);
    if (!n || n > 4000) throw new Error("Cấu trúc TIFF hỏng");
    const b = await docBlob(blob, off + nLen, n * eLen + inl);
    const dv = new DataView(b.buffer);
    const tags = {}, raw = {};
    for (let i = 0; i < n; i++) {
      const p = i * eLen, tag = dv.getUint16(p, le), type = dv.getUint16(p + 2, le);
      const cnt = big ? Number(dv.getBigUint64(p + 4, le)) : dv.getUint32(p + 4, le);
      const sz = (KT[type] || 1) * cnt;
      let vb, vp;
      if (sz <= inl) { vb = dv; vp = p + (big ? 12 : 8); }
      else {
        const o = big ? Number(dv.getBigUint64(p + 12, le)) : dv.getUint32(p + 8, le);
        const u = await docBlob(blob, o, sz);
        vb = new DataView(u.buffer); vp = 0;
      }
      if (type === 2) {
        let s = ""; for (let k = 0; k < cnt; k++) { const c = vb.getUint8(vp + k); if (c) s += String.fromCharCode(c); }
        tags[tag] = s;
      } else if (type === 7 || (type === 1 && cnt > 64)) {
        raw[tag] = new Uint8Array(vb.buffer.slice(vb.byteOffset + vp, vb.byteOffset + vp + cnt));
        tags[tag] = raw[tag];
      } else {
        const a = new Array(cnt), s1 = KT[type] || 1;
        for (let k = 0; k < cnt; k++) a[k] = giaTri(vb, vp + k * s1, type, le);
        tags[tag] = a;
      }
    }
    const next = big ? Number(dv.getBigUint64(n * eLen, le)) : dv.getUint32(n * eLen, le);
    return { tags, next };
  }

  const v1 = (t, k, d) => (t[k] === undefined ? d : Array.isArray(t[k]) ? t[k][0] : t[k]);

  // Đọc cấu trúc file TIFF: các mức ảnh (gốc + overview), mặt nạ, thẻ GeoTIFF
  async function docTiff(blob) {
    const h = await docBlob(blob, 0, 16), dv = new DataView(h.buffer);
    const le = h[0] === 0x49 && h[1] === 0x49;
    if (!le && !(h[0] === 0x4d && h[1] === 0x4d)) throw new Error("Không phải file TIFF");
    const magic = dv.getUint16(2, le), big = magic === 43;
    if (!big && magic !== 42) throw new Error("Không phải file TIFF");
    let off = big ? Number(dv.getBigUint64(8, le)) : dv.getUint32(4, le);
    const ifds = [], da = new Set();
    while (off && !da.has(off) && ifds.length < 64) { da.add(off); const d = await docIfd(blob, off, le, big); ifds.push(d.tags); off = d.next; }
    // SubIFD (overview / mặt nạ kiểu SubIFDs)
    for (const t of ifds.slice()) for (const o of t[330] || []) if (!da.has(o)) { da.add(o); ifds.push((await docIfd(blob, o, le, big)).tags); }
    const lv = ifds.map((t) => taoMuc(t, le)).filter(Boolean);
    const anh = lv.filter((l) => !(l.loaiCon & 4));
    if (!anh.length) throw new Error("TIFF không có ảnh");
    const goc = anh[0];
    const muc = anh.filter((l) => l === goc || (l.spp === goc.spp && l.w < goc.w)).sort((a, b) => b.w - a.w);
    const mask = lv.filter((l) => l.loaiCon & 4);
    for (const m of muc) { m.mask = mask.find((k) => k.w === m.w && k.h === m.h) || null; m.blob = blob; if (m.mask) m.mask.blob = blob; }
    return { le, big, muc, tags: goc.tags, blob };
  }

  function taoMuc(t, le) {
    const w = v1(t, 256), h = v1(t, 257);
    if (!w || !h) return null;
    const tiled = t[322] !== undefined;
    const tw = tiled ? v1(t, 322) : w, th = tiled ? v1(t, 323) : Math.min(v1(t, 278, h), h);
    const offs = tiled ? t[324] : t[273], cnts = tiled ? t[325] : t[279];
    if (!offs || !cnts) return null;
    const bps = (t[258] || [1])[0], spp = v1(t, 277, 1);
    return { tags: t, le, w, h, tiled, tw, th, offs, cnts, bps, spp, comp: v1(t, 259, 1), pred: v1(t, 317, 1),
      photo: v1(t, 262, spp >= 3 ? 2 : 1), planar: v1(t, 284, 1), loaiCon: v1(t, 254, 0), extra: t[338] || [],
      jpegTables: t[347] instanceof Uint8Array ? t[347] : null, colormap: t[320] || null, sf: v1(t, 339, 1),
      nodata: t[42113] !== undefined ? Number(String(t[42113]).trim()) : null,
      ngang: tiled ? Math.ceil(w / tw) : 1, mask: null };
  }

  // ---------- giải nén ----------
  function lzw(src, dai) {
    const out = new Uint8Array(dai); let op = 0;
    const pre = new Int32Array(4096), suf = new Uint8Array(4096), dd = new Int32Array(4096), dau = new Uint8Array(4096);
    for (let i = 0; i < 256; i++) { pre[i] = -1; suf[i] = i; dd[i] = 1; dau[i] = i; }
    let pos = 0, nb = 9, next = 258, cu = -1;
    const tong = src.length * 8;
    const doc = () => {
      if (pos + nb > tong) return 257;
      const i = pos >> 3, s = pos & 7;
      const v = ((src[i] << 16) | ((src[i + 1] || 0) << 8) | (src[i + 2] || 0)) >>> 0;
      pos += nb;
      return (v >>> (24 - s - nb)) & ((1 << nb) - 1);
    };
    const ghi = (c) => {
      const l = dd[c];
      if (op + l > dai) { let k = c; const tmp = []; while (k >= 0) { tmp.push(suf[k]); k = pre[k]; } for (let j = tmp.length - 1; j >= 0 && op < dai; j--) out[op++] = tmp[j]; return; }
      let k = c, p = op + l - 1;
      while (k >= 0) { out[p--] = suf[k]; k = pre[k]; }
      op += l;
    };
    const them = (p, ch) => { if (next < 4096) { pre[next] = p; suf[next] = ch; dd[next] = dd[p] + 1; dau[next] = dau[p]; next++; } };
    for (;;) {
      const c = doc();
      if (c === 257) break;
      if (c === 256) { nb = 9; next = 258; cu = -1; continue; }
      if (cu === -1) { ghi(c); cu = c; }
      else if (c < next) { ghi(c); them(cu, dau[c]); cu = c; }
      else { them(cu, dau[cu]); ghi(next - 1); cu = c; }
      if (next + 1 >= (1 << nb)) { if (nb < 12) nb++; }
      if (op >= dai) break;
    }
    return out;
  }

  function packbits(src, dai) {
    const out = new Uint8Array(dai); let i = 0, o = 0;
    while (i < src.length && o < dai) {
      const n = (src[i++] << 24) >> 24;
      if (n >= 0) { for (let k = 0; k <= n && o < dai; k++) out[o++] = src[i++]; }
      else if (n !== -128) { const b = src[i++]; for (let k = 0; k < 1 - n && o < dai; k++) out[o++] = b; }
    }
    return out;
  }

  async function inflate(src) {
    const ds = new DecompressionStream("deflate");
    const buf = await new Response(new Blob([src]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }

  async function jpegRgba(src, tables, w, h) {
    let data = src;
    if (tables && tables.length > 4) {               // bảng JPEG dùng chung: ghép tables (bỏ EOI) + dữ liệu (bỏ SOI)
      data = new Uint8Array(tables.length - 2 + src.length - 2);
      data.set(tables.subarray(0, tables.length - 2), 0);
      data.set(src.subarray(2), tables.length - 2);
    }
    const bmp = await createImageBitmap(new Blob([data], { type: "image/jpeg" }));
    const cv = new OffscreenCanvas(w, h), cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(bmp, 0, 0);
    bmp.close && bmp.close();
    return cx.getImageData(0, 0, w, h).data;
  }

  // ---------- giải mã một mảnh (ô / dải) → RGBA ----------
  async function giaiNen(L, blob, idx, dai) {
    blob = L.blob || blob;
    const off = L.offs[idx], cnt = L.cnts[idx];
    if (!cnt) return null;
    const raw = await docBlob(blob, off, cnt);
    switch (L.comp) {
      case 1: return raw;
      case 5: return lzw(raw, dai);
      case 8: case 32946: return inflate(raw);
      case 32773: return packbits(raw, dai);
      default: throw new Error(`Kiểu nén TIFF ${L.comp} chưa hỗ trợ — xuất lại ảnh với nén LZW, Deflate hoặc JPEG`);
    }
  }

  function boPredictor(b, w, rows, spp, bps, le) {
    if (bps === 8) {
      const rl = w * spp;
      for (let r = 0; r < rows; r++) { const s = r * rl; for (let i = spp; i < rl; i++) b[s + i] = (b[s + i] + b[s + i - spp]) & 255; }
    } else if (bps === 16) {
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), rl = w * spp;
      for (let r = 0; r < rows; r++) for (let i = spp; i < rl; i++) {
        const p = (r * rl + i) * 2;
        dv.setUint16(p, (dv.getUint16(p, le) + dv.getUint16(p - spp * 2, le)) & 0xffff, le);
      }
    }
  }

  async function giaiMaManh(L, blob, idx) {
    const cw = L.tw, ch = L.tiled ? L.th : Math.min(L.th, L.h - idx * L.th);
    if (ch <= 0) return null;
    const n = cw * ch, rgba = new Uint8ClampedArray(n * 4);
    if (L.comp === 7) {                                  // JPEG: trình duyệt giải mã (YCbCr / RGB / xám)
      const cnt = L.cnts[idx]; if (!cnt) return { w: cw, h: ch, rgba };
      const raw = await docBlob(L.blob || blob, L.offs[idx], cnt);
      rgba.set(await jpegRgba(raw, L.jpegTables, cw, ch));
      return { w: cw, h: ch, rgba };
    }
    if (L.comp === 6) throw new Error("Nén JPEG kiểu cũ (OJPEG) chưa hỗ trợ — xuất lại ảnh với nén JPEG mới hoặc LZW");
    const B = L.bps / 8;
    if (L.bps !== 8 && L.bps !== 16) throw new Error(`Ảnh ${L.bps} bit/kênh chưa hỗ trợ (cần 8 hoặc 16 bit)`);
    if (L.photo === 6 || L.photo === 5 || L.photo > 6) throw new Error("Kiểu màu của ảnh (YCbCr không nén JPEG / CMYK / Lab) chưa hỗ trợ — xuất lại ảnh RGB");
    if (L.photo === 3 && L.bps !== 8) throw new Error("Ảnh bảng màu 16 bit chưa hỗ trợ");
    const spp = L.spp, mau = [];
    if (L.planar === 2) {
      const moiMat = L.offs.length / spp;
      for (let s = 0; s < spp; s++) {
        const b = await giaiNen(L, blob, s * moiMat + idx, n * B);
        if (b && L.pred === 2) boPredictor(b, cw, ch, 1, L.bps, L.le);
        mau.push(b);
      }
    } else {
      const b = await giaiNen(L, blob, idx, n * spp * B);
      if (!b) return { w: cw, h: ch, rgba };
      if (L.pred === 2) boPredictor(b, cw, ch, spp, L.bps, L.le);
      mau.push(b);
    }
    const lay = (s, i) => {                               // giá trị 8 bit của mẫu s tại điểm i
      const b = L.planar === 2 ? mau[s] : mau[0], k = L.planar === 2 ? i : i * spp + s;
      if (!b) return 0;
      return B === 1 ? b[k] : (L.le ? b[2 * k + 1] : b[2 * k]);
    };
    const alpha = spp >= 4 && (L.extra[0] === 1 || L.extra[0] === 2) ? 3 : spp === 2 && (L.extra[0] === 1 || L.extra[0] === 2) ? 1 : -1;
    const cm = L.colormap, cmN = cm ? cm.length / 3 : 0, nd = L.nodata;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      let r, g, bl;
      if (L.photo === 2 && spp >= 3) { r = lay(0, i); g = lay(1, i); bl = lay(2, i); }
      else if (L.photo === 3 && cm) { const v = lay(0, i); r = cm[v] >> 8; g = cm[cmN + v] >> 8; bl = cm[2 * cmN + v] >> 8; }
      else { let v = lay(0, i); if (L.photo === 0) v = 255 - v; r = g = bl = v; }
      rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = bl;
      let a = alpha >= 0 ? lay(alpha, i) : 255;
      if (nd !== null && r === nd && g === nd && bl === nd) a = 0;
      rgba[p + 3] = a;
    }
    return { w: cw, h: ch, rgba };
  }

  async function giaiMaMask(M, blob, idx) {
    const cw = M.tw, ch = M.tiled ? M.th : Math.min(M.th, M.h - idx * M.th);
    const rb = Math.ceil(cw / 8), b = await giaiNen(M, blob, idx, rb * ch);
    const m = new Uint8Array(cw * ch);
    if (!b) return m;
    for (let r = 0; r < ch; r++) for (let c = 0; c < cw; c++) m[r * cw + c] = (b[r * rb + (c >> 3)] >> (7 - (c & 7))) & 1 ? 255 : 0;
    return m;
  }

  // ---------- bộ nhớ đệm các mảnh đã giải mã ----------
  const DEM = new Map(); let demByte = 0; const DEM_MAX = 96 * 1024 * 1024;
  async function manh(src, li, idx) {
    const k = src.id + ":" + li + ":" + idx;
    if (DEM.has(k)) { const v = DEM.get(k); DEM.delete(k); DEM.set(k, v); return v; }
    const L = src.muc[li];
    const v = (async () => {
      const m = await giaiMaManh(L, src.blob, idx);
      if (m && L.mask) {
        const M = L.mask, mm = await giaiMaMask(M, src.blob, idx);
        for (let i = 0, p = 3; i < mm.length && p < m.rgba.length; i++, p += 4) if (!mm[i]) m.rgba[p] = 0;
      }
      return m;
    })();
    DEM.set(k, v);
    try {
      const m = await v;
      demByte += m ? m.rgba.length : 0;
      while (demByte > DEM_MAX && DEM.size > 1) {
        const [k0, p0] = DEM.entries().next().value; DEM.delete(k0);
        p0.then((x) => { demByte -= x ? x.rgba.length : 0; }).catch(() => {});
      }
      return m;
    } catch (e) { DEM.delete(k); throw e; }
  }

  // Đọc cửa sổ [x0,x1)×[y0,y1) (toạ độ điểm ảnh của mức li) → RGBA; null nếu phải đọc quá nhiều
  async function docCuaSoTiff(src, li, x0, y0, x1, y1) {
    const L = src.muc[li], w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return null;
    if (w * h > 4096 * 4096) return null;
    const ds = [];
    if (L.tiled) {
      for (let ty = Math.floor(y0 / L.th); ty <= Math.floor((y1 - 1) / L.th); ty++)
        for (let tx = Math.floor(x0 / L.tw); tx <= Math.floor((x1 - 1) / L.tw); tx++) ds.push([ty * L.ngang + tx, tx * L.tw, ty * L.th]);
    } else for (let s = Math.floor(y0 / L.th); s <= Math.floor((y1 - 1) / L.th); s++) ds.push([s, 0, s * L.th]);
    let byte = 0; for (const [i] of ds) byte += L.cnts[i] || 0;
    if (ds.length > 400 || byte > 128 * 1024 * 1024) return null;
    const out = new Uint8ClampedArray(w * h * 4);
    const ms = await Promise.all(ds.map(([i]) => manh(src, li, i)));
    ds.forEach(([, ox, oy], k) => {
      const m = ms[k]; if (!m) return;
      const cx0 = Math.max(x0, ox), cx1 = Math.min(x1, ox + m.w, L.w), cy0 = Math.max(y0, oy), cy1 = Math.min(y1, oy + m.h, L.h);
      if (cx1 <= cx0) return;
      for (let y = cy0; y < cy1; y++) {
        const s = ((y - oy) * m.w + (cx0 - ox)) * 4;
        out.set(m.rgba.subarray(s, s + (cx1 - cx0) * 4), ((y - y0) * w + (cx0 - x0)) * 4);
      }
    });
    return { w, h, rgba: out };
  }

  // Ảnh thường (JPG / PNG / TIFF trình duyệt đọc được) giải mã một lần; mức giảm ảo 1, 2, 4… (thu nhỏ bằng canvas)
  async function moAnhThuong(file) {
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch (_) { throw new Error("Trình duyệt không giải mã được ảnh này (quá lớn hoặc hỏng) — xuất lại dạng GeoTIFF có overview"); }
    const W = bmp.width, H = bmp.height, muc = [];
    for (let f = 1; ; f *= 2) { muc.push({ w: Math.max(1, Math.round(W / f)), h: Math.max(1, Math.round(H / f)), f }); if (W / f <= 512 && H / f <= 512) break; }
    return { kieu: "anh", W, H, muc, bmp, tags: {} };
  }
  function docCuaSoAnh(src, li, x0, y0, x1, y1) {
    const L = src.muc[li], w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0 || w * h > 4096 * 4096) return null;
    const cv = new OffscreenCanvas(w, h), cx = cv.getContext("2d", { willReadFrequently: true });
    cx.imageSmoothingQuality = "high";
    cx.drawImage(src.bmp, x0 * src.W / L.w, y0 * src.H / L.h, w * src.W / L.w, h * src.H / L.h, 0, 0, w, h);
    return { w, h, rgba: cx.getImageData(0, 0, w, h).data };
  }

  // ======================================================================= toạ độ
  // Hệ số affine kiểu GDAL: X = a + b·cột + c·hàng ; Y = d + e·cột + f·hàng  (cột/hàng tính từ mép trên trái)
  function affineTiff(t) {
    const tp = t[33922], sc = t[33550], mt = t[34264];
    let g = null;
    if (mt && mt.length >= 16) g = [mt[3], mt[0], mt[1], mt[7], mt[4], mt[5]];
    else if (tp && tp.length >= 6 && sc && sc.length >= 2) g = [tp[3] - tp[0] * sc[0], sc[0], 0, tp[4] + tp[1] * sc[1], 0, -sc[1]];
    if (!g) return null;
    const k = geoKeys(t);
    if (k[1025] === 2) { g[0] -= 0.5 * (g[1] + g[2]); g[3] -= 0.5 * (g[4] + g[5]); }   // PixelIsPoint
    return g;
  }
  function docWorld(text) {
    const s = String(text).trim().split(/\s+/).map(Number);
    if (s.length < 6 || s.slice(0, 6).some((v) => !isFinite(v))) throw new Error("File world (.tfw/.jgw) không đúng: cần 6 dòng số");
    const [A, D, B, E, C, F] = s;
    return [C - 0.5 * A - 0.5 * B, A, B, F - 0.5 * D - 0.5 * E, D, E];
  }
  function geoKeys(t) {
    const k = {}, dir = t[34735];
    if (!dir || dir.length < 4) return k;
    const dbl = t[34736] || [], asc = typeof t[34737] === "string" ? t[34737] : "";
    for (let i = 4; i + 3 < dir.length; i += 4) {
      const [id, loc, cnt, off] = dir.slice(i, i + 4);
      k[id] = loc === 0 ? off : loc === 34736 ? (cnt > 1 ? dbl.slice(off, off + cnt) : dbl[off]) : loc === 34737 ? asc.substr(off, cnt).replace(/\|$/, "") : off;
    }
    return k;
  }
  // EPSG VN-2000 / TM-3 (kinh tuyến trục theo tỉnh, k = 0,9999)
  const TM3 = { 9205: 103, 9206: 104, 9207: 104.5, 9208: 104.75, 9209: 105.5, 9210: 105.75, 9211: 106, 9212: 106.25,
    9213: 106.5, 9214: 107, 9215: 107.25, 9216: 107.5, 9217: 108.25, 9218: 108.5 };
  // Đoán hệ toạ độ từ GeoKey / .prj → { crs: "vn2000"|"wgs84"|"", lon0, moTa, loi }
  function doanCrs(k, prj) {
    const pcs = k[3072], gcs = k[2048];
    if (TM3[pcs]) return { crs: "vn2000", lon0: TM3[pcs], moTa: `GeoTIFF ghi hệ EPSG:${pcs} (VN-2000 / TM-3, KTT ${TM3[pcs]}°)` };
    if (pcs === 3405 || pcs === 3406) return { loi: `Ảnh ở hệ VN-2000 / UTM (EPSG:${pcs}, múi 6°) — ứng dụng dùng VN-2000 TM-3 (múi 3°, KTT theo tỉnh). Xuất lại ảnh theo VN-2000 TM-3` };
    if (pcs >= 32601 && pcs <= 32760) return { loi: `Ảnh ở hệ WGS84 / UTM (EPSG:${pcs}) — chưa hỗ trợ. Xuất lại ảnh theo VN-2000 TM-3 (KTT của tỉnh) hoặc WGS84 độ (EPSG:4326)` };
    if (!pcs && (gcs === 4326 || k[2050] === 6326) && k[1024] !== 1) return { crs: "wgs84", moTa: "GeoTIFF ghi hệ WGS84 (độ)" };
    if (!pcs && gcs === 4756 && k[1024] !== 1) return { loi: "Ảnh ở hệ VN-2000 toạ độ độ (EPSG:4756) — chưa hỗ trợ. Xuất lại ảnh theo VN-2000 TM-3 hoặc WGS84 độ" };
    if (pcs === 32767 || (!pcs && k[3075])) {
      const kt = k[3080] !== undefined ? k[3080] : k[3088] !== undefined ? k[3088] : k[3084];
      const sc = k[3092] !== undefined ? Number(k[3092]) : 0.9999;
      if (k[3075] === 1 || k[3075] === undefined) {
        if (Math.abs(sc - 0.9996) < 1e-7) return { loi: "Ảnh ở phép chiếu UTM (k = 0,9996) — xuất lại theo VN-2000 TM-3 (k = 0,9999)" };
        if (kt !== undefined) return { crs: "vn2000", lon0: Number(kt), moTa: `GeoTIFF ghi phép chiếu TM, KTT ${Number(kt)}°, k = ${sc}` };
      }
    }
    if (prj) {
      const s = String(prj), cm = s.match(/central_meridian"?\s*,\s*([-\d.]+)/i), scl = s.match(/scale_factor"?\s*,\s*([-\d.]+)/i);
      const ep = s.match(/AUTHORITY\["EPSG","(\d+)"\]\s*\]\s*$/);
      if (ep && TM3[+ep[1]]) return { crs: "vn2000", lon0: TM3[+ep[1]], moTa: `File .prj: EPSG:${ep[1]}` };
      if (/Transverse_Mercator/i.test(s) && cm) {
        if (scl && Math.abs(Number(scl[1]) - 0.9996) < 1e-7) return { loi: "File .prj là UTM (k = 0,9996) — xuất lại theo VN-2000 TM-3" };
        return { crs: "vn2000", lon0: Number(cm[1]), moTa: `File .prj: Transverse Mercator, KTT ${Number(cm[1])}°` };
      }
      if (/^\s*GEOGCS/i.test(s) && /WGS[ _]?(19)?84/i.test(s)) return { crs: "wgs84", moTa: "File .prj: WGS84 (độ)" };
    }
    return { crs: "", moTa: "File không ghi hệ toạ độ" };
  }
  function doanTuPhamVi(ext) {
    if (!ext) return "";
    const [x0, y0, x1, y1] = ext;
    if (x0 >= 100 && x1 <= 120 && y0 >= 5 && y1 <= 25) return "wgs84";
    if (x0 > 100000 && x1 < 900000 && y0 > 900000 && y1 < 2700000) return "vn2000";
    if (y0 > 100000 && y1 < 900000 && x0 > 900000 && x1 < 2700000) return "vn2000-dao";
    return "";
  }

  // ======================================================================= vẽ ô bản đồ
  const DS = new Map();          // id lớp → lớp ảnh
  let rong = null, demLop = 0;
  async function oTrong() {
    if (rong) return rong;
    const cv = new OffscreenCanvas(1, 1);
    cv.getContext("2d").clearRect(0, 0, 1, 1);
    rong = await (await cv.convertToBlob({ type: "image/png" })).arrayBuffer();
    return rong;
  }
  const lonTile = (x, n) => (x / n) * 360 - 180;
  const latTile = (y, n) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

  async function veO(lop, z, x, y, signal) {
    const G = 8, N = 256, n = 2 ** z, src = lop.src, W = src.W, H = src.H;
    const gx = new Float64Array((G + 1) * (G + 1)), gy = new Float64Array((G + 1) * (G + 1));
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const [cx, cy] = lop.toPx(lonTile(x + i / G, n), latTile(y + j / G, n));
      const k = j * (G + 1) + i; gx[k] = cx; gy[k] = cy;
      if (cx < mnx) mnx = cx; if (cx > mxx) mxx = cx; if (cy < mny) mny = cy; if (cy > mxy) mxy = cy;
    }
    if (mxx < 0 || mxy < 0 || mnx > W || mny > H || !isFinite(mnx)) return oTrong();
    // chọn mức overview: ≥ 1 điểm ảnh của mức cho mỗi điểm ảnh ô bản đồ
    const ti = Math.max(mxx - mnx, mxy - mny) / N;
    let li = 0;
    for (let k = 1; k < src.muc.length; k++) if (W / src.muc[k].w <= ti) li = k;
    const L = src.muc[li], fx = W / L.w, fy = H / L.h;
    const x0 = Math.max(0, Math.floor(mnx / fx) - 1), y0 = Math.max(0, Math.floor(mny / fy) - 1);
    const x1 = Math.min(L.w, Math.ceil(mxx / fx) + 2), y1 = Math.min(L.h, Math.ceil(mxy / fy) + 2);
    if (signal && signal.aborted) throw new DOMException("huỷ", "AbortError");
    const cs = src.kieu === "anh" ? docCuaSoAnh(src, li, x0, y0, x1, y1) : await docCuaSoTiff(src, li, x0, y0, x1, y1);
    if (!cs) return oTrong();                             // cần đọc quá nhiều (không có overview) → để trống
    // thu nhỏ nhiều hơn 1,5 lần (không có overview phù hợp) → làm mượt bằng canvas trước, tránh đường mảnh bị đứt
    let kx = 1, ky = 1, cv0 = cs;
    const tl = ti / fx;
    if (tl > 1.5) {
      const w2 = Math.max(1, Math.round(cs.w / tl)), h2 = Math.max(1, Math.round(cs.h / tl));
      const c1 = new OffscreenCanvas(cs.w, cs.h);
      c1.getContext("2d").putImageData(new ImageData(cs.rgba instanceof Uint8ClampedArray ? cs.rgba : new Uint8ClampedArray(cs.rgba), cs.w, cs.h), 0, 0);
      const c2 = new OffscreenCanvas(w2, h2), x2 = c2.getContext("2d", { willReadFrequently: true });
      x2.imageSmoothingEnabled = true; x2.imageSmoothingQuality = "high";
      x2.drawImage(c1, 0, 0, w2, h2);
      cv0 = { w: w2, h: h2, rgba: x2.getImageData(0, 0, w2, h2).data };
      kx = cs.w / w2; ky = cs.h / h2;
    }
    const out = new Uint8ClampedArray(N * N * 4), cw = cv0.w, chh = cv0.h, d = cv0.rgba;
    const min = true;                                     // nội suy song tuyến (sau khi đã đưa về ~1 điểm ảnh / điểm ảnh ô)
    for (let py = 0; py < N; py++) {
      const v = ((py + 0.5) / N) * G, j = Math.min(G - 1, Math.floor(v)), fv = v - j;
      for (let px = 0; px < N; px++) {
        const u = ((px + 0.5) / N) * G, i = Math.min(G - 1, Math.floor(u)), fu = u - i;
        const k = j * (G + 1) + i, k2 = k + G + 1;
        const cx = (gx[k] * (1 - fu) + gx[k + 1] * fu) * (1 - fv) + (gx[k2] * (1 - fu) + gx[k2 + 1] * fu) * fv;
        const cy = (gy[k] * (1 - fu) + gy[k + 1] * fu) * (1 - fv) + (gy[k2] * (1 - fu) + gy[k2 + 1] * fu) * fv;
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
        const o = (py * N + px) * 4;
        let lx = (cx / fx - x0) / kx, ly = (cy / fy - y0) / ky;
        if (!min) {
          const ix = Math.min(cw - 1, Math.max(0, Math.floor(lx))), iy = Math.min(chh - 1, Math.max(0, Math.floor(ly)));
          const s = (iy * cw + ix) * 4;
          out[o] = d[s]; out[o + 1] = d[s + 1]; out[o + 2] = d[s + 2]; out[o + 3] = d[s + 3];
        } else {
          lx -= 0.5; ly -= 0.5;
          const ix = Math.max(0, Math.min(cw - 1, Math.floor(lx))), iy = Math.max(0, Math.min(chh - 1, Math.floor(ly)));
          const ix2 = Math.min(cw - 1, ix + 1), iy2 = Math.min(chh - 1, iy + 1);
          const ax = Math.max(0, Math.min(1, lx - ix)), ay = Math.max(0, Math.min(1, ly - iy));
          const s00 = (iy * cw + ix) * 4, s10 = (iy * cw + ix2) * 4, s01 = (iy2 * cw + ix) * 4, s11 = (iy2 * cw + ix2) * 4;
          for (let c = 0; c < 4; c++) out[o + c] = (d[s00 + c] * (1 - ax) + d[s10 + c] * ax) * (1 - ay) + (d[s01 + c] * (1 - ax) + d[s11 + c] * ax) * ay;
        }
      }
    }
    const cv = new OffscreenCanvas(N, N);
    cv.getContext("2d").putImageData(new ImageData(out, N, N), 0, 0);
    return (await cv.convertToBlob({ type: "image/png" })).arrayBuffer();
  }

  let daDangKy = false;
  function dangKyGiaoThuc() {
    if (daDangKy || !root.maplibregl || !root.maplibregl.addProtocol) return;
    daDangKy = true;
    root.maplibregl.addProtocol("anhbay", async (params, ac) => {
      const m = /^anhbay:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
      const lop = m && DS.get(m[1]);
      if (!lop) return { data: await oTrong() };
      return { data: await veO(lop, +m[2], +m[3], +m[4], ac && ac.signal) };
    });
  }

  // ======================================================================= mở ảnh (gọi từ lopfile.js)
  async function mo(file, kem, ctx) {
    const ten = file.name, laTiff = /\.tiff?$/i.test(ten);
    let src;
    if (laTiff) {
      const t = await docTiff(file);
      const g = t.muc[0];
      src = { kieu: "tiff", W: g.w, H: g.h, muc: t.muc, blob: file, tags: t.tags };
      if (kem && kem.ovr) {                              // overview ngoài (QGIS / GDAL: anh.tif.ovr)
        try {
          const o = await docTiff(kem.ovr);
          const them = o.muc.filter((m) => m.w < g.w && m.spp === g.spp);
          src.muc = src.muc.concat(them).sort((a, b) => b.w - a.w);
          src.ovr = them.length;
        } catch (e) { ctx.h.toast(`Không đọc được ${kem.ovr.name}: ${e.message} — mở ảnh không có overview`, 5000); }
      }
    } else src = await moAnhThuong(file);
    src.id = "ab" + (++demLop);
    const g0 = src.muc[0];
    let aff = null, nguonToaDo = "";
    if (kem && kem.world) { aff = docWorld(await kem.world.text()); nguonToaDo = kem.world.name; }
    else if (laTiff) { aff = affineTiff(src.tags); nguonToaDo = "GeoTIFF"; }
    if (!aff) throw new Error("Ảnh chưa có toạ độ — chọn cùng lúc file ảnh và file world cùng tên (.tfw cho .tif, .jgw cho .jpg, .pgw cho .png)");
    const goiY = doanCrs(laTiff ? geoKeys(src.tags) : {}, kem && kem.prj ? await kem.prj.text() : "");
    if (goiY.loi) throw new Error(goiY.loi);
    const goc = [[0, 0], [src.W, 0], [src.W, src.H], [0, src.H]].map(([c, r]) => [aff[0] + aff[1] * c + aff[2] * r, aff[3] + aff[4] * c + aff[5] * r]);
    const ext = [Math.min(...goc.map((p) => p[0])), Math.min(...goc.map((p) => p[1])), Math.max(...goc.map((p) => p[0])), Math.max(...goc.map((p) => p[1]))];
    const crsDoan = goiY.crs || doanTuPhamVi(ext);
    const kichThuoc = `${src.W.toLocaleString("vi-VN")} × ${src.H.toLocaleString("vi-VN")} điểm ảnh` +
      (src.kieu === "tiff" ? ` · ${src.muc.length > 1 ? (src.muc.length - 1) + " mức overview" + (src.ovr ? " (file .ovr)" : "") : "không có overview"}` : "");
    const opt = await ctx.hoiHeToaDo(ten, null, { ext, crs: crsDoan, lon0: goiY.lon0,
      moTa: `Ảnh ${kichThuoc}. Toạ độ lấy từ ${nguonToaDo}. ${goiY.moTa || ""}` });
    if (!opt) { if (src.bmp) src.bmp.close(); return null; }

    // hàm đổi: kinh/vĩ độ → điểm ảnh gốc (cột, hàng)
    const det = aff[1] * aff[5] - aff[2] * aff[4];
    const nghich = (X, Y) => { const dx = X - aff[0], dy = Y - aff[3]; return [(aff[5] * dx - aff[2] * dy) / det, (-aff[4] * dx + aff[1] * dy) / det]; };
    const VN = root.VN;
    let toPx, toLonLat;
    if (opt.crs === "wgs84") { toPx = (lon, lat) => nghich(lon, lat); toLonLat = (X, Y) => [X, Y]; }
    else {
      const dao = opt.crs === "vn2000-dao", l0 = opt.lon0;
      toPx = (lon, lat) => { const [xb, yd] = VN.wgs84ToVn2000(lat, lon, 0, l0); return dao ? nghich(xb, yd) : nghich(yd, xb); };
      toLonLat = (X, Y) => { const [la, lo] = dao ? VN.vn2000ToWgs84(X, Y, 0, l0) : VN.vn2000ToWgs84(Y, X, 0, l0); return [lo, la]; };
    }
    // khung bao ảnh (mỗi cạnh 8 đoạn) theo WGS84
    const vien = [];
    for (let s = 0; s < 4; s++) for (let t = 0; t < 8; t++) {
      const [c0, r0] = [[0, 0], [src.W, 0], [src.W, src.H], [0, src.H]][s], [c1, r1] = [[src.W, 0], [src.W, src.H], [0, src.H], [0, 0]][s];
      const c = c0 + (c1 - c0) * t / 8, r = r0 + (r1 - r0) * t / 8;
      vien.push(toLonLat(aff[0] + aff[1] * c + aff[2] * r, aff[3] + aff[4] * c + aff[5] * r));
    }
    vien.push(vien[0]);
    const bb = [Math.min(...vien.map((p) => p[0])), Math.min(...vien.map((p) => p[1])), Math.max(...vien.map((p) => p[0])), Math.max(...vien.map((p) => p[1]))];
    if (!(bb[0] > -180 && bb[2] < 180 && bb[1] > -85 && bb[3] < 85)) throw new Error("Toạ độ ảnh không hợp lệ — kiểm tra hệ toạ độ / kinh tuyến trục");
    // độ phân giải mặt đất (m/điểm ảnh) → mức zoom tối đa / tối thiểu
    const latC = (bb[1] + bb[3]) / 2, cosL = Math.cos((latC * Math.PI) / 180);
    let gsd = Math.sqrt(Math.abs(det));
    if (opt.crs === "wgs84") gsd *= 111320 * Math.sqrt(cosL);
    const zMax = Math.max(0, Math.min(24, Math.ceil(Math.log2((156543.034 * cosL) / gsd))));
    const thoNhat = gsd * (src.W / src.muc[src.muc.length - 1].w);
    // mỗi ô bản đồ đọc tối đa ~2048 điểm ảnh của mức thô nhất (ảnh dạng dải không overview: 1024) → dưới mức zoom này chỉ vẽ khung
    const gh = src.kieu === "tiff" && src.muc.length === 1 && !src.muc[0].tiled ? 1024 : 2048;
    const zMin = Math.max(0, Math.min(zMax, Math.ceil(Math.log2((156543.034 * cosL * 256) / (thoNhat * gh)))));

    const lop = { id: src.id, src, toPx, ten };
    DS.set(src.id, lop);
    dangKyGiaoThuc();
    const map = ctx.map, id = src.id;
    map.addSource(id, { type: "raster", tiles: [`anhbay://${id}/{z}/{x}/{y}`], tileSize: 256, minzoom: 0, maxzoom: zMax,
      bounds: bb, attribution: `Ảnh: ${ctx.h.escapeHtml(ten)} (file trên máy)` });
    const lopIds = map.getStyle().layers.map((l) => l.id);
    const truoc = ["nen-ranh-tinh"].find((x) => lopIds.includes(x));
    map.addLayer({ id: id + "-anh", type: "raster", source: id, minzoom: zMin, paint: { "raster-fade-duration": 0 } }, truoc);
    map.addSource(id + "-v", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: vien } } });
    map.addLayer({ id: id + "-vien", type: "line", source: id + "-v",
      paint: { "line-color": "#ff7a00", "line-width": 1.5, "line-dasharray": [3, 2], "line-opacity": ["interpolate", ["linear"], ["zoom"], zMin, 1, zMin + 1, 0.35] } });

    const tenHe = opt.crs === "wgs84" ? "WGS84" : `VN-2000 KTT ${opt.lon0}°`;
    return {
      id, ten, bb, zMin,
      loai: `${src.kieu === "tiff" ? (kem && kem.world ? "TIFF + world" : "GeoTIFF") : "Ảnh + world"} · ${kichThuoc} · ${(gsd * 100).toFixed(gsd < 1 ? 1 : 0)} cm/điểm ảnh · ${tenHe}`,
      hien(v) { for (const s of ["-anh", "-vien"]) if (map.getLayer(id + s)) map.setLayoutProperty(id + s, "visibility", v ? "visible" : "none"); },
      datDoRo(v) { if (map.getLayer(id + "-anh")) map.setPaintProperty(id + "-anh", "raster-opacity", v); },
      go() {
        for (const s of ["-anh", "-vien"]) if (map.getLayer(id + s)) map.removeLayer(id + s);
        for (const s of ["", "-v"]) if (map.getSource(id + s)) map.removeSource(id + s);
        DS.delete(id);
        for (const k of [...DEM.keys()]) if (k.startsWith(id + ":")) DEM.delete(k);
        if (src.bmp) src.bmp.close();
      },
    };
  }

  Object.assign(root.VN, { anhBayMo: mo, abDocTiff: docTiff, abDocWorld: docWorld, abDoanCrs: doanCrs, abGeoKeys: geoKeys,
    abAffineTiff: affineTiff, abLzw: lzw, abPackbits: packbits, abDoanTuPhamVi: doanTuPhamVi,
    abDocCuaSo: (src, li, x0, y0, x1, y1) => (src.kieu === "anh" ? docCuaSoAnh(src, li, x0, y0, x1, y1) : docCuaSoTiff(src, li, x0, y0, x1, y1)),
    abVeO: (id, z, x, y) => veO(DS.get(id), z, x, y) });
})(typeof window !== "undefined" ? window : globalThis);
