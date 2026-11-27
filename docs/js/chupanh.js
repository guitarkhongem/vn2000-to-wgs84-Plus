/*
 * Chụp ảnh có toạ độ (như ứng dụng "GPS camera"): chụp bằng camera điện thoại (hoặc chọn ảnh có sẵn),
 * lấy vị trí — GPS ghi trong ảnh nếu có, nếu không thì vị trí thiết bị lúc chụp — rồi in lên ảnh:
 * thời gian, toạ độ WGS84, toạ độ VN-2000 (đổi bằng đúng hàm của ứng dụng VN.wgs84ToVn2000), tỉnh, độ chính
 * xác, ghi chú. Ảnh lưu ra kèm EXIF GPS (Google Photos, Google Earth, QGIS… đọc được vị trí).
 * Ảnh chỉ xử lý trên máy, không gửi đi đâu.
 *
 * Phần thuần (đọc / ghi EXIF, dòng chữ in lên ảnh) chạy được trong Node để kiểm thử.
 */
(function (root) {
  "use strict";
  root.VN = root.VN || {};

  // ===================================================================== EXIF: đọc GPS + thời gian từ JPEG
  function docExif(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length < 4 || u8[0] !== 0xff || u8[1] !== 0xd8) return null;
    let o = 2;
    while (o + 4 <= u8.length && u8[o] === 0xff) {
      const mk = u8[o + 1], len = dv.getUint16(o + 2);
      if (mk === 0xda || mk === 0xd9) break;
      if (mk === 0xe1 && u8[o + 4] === 0x45 && u8[o + 5] === 0x78 && u8[o + 6] === 0x69 && u8[o + 7] === 0x66) {
        const t = o + 10, le = u8[t] === 0x49;
        const u16 = (p) => dv.getUint16(t + p, le), u32 = (p) => dv.getUint32(t + p, le);
        const doc = (ifd) => {
          const out = {}, n = u16(ifd);
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12, tag = u16(e), typ = u16(e + 2), cnt = u32(e + 4);
            const sz = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8][typ] * cnt, p = sz > 4 ? u32(e + 8) : e + 8;
            if (typ === 2) out[tag] = new TextDecoder("latin1").decode(u8.subarray(t + p, t + p + cnt)).replace(/\0.*$/s, "");
            else if (typ === 5) { const v = []; for (let k = 0; k < cnt; k++) { const d = u32(p + 8 * k + 4); v.push(d ? u32(p + 8 * k) / d : 0); } out[tag] = v; }
            else if (typ === 3) out[tag] = u16(p);
            else if (typ === 4) out[tag] = u32(p);
            else if (typ === 1) out[tag] = u8[t + p];
          }
          return out;
        };
        try {
          const i0 = doc(u32(4)), r = {};
          const ex = i0[0x8769] ? doc(i0[0x8769]) : {};
          const tg = ex[0x9003] || i0[0x0132];
          if (tg) { const m = /(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(tg); if (m) r.time = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]); }
          if (i0[0x8825]) {
            const g = doc(i0[0x8825]), dms = (a) => a && a.length === 3 ? a[0] + a[1] / 60 + a[2] / 3600 : NaN;
            const lat = dms(g[2]) * (g[1] === "S" ? -1 : 1), lon = dms(g[4]) * (g[3] === "W" ? -1 : 1);
            if (isFinite(lat) && isFinite(lon) && (lat || lon)) {
              r.lat = lat; r.lon = lon;
              if (g[6]) r.alt = g[6][0] * (g[5] === 1 ? -1 : 1);
            }
          }
          return r;
        } catch (_) { return null; }
      }
      o += 2 + len;
    }
    return null;
  }

  // ===================================================================== EXIF: ghi GPS + thời gian vào JPEG
  function exifTime(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function ghiExif(jpeg, info) {
    // info: { lat, lon, alt?, time: Date, mota? (ASCII) } → JPEG mới có đoạn APP1 Exif ngay sau SOI
    const u8 = new Uint8Array(jpeg);
    if (u8[0] !== 0xff || u8[1] !== 0xd8) return u8;
    const ascii = (s) => { const b = Array.from(String(s), (c) => { const k = c.charCodeAt(0); return k < 128 ? k : 63; }); b.push(0); return b; };
    const rat = (v, den) => [Math.round(v * den), den];
    const dms = (v) => { v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = (v - d - m / 60) * 3600; return [[d, 1], [m, 1], rat(s, 10000)]; };
    // mục IFD: [tag, kiểu, giá trị] — kiểu 1 BYTE, 2 ASCII, 4 LONG, 5 RATIONAL ([[tử, mẫu]…])
    const ifds = { gps: [], exif: [], i0: [] };
    const tg = exifTime(info.time || new Date());
    ifds.exif.push([0x9003, 2, ascii(tg)]);
    if (isFinite(info.lat) && isFinite(info.lon)) {
      ifds.gps.push([0x0000, 1, [2, 3, 0, 0]], [0x0001, 2, ascii(info.lat < 0 ? "S" : "N")], [0x0002, 5, dms(info.lat)],
        [0x0003, 2, ascii(info.lon < 0 ? "W" : "E")], [0x0004, 5, dms(info.lon)]);
      if (isFinite(info.alt)) ifds.gps.push([0x0005, 1, [info.alt < 0 ? 1 : 0]], [0x0006, 5, [rat(Math.abs(info.alt), 100)]]);
      ifds.gps.push([0x0012, 2, ascii("WGS-84")]);
    }
    if (info.mota) ifds.i0.push([0x010e, 2, ascii(info.mota)]);
    ifds.i0.push([0x0131, 2, ascii("VN2000-WGS84 Plus")], [0x0132, 2, ascii(tg)], [0x8769, 4, [0]]);
    if (ifds.gps.length) ifds.i0.push([0x8825, 4, [0]]);
    // dựng TIFF (little-endian): header 8 byte, rồi IFD0, Exif IFD, GPS IFD, mỗi IFD kèm vùng dữ liệu của nó
    const out = [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0];
    const w16 = (a, o, v) => { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; };
    const w32 = (a, o, v) => { a[o] = v & 255; a[o + 1] = (v >>> 8) & 255; a[o + 2] = (v >>> 16) & 255; a[o + 3] = (v >>> 24) & 255; };
    const viet = (list) => {
      const start = out.length, n = list.length;
      const head = new Array(2 + n * 12 + 4).fill(0), data = [];
      let dataOff = start + head.length;
      w16(head, 0, n);
      list.sort((a, b) => a[0] - b[0]).forEach(([tag, typ, val], i) => {
        const e = 2 + i * 12;
        let bytes = [], cnt;
        if (typ === 1 || typ === 2) { bytes = val; cnt = val.length; }
        else if (typ === 4) { cnt = val.length; val.forEach((v) => { const b = [0, 0, 0, 0]; w32(b, 0, v); bytes.push(...b); }); }
        else if (typ === 5) { cnt = val.length; val.forEach(([a, b2]) => { const b = new Array(8).fill(0); w32(b, 0, a); w32(b, 4, b2); bytes.push(...b); }); }
        w16(head, e, tag); w16(head, e + 2, typ); w32(head, e + 4, cnt);
        if (bytes.length <= 4) bytes.forEach((b, k) => { head[e + 8 + k] = b; });
        else { w32(head, e + 8, dataOff + data.length); data.push(...bytes); if (data.length & 1) data.push(0); }
      });
      out.push(...head, ...data);
      return { start, entryOf: (tag) => start + 2 + list.findIndex((x) => x[0] === tag) * 12 + 8 };
    };
    const i0 = viet(ifds.i0);
    const ex = viet(ifds.exif);
    w32(out, i0.entryOf(0x8769), ex.start);
    if (ifds.gps.length) { const gp = viet(ifds.gps); w32(out, i0.entryOf(0x8825), gp.start); }
    const app1Len = 2 + 6 + out.length;
    const seg = [0xff, 0xe1, (app1Len >> 8) & 255, app1Len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...out];
    const res = new Uint8Array(u8.length + seg.length);
    res.set(u8.subarray(0, 2), 0); res.set(seg, 2); res.set(u8.subarray(2), 2 + seg.length);
    return res;
  }

  // ===================================================================== dòng chữ in lên ảnh
  function gioVN(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function doPhut(v) {                                // 106.25 → 106°15'
    const d = Math.floor(v), m = Math.round((v - d) * 60);
    return m ? `${d}°${String(m).padStart(2, "0")}'` : `${d}°`;
  }
  function soVN(v, n) {                               // 1839936.234 → "1.839.936,23"
    return Number(v).toLocaleString("vi-VN", { minimumFractionDigits: n, maximumFractionDigits: n });
  }
  // pos: { lat, lon, acc?, alt?, nguon }, opt: { lon0, tinh, ghichu, time }
  function dongChu(pos, opt) {
    const L = [];
    if (pos && isFinite(pos.lat)) {
      L.push(`WGS84: ${pos.lat.toFixed(7)}, ${pos.lon.toFixed(7)}` + (isFinite(pos.acc) ? `  (±${Math.round(pos.acc)} m)` : ""));
      if (isFinite(opt.lon0) && root.VN.wgs84ToVn2000) {
        const [x, y] = root.VN.wgs84ToVn2000(pos.lat, pos.lon, 0, opt.lon0);
        L.push(`VN-2000 KTT ${doPhut(opt.lon0)}: X = ${soVN(x, 2)}  Y = ${soVN(y, 2)}`);
      }
      if (isFinite(pos.alt)) L.push(`Độ cao: ${soVN(pos.alt, 1)} m`);
      if (opt.tinh) L.push(opt.tinh);
    } else L.push("Chưa có vị trí (chưa bật / chưa cho phép định vị)");
    L.push(gioVN(opt.time || new Date()) + (pos && pos.nguon ? `  · ${pos.nguon}` : ""));
    if (opt.ghichu) String(opt.ghichu).split(/\r?\n/).filter(Boolean).forEach((s) => L.push(s));
    return L;
  }

  Object.assign(root.VN, { docExif, ghiExif, exifTime, dongChu, doPhut });

  if (typeof document === "undefined") return;

  // ===================================================================== giao diện
  const S = { map: null, h: null, anh: null, pos: null, time: null, file: null, ds: [], cho: null };
  const MAX = 2560;                                   // cạnh dài tối đa của ảnh lưu (px)

  function init(map, helpers) {
    S.map = map; S.h = helpers;
    const inp = document.getElementById("ca-input");
    // nút máy ảnh trên bản đồ (dưới nút định vị)
    class NutChup {
      onAdd() {
        const d = document.createElement("div");
        d.className = "maplibregl-ctrl maplibregl-ctrl-group";
        d.innerHTML = `<button type="button" class="ca-nut" title="Chụp ảnh có toạ độ" aria-label="Chụp ảnh có toạ độ">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg></button>`;
        d.querySelector("button").addEventListener("click", batDau);
        return d;
      }
      onRemove() {}
    }
    map.addControl(new NutChup(), "top-right");
    const nut2 = document.getElementById("geo-chup");
    if (nut2) nut2.addEventListener("click", batDau);
    inp.addEventListener("change", () => { const f = inp.files[0]; inp.value = ""; if (f) xuLy(f); });
    document.getElementById("ca-ghichu").addEventListener("input", ve);
    document.getElementById("ca-luu").addEventListener("click", luu);
    document.getElementById("ca-chiase").addEventListener("click", chiaSe);
    document.getElementById("ca-lai").addEventListener("click", () => { document.getElementById("ca-dlg").close(); batDau(); });
    document.getElementById("ca-dong").addEventListener("click", () => document.getElementById("ca-dlg").close());
    document.getElementById("ca-chiase").hidden = !(navigator.canShare && navigator.share);
  }

  // Bấm nút: mở camera ngay (phải trong thao tác bấm), đồng thời xin vị trí mới
  function batDau() {
    S.cho = layViTri();
    document.getElementById("ca-input").click();
  }
  function layViTri() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy,
          alt: p.coords.altitude == null ? NaN : p.coords.altitude, nguon: "vị trí thiết bị" }),
        () => resolve(null), { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
    });
  }

  async function xuLy(file) {
    S.file = file;
    const buf = await file.arrayBuffer();
    const ex = docExif(buf);
    let pos = null, time = new Date();
    if (ex && isFinite(ex.lat)) { pos = { lat: ex.lat, lon: ex.lon, alt: ex.alt, nguon: "GPS trong ảnh" }; if (ex.time) time = ex.time; }
    else {
      S.h.toast("Đang lấy vị trí…");
      pos = await Promise.race([S.cho || layViTri(), new Promise((r) => setTimeout(() => r(null), 20000))]);
      if (!pos) { const g = S.h.viTri && S.h.viTri(); if (g) pos = { ...g, nguon: "vị trí định vị gần nhất" }; }
      if (ex && ex.time && Date.now() - ex.time.getTime() > 10 * 60 * 1000) {
        // ảnh cũ chọn từ thư viện, không có GPS: không gán vị trí hiện tại cho ảnh cũ
        pos = null; time = ex.time;
        S.h.toast("Ảnh không có GPS và không chụp lúc này — không gán được vị trí");
      }
    }
    S.pos = pos; S.time = time;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch (_) { S.h.toast("Không đọc được ảnh"); URL.revokeObjectURL(url); return; }
    S.anh = img;                                      // trình duyệt tự xoay ảnh theo EXIF khi vẽ
    document.getElementById("ca-ghichu").value = "";
    ve();
    document.getElementById("ca-dlg").showModal();
    if (!pos) S.h.toast("Chưa có vị trí — bật định vị (nút ◎) và cho phép trình duyệt truy cập vị trí");
  }

  function lon0() { try { return S.h.getLon0(); } catch (_) { return NaN; } }

  function ve() {
    const img = S.anh; if (!img) return;
    const cv = document.getElementById("ca-canvas"), ctx = cv.getContext("2d");
    const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
    cv.width = W; cv.height = H;
    ctx.drawImage(img, 0, 0, W, H);
    const pos = S.pos;
    const tinh = pos && S.h.tinhTai ? S.h.tinhTai(pos.lon, pos.lat) : "";
    const lines = dongChu(pos, { lon0: lon0(), tinh, time: S.time, ghichu: document.getElementById("ca-ghichu").value });
    const fs = Math.max(14, Math.round(Math.min(W, H) / 32)), lh = Math.round(fs * 1.32), pad = Math.round(fs * 0.7);
    ctx.font = `600 ${fs}px Arial, "Segoe UI", sans-serif`;
    const bh = lines.length * lh + pad * 2 + Math.round(fs * 0.9);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, H - bh, W, bh);
    ctx.fillStyle = "#fff"; ctx.textBaseline = "top";
    lines.forEach((s, i) => {
      let t = s;
      while (ctx.measureText(t).width > W - pad * 2 && t.length > 4) t = t.slice(0, -2);
      ctx.fillText(t === s ? s : t + "…", pad, H - bh + pad + i * lh);
    });
    ctx.font = `${Math.round(fs * 0.62)}px Arial, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("VN2000-WGS84 · toạ độ GPS của thiết bị, chỉ để tham khảo", pad, H - pad - Math.round(fs * 0.62));
  }

  function tenFile() {
    const d = S.time || new Date(), p = (n) => String(n).padStart(2, "0");
    return `anh_toado_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
  }
  async function taoJpeg() {
    const cv = document.getElementById("ca-canvas");
    const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.9));
    const pos = S.pos, gc = document.getElementById("ca-ghichu").value;
    const out = ghiExif(await blob.arrayBuffer(), { lat: pos ? pos.lat : NaN, lon: pos ? pos.lon : NaN, alt: pos ? pos.alt : NaN,
      time: S.time, mota: gc ? gc.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D") : "" });
    return new File([out], tenFile(), { type: "image/jpeg" });
  }

  async function luu() {
    const f = await taoJpeg();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    danhDau(f);
    S.h.toast("Đã lưu " + f.name);
  }
  async function chiaSe() {
    const f = await taoJpeg();
    try {
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: f.name }); danhDau(f); }
      else S.h.toast("Thiết bị không hỗ trợ chia sẻ ảnh — dùng nút Lưu ảnh");
    } catch (e) { if (e && e.name !== "AbortError") S.h.toast("Không chia sẻ được"); }
  }

  // Đánh dấu ảnh đã lưu lên bản đồ (biểu tượng máy ảnh, bấm xem ảnh nhỏ)
  function danhDau(f) {
    const pos = S.pos; if (!pos || !isFinite(pos.lat)) return;
    if (S.ds.some((x) => x.ten === f.name)) return;
    const url = URL.createObjectURL(f), e = S.h.escapeHtml;
    const el = document.createElement("div");
    el.className = "ca-mk"; el.title = f.name; el.textContent = "📷";
    const pop = new root.maplibregl.Popup({ offset: 14, maxWidth: "260px" }).setHTML(
      `<div class="ca-pop"><img src="${url}" alt=""><div><b>${e(gioVN(S.time || new Date()))}</b></div>
       <div>${pos.lat.toFixed(7)}, ${pos.lon.toFixed(7)}</div><a href="${url}" download="${e(f.name)}">Tải ảnh</a></div>`);
    const mk = new root.maplibregl.Marker({ element: el }).setLngLat([pos.lon, pos.lat]).setPopup(pop).addTo(S.map);
    S.ds.push({ ten: f.name, mk });
  }

  root.VN.chupAnhInit = init;
})(typeof window !== "undefined" ? window : globalThis);
