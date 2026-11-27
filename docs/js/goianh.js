/*
 * Gói ảnh cho điện thoại — file .pmtiles (PMTiles phiên bản 3).
 *
 *   Xuất (nên làm trên máy tính): một hoặc nhiều ảnh trực giao đang mở (anhbay.js; nhiều ảnh gộp thành 1 gói, chỗ
 *   giáp / chồng nhau ghép liền, ảnh sau nằm trên) được vẽ sẵn thành các ô bản đồ 256 px
 *   (Web Mercator, WGS84) ở mức zoom chi tiết nhất bằng đúng hàm vẽ ô của ứng dụng — đổi toạ độ bằng
 *   VN.wgs84ToVn2000 (thuật toán của ứng dụng, docs/js/converter.js), vẽ song song trên các worker; các mức zoom
 *   nhỏ hơn ghép từ 4 ô con. Ô ảnh mã hoá WebP (trình duyệt không mã hoá được WebP → PNG), ô trống bỏ qua.
 *   Mở (điện thoại): đọc thư mục ô bằng Blob.slice rồi lấy thẳng ô ảnh — không giải mã TIFF, không đổi toạ độ.
 *
 * Định dạng theo đặc tả PMTiles v3 của Protomaps: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
 * (mã ô Hilbert, thư mục varint nén gzip, thư mục gốc ≤ 16 KB đầu file, thư mục lá). Bộ đọc / ghi tự viết, không
 * thư viện ngoài; file xuất ra đọc được bằng các công cụ PMTiles khác (thư viện pmtiles, GDAL ≥ 3.8…).
 */
(function (root) {
  "use strict";
  const VN = (root.VN = root.VN || {});

  // ======================================================================= mã ô (TileID) theo đường Hilbert
  // giống zxyToTileId của thư viện pmtiles (js/src/index.ts) — mục 3 của đặc tả
  function xoay(n, x, y, rx, ry) {
    if (ry === 0) { if (rx !== 0) return [n - 1 - y, n - 1 - x]; return [y, x]; }
    return [x, y];
  }
  function maO(z, x, y) {
    if (z > 26) throw new Error("Mức zoom vượt 26");
    if (x >= 1 << z || y >= 1 << z || x < 0 || y < 0) throw new Error("Ô nằm ngoài mức zoom");
    let acc = ((1 << z) * (1 << z) - 1) / 3, a = z - 1, tx = x, ty = y;
    for (let s = 1 << a; s > 0; s >>= 1) {
      const rx = tx & s, ry = ty & s;
      acc += ((3 * rx) ^ ry) * (1 << a);
      [tx, ty] = xoay(s, tx, ty, rx, ry);
      a--;
    }
    return acc;
  }

  // ======================================================================= thư mục ô (mục 2 của đặc tả)
  function vietVarint(o, v) {
    while (v >= 128) { o.push((v % 128) | 128); v = Math.floor(v / 128); }
    o.push(v);
  }
  // entries: [{ tileId, offset, length, runLength }] đã sắp theo tileId
  function vietDir(entries) {
    const o = [];
    vietVarint(o, entries.length);
    let truoc = 0;
    for (const e of entries) { vietVarint(o, e.tileId - truoc); truoc = e.tileId; }
    for (const e of entries) vietVarint(o, e.runLength);
    for (const e of entries) vietVarint(o, e.length);
    entries.forEach((e, i) => {
      if (i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length) vietVarint(o, 0);
      else vietVarint(o, e.offset + 1);
    });
    return new Uint8Array(o);
  }
  function docVarint(p) {
    let v = 0, m = 1, b;
    do {
      if (p.i >= p.u.length) throw new Error("Thư mục PMTiles bị cắt cụt");
      b = p.u[p.i++]; v += (b & 127) * m; m *= 128;
    } while (b & 128);
    return v;
  }
  function docDir(u) {
    const p = { u, i: 0 }, n = docVarint(p), e = new Array(n);
    let id = 0;
    for (let i = 0; i < n; i++) { id += docVarint(p); e[i] = { tileId: id, offset: 0, length: 0, runLength: 1 }; }
    for (let i = 0; i < n; i++) e[i].runLength = docVarint(p);
    for (let i = 0; i < n; i++) e[i].length = docVarint(p);
    for (let i = 0; i < n; i++) { const v = docVarint(p); e[i].offset = v === 0 && i > 0 ? e[i - 1].offset + e[i - 1].length : v - 1; }
    return e;
  }
  // mục có tileId lớn nhất ≤ id (giống findTile của thư viện pmtiles); runLength 0 = trỏ tới thư mục lá
  function timO(e, id) {
    let m = 0, n = e.length - 1;
    while (m <= n) {
      const k = (n + m) >> 1, d = id - e[k].tileId;
      if (d > 0) m = k + 1; else if (d < 0) n = k - 1; else return e[k];
    }
    if (n >= 0 && (e[n].runLength === 0 || id - e[n].tileId < e[n].runLength)) return e[n];
    return null;
  }

  // ---------- nén gzip (CompressionStream của trình duyệt) ----------
  const quaLuong = async (u8, luong) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(luong)).arrayBuffer());
  const nen = (u8) => quaLuong(u8, new CompressionStream("gzip"));
  function moNen(u8, ic) {
    if (ic === 0 || ic === 1) return u8;
    if (ic === 2) return quaLuong(u8, new DecompressionStream("gzip"));
    throw new Error("Thư mục gói .pmtiles nén kiểu brotli / zstd — chưa hỗ trợ (cần gzip hoặc không nén)");
  }

  // thư mục gốc phải ≤ 16257 byte (16384 − 127 byte đầu file); lớn hơn → chia thư mục lá (cách làm của go-pmtiles)
  async function taoThuMuc(entries) {
    const goc = await nen(vietDir(entries));
    if (goc.length <= 16257) return { goc, la: new Uint8Array(0), soLa: 0 };
    for (let co = 4096; ; co = Math.ceil(co * 1.2)) {
      const re = [], phan = [];
      let off = 0;
      for (let i = 0; i < entries.length; i += co) {
        const p = await nen(vietDir(entries.slice(i, i + co)));
        re.push({ tileId: entries[i].tileId, offset: off, length: p.length, runLength: 0 });
        phan.push(p); off += p.length;
      }
      const g = await nen(vietDir(re));
      if (g.length <= 16257) {
        const la = new Uint8Array(off); let o = 0;
        for (const p of phan) { la.set(p, o); o += p.length; }
        return { goc: g, la, soLa: phan.length };
      }
    }
  }

  // ---------- 127 byte đầu file (mục 1 của đặc tả) ----------
  function taoDau(d) {
    const u = new Uint8Array(127), v = new DataView(u.buffer);
    u.set([0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73], 0); u[7] = 3;      // "PMTiles", phiên bản 3
    const q = (o, x) => v.setBigUint64(o, BigInt(x), true);
    q(8, d.gocOff); q(16, d.gocLen); q(24, d.metaOff); q(32, d.metaLen); q(40, d.laOff); q(48, d.laLen);
    q(56, d.dataOff); q(64, d.dataLen); q(72, d.soO); q(80, d.soO); q(88, d.soO);
    u[96] = 1;                // clustered: dữ liệu ô xếp theo tileId
    u[97] = 2;                // thư mục + metadata nén gzip
    u[98] = 1;                // ô ảnh không nén thêm
    u[99] = d.tt;             // 2 PNG, 4 WebP
    u[100] = d.minZ; u[101] = d.maxZ;
    const e7 = (o, x) => v.setInt32(o, Math.round(x * 1e7), true);
    e7(102, d.bb[0]); e7(106, d.bb[1]); e7(110, d.bb[2]); e7(114, d.bb[3]);
    u[118] = d.cz; e7(119, d.c[0]); e7(123, d.c[1]);
    return u;
  }
  function docDau(u) {
    if (u.length < 127 || String.fromCharCode(...u.subarray(0, 7)) !== "PMTiles") throw new Error("Không phải file PMTiles");
    if (u[7] !== 3) throw new Error(`Gói PMTiles phiên bản ${u[7]} — cần phiên bản 3`);
    const v = new DataView(u.buffer, u.byteOffset, 127), q = (o) => Number(v.getBigUint64(o, true)), e7 = (o) => v.getInt32(o, true) / 1e7;
    return { gocOff: q(8), gocLen: q(16), metaOff: q(24), metaLen: q(32), laOff: q(40), laLen: q(48), dataOff: q(56), dataLen: q(64),
      soO: q(72), ic: u[97], tc: u[98], tt: u[99], minZ: u[100], maxZ: u[101], bb: [e7(102), e7(106), e7(110), e7(114)], cz: u[118], c: [e7(119), e7(123)] };
  }

  // ======================================================================= xuất gói ảnh
  const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const lat2y = (lat, z) => { const s = Math.sin((lat * Math.PI) / 180); return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z); };
  // các ô mức z phủ khung bao bb = [tây, nam, đông, bắc]
  function khoang(bb, z) {
    const n = 2 ** z, k = (v) => Math.max(0, Math.min(n - 1, v));
    const x0 = k(lon2x(bb[0], z)), x1 = k(lon2x(bb[2], z)), y0 = k(lat2y(bb[3], z)), y1 = k(lat2y(bb[1], z));
    return { x0, x1, y0, y1, n: (x1 - x0 + 1) * (y1 - y0 + 1) };
  }
  // mức nhỏ nhất của gói: cả ảnh nằm gọn trong 1 ô (tối đa 16 mức dưới mức chi tiết nhất)
  function mucThap(bb, zHi) { let z = zHi; while (z > 0 && zHi - z < 16 && khoang(bb, z).n > 1) z--; return z; }
  let dd = null;
  async function dinhDang() {
    if (dd) return dd;
    dd = { mime: "image/png", tt: 2, ten: "PNG" };
    try {
      const c = new OffscreenCanvas(2, 2); c.getContext("2d").fillRect(0, 0, 1, 1);
      const b = await c.convertToBlob({ type: "image/webp", quality: 0.85 });
      if (b.type === "image/webp") dd = { mime: "image/webp", tt: 4, ten: "WebP" };
    } catch (_) { /* giữ PNG */ }
    return dd;
  }
  const loiHuy = () => new DOMException("huỷ", "AbortError");
  // chạy fn cho từng phần tử, tối đa C việc cùng lúc
  async function chay(ds, C, fn, signal) {
    let i = 0;
    const mot = async () => { while (i < ds.length) { if (signal && signal.aborted) throw loiHuy(); const k = i++; await fn(ds[k], k); } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(C, ds.length)) }, mot));
  }
  const songSong = () => Math.max(1, VN.abSoLuong ? VN.abSoLuong() : 0);

  const cmDiem = (bb, z) => ((156543.034 * Math.cos((((bb[1] + bb[3]) / 2) * Math.PI) / 180)) / 2 ** z) * 100;
  const boDuoi = (t) => t.replace(/\.[^.]+$/, "");
  // tên gói: 1 ảnh → tên ảnh; nhiều ảnh → phần đầu chung của tên (vd "TC" từ TC-0-0 … TC-2-1) + số ảnh
  function tenGoi(Ls) {
    const ds = Ls.map((L) => boDuoi(L.ten));
    if (ds.length === 1) return ds[0];
    let p = ds[0];
    for (const t of ds) while (p && !t.startsWith(p)) p = p.slice(0, -1);
    p = p.replace(/[-_ .(]+$/, "");
    return (p.length >= 2 ? p : "goi_anh") + `_${ds.length}anh`;
  }
  // các ảnh đưa vào gói (thứ tự lớp trên bản đồ: ảnh sau nằm trên ảnh trước) + thông tin chung
  function gop(ids) {
    const Ls = [].concat(ids).map((id) => VN.abLop(id));
    if (!Ls.length || Ls.some((L) => !L)) throw new Error("Ảnh đã bị gỡ khỏi bản đồ");
    const bb = [Math.min(...Ls.map((L) => L.bb[0])), Math.min(...Ls.map((L) => L.bb[1])), Math.max(...Ls.map((L) => L.bb[2])), Math.max(...Ls.map((L) => L.bb[3]))];
    return { Ls, bb, ten: tenGoi(Ls), zMax: Math.max(...Ls.map((L) => L.zMax)), zMin: Math.max(...Ls.map((L) => L.zMin)), gsd: Math.min(...Ls.map((L) => L.gsd)) };
  }
  // các mức chi tiết nhất có thể chọn: từ mức zoom tối đa xuống, tối đa 4 mức, điểm ảnh ô ≤ 5 lần điểm ảnh gốc nét nhất,
  // không dưới mức zMin của ảnh nào (ảnh không có overview chỉ vẽ được từ mức đó trở lên)
  function cacMuc(T) {
    const ds = [];
    for (let z = T.zMax; z >= Math.max(0, T.zMin) && ds.length < 4; z--) { if (ds.length && cmDiem(T.bb, z) > 5 * T.gsd * 100) break; ds.push(z); }
    return ds;
  }
  // k×k ô rải đều trong khoảng r
  function mauO(r, k) {
    const ds = [], da = new Set();
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const x = r.x0 + Math.floor(((i + 0.5) * (r.x1 - r.x0 + 1)) / k), y = r.y0 + Math.floor(((j + 0.5) * (r.y1 - r.y0 + 1)) / k);
      if (!da.has(x + "/" + y)) { da.add(x + "/" + y); ds.push([x, y]); }
    }
    return ds;
  }
  // vẽ thử vài ô rải đều trên từng ảnh ở mỗi mức có thể chọn → tỉ lệ ô có ảnh, dung lượng trung bình, thời gian mỗi ô
  async function uocTinh(ids, signal) {
    const T = gop(ids);
    if (VN.abThuWorker) VN.abThuWorker();
    const d = await dinhDang(), muc = {}, cac = cacMuc(T), k = T.Ls.length === 1 ? 4 : T.Ls.length <= 4 ? 3 : 2;
    for (const z of cac) {
      const viec = [], anh = T.Ls.map((L) => ({ n: khoang(L.bb, z).n, mau: 0, co: 0, byte: 0 }));
      T.Ls.forEach((L, i) => { for (const [x, y] of mauO(khoang(L.bb, z), k)) { viec.push([i, x, y]); anh[i].mau++; } });
      const t0 = performance.now();
      await chay(viec, songSong() * 2, async ([i, x, y]) => {
        const b = await VN.abVe(T.Ls[i].id, z, x, y, { fmt: d.mime, signal });
        if (b) { anh[i].co++; anh[i].byte += b.byteLength; }
      }, signal);
      const msO = (performance.now() - t0) / viec.length;
      let nLa = 0, byte = 0;
      for (const a of anh) {
        const tyLe = a.co ? a.co / a.mau : 0.3, tb = a.co ? a.byte / a.co : 25000;
        nLa += a.n * tyLe; byte += a.n * tyLe * tb;
      }
      muc[z] = { nLa: Math.max(1, Math.round(nLa)), byte, msO };
    }
    return { T, L: T, dd: d, zMax: T.zMax, muc, cac };
  }
  // ước tính cho gói có mức chi tiết nhất zHi (các mức nhỏ hơn ≈ 1/3 số ô, mỗi ô nhiều chi tiết hơn)
  function uocMuc(u, zHi) {
    const m = u.muc[zHi] || u.muc[u.zMax], nLa = m.nLa;
    const byte = m.byte * 1.5;
    const giay = (nLa * m.msO * 1.2 + (nLa / 3) * (25 / songSong())) / 1000;
    const cm = cmDiem(u.T.bb, zHi);
    return { z: zHi, nLa, byte, giay, cm, tiLe: cm / (u.T.gsd * 100) };
  }

  // ids: 1 ảnh hoặc danh sách ảnh (gộp thành 1 gói; chỗ chồng nhau ảnh sau nằm trên)
  // o: { signal, tienDo(xong, tong, buoc, byte) } → { blob, soO, minZ, maxZ, byte, dinhDang, ten }
  async function xuat(ids, zHi, o = {}) {
    const T = gop(ids), Ls = T.Ls;
    if (VN.abThuWorker) VN.abThuWorker();
    const d = await dinhDang(), sig = o.signal, bao = o.tienDo || (() => {});
    const zLo = mucThap(T.bb, zHi), C = songSong() * 3, n = 2 ** zHi;
    // ô mức chi tiết nhất: hợp các ô phủ khung bao từng ảnh, mỗi ô nhớ những ảnh phủ nó
    const phu = new Map();
    Ls.forEach((L, i) => {
      const r = khoang(L.bb, zHi);
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const k = y * n + x, a = phu.get(k); if (a) a.push(i); else phu.set(k, [i]); }
    });
    const la = [];
    for (const [k, a] of phu) { const x = k % n, y = Math.floor(k / n); la.push([maO(zHi, x, y), x, y, a]); }
    phu.clear();
    la.sort((a, b) => a[0] - b[0]);                       // thứ tự Hilbert: ô kề nhau vẽ liền nhau → dùng lại mảnh ảnh đã giải mã
    const ra = [];                                        // [tileId, Blob]
    let xong = 0, tong = Math.round((la.length * 4) / 3), byte = 0;
    let con = new Map();
    await chay(la, C, async ([tid, x, y, a]) => {
      let b;
      if (a.length === 1) b = await VN.abVe(Ls[a[0]].id, zHi, x, y, { fmt: d.mime, signal: sig });
      else {                                              // ô ở chỗ giáp / chồng nhau của nhiều ảnh: vẽ từng ảnh (PNG) rồi chồng lên nhau
        const lop = (await Promise.all(a.map((i) => VN.abVe(Ls[i].id, zHi, x, y, { fmt: "image/png", signal: sig })))).filter(Boolean).map((p) => new Blob([p]));
        b = lop.length ? await VN.abGhep(lop, d.mime, sig, "chong") : null;
      }
      xong++;
      if (b) { const bl = new Blob([b]); con.set(y * n + x, bl); ra.push([tid, bl]); byte += bl.size; }
      bao(xong, tong, `vẽ ô mức ${zHi}`, byte);
    }, sig);
    for (let z = zHi - 1; z >= zLo; z--) {
      const nC = 2 ** (z + 1), nP = 2 ** z, cha = new Set();
      for (const k of con.keys()) { const x = k % nC, y = Math.floor(k / nC); cha.add(Math.floor(y / 2) * nP + Math.floor(x / 2)); }
      const ds = [...cha].sort((a, b) => a - b), moi = new Map();
      tong = xong + ds.length + Math.ceil(ds.length / 3);
      await chay(ds, C, async (kp) => {
        const x = kp % nP, y = Math.floor(kp / nP), g = (cx, cy) => con.get(cy * nC + cx) || null;
        const b = await VN.abGhep([g(2 * x, 2 * y), g(2 * x + 1, 2 * y), g(2 * x, 2 * y + 1), g(2 * x + 1, 2 * y + 1)], d.mime, sig);
        xong++;
        if (b) { const bl = new Blob([b]); moi.set(kp, bl); ra.push([maO(z, x, y), bl]); byte += bl.size; }
        bao(xong, tong, `ghép ô mức ${z}`, byte);
      }, sig);
      con = moi;
    }
    if (!ra.length) throw new Error("Ảnh không có điểm ảnh nào để xuất (toàn vùng trong suốt)");
    bao(xong, xong, "đang ghi file .pmtiles…", byte);
    ra.sort((a, b) => a[0] - b[0]);
    let off = 0;
    const ent = ra.map(([tid, bl]) => { const e = { tileId: tid, offset: off, length: bl.size, runLength: 1 }; off += bl.size; return e; });
    const { goc, la: thuMucLa } = await taoThuMuc(ent);
    const bb = T.bb, c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], ten = Ls.map((L) => L.ten).join(", ");
    const r7 = (v) => Math.round(v * 1e7) / 1e7, vien = (L) => L.vien.map((p) => [r7(p[0]), r7(p[1])]);
    const meta = await nen(new TextEncoder().encode(JSON.stringify({
      name: T.ten,
      description: `Ảnh trực giao ${ten} vẽ sẵn thành ô bản đồ (Web Mercator, WGS84) bằng ứng dụng Chuyển đổi VN-2000 ↔ WGS84 — đổi toạ độ bằng thuật toán VN-2000 của ứng dụng`,
      attribution: `Ảnh: ${ten}`,
      type: "overlay", version: "1.0.0", format: d.ten.toLowerCase(),
      minzoom: zLo, maxzoom: zHi, bounds: bb.map(r7), center: [r7(c[0]), r7(c[1]), Math.min(zHi, zLo + 3)],
      vn2000_nguon: ten, vn2000_so_anh: Ls.length, vn2000_he_toa_do_goc: [...new Set(Ls.map((L) => L.tenHe))].join("; "),
      vn2000_do_phan_giai_goc_cm: Math.round(T.gsd * 1000) / 10,
      ...(Ls.length === 1 ? { vn2000_vien: vien(Ls[0]) } : { vn2000_vien_ds: Ls.map(vien) }),
      vn2000_tao_luc: new Date().toISOString(), vn2000_ung_dung: "https://guitarkhongem.github.io/vn2000-to-wgs84-Plus/",
    })));
    const gocOff = 127, metaOff = gocOff + goc.length, laOff = metaOff + meta.length, dataOff = laOff + thuMucLa.length;
    const dau = taoDau({ gocOff, gocLen: goc.length, metaOff, metaLen: meta.length, laOff, laLen: thuMucLa.length, dataOff, dataLen: off,
      soO: ra.length, tt: d.tt, minZ: zLo, maxZ: zHi, bb, cz: Math.min(zHi, zLo + 3), c });
    const blob = new Blob([dau, goc, meta, thuMucLa, ...ra.map((x) => x[1])], { type: "application/octet-stream" });
    return { blob, soO: ra.length, minZ: zLo, maxZ: zHi, byte: blob.size, dinhDang: d.ten, ten: T.ten, soAnh: Ls.length };
  }

  // ======================================================================= mở gói ảnh .pmtiles lên bản đồ
  const docB = async (f, o, n) => new Uint8Array(await f.slice(o, o + n).arrayBuffer());
  const GOI = new Map();
  let demGoi = 0, daDangKy = false;
  function thuMucLa(g, off, len) {
    if (g.la.has(off)) { const v = g.la.get(off); g.la.delete(off); g.la.set(off, v); return v; }
    const p = (async () => docDir(await moNen(await docB(g.file, g.h.laOff + off, len), g.h.ic)))();
    g.la.set(off, p);
    if (g.la.size > 64) g.la.delete(g.la.keys().next().value);
    p.catch(() => g.la.delete(off));
    return p;
  }
  async function layO(g, z, x, y) {
    if (z < g.h.minZ || z > g.h.maxZ || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return null;
    const id = maO(z, x, y);
    let dir = g.goc;
    for (let sau = 0; sau < 4; sau++) {
      const e = timO(dir, id);
      if (!e) return null;
      if (e.runLength > 0) return (await docB(g.file, g.h.dataOff + e.offset, e.length)).buffer;
      dir = await thuMucLa(g, e.offset, e.length);
    }
    return null;
  }
  function dangKy() {
    if (daDangKy || !root.maplibregl || !root.maplibregl.addProtocol) return;
    daDangKy = true;
    root.maplibregl.addProtocol("anhpm", async (params) => {
      const m = /^anhpm:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url), g = m && GOI.get(m[1]);
      const d = g ? await layO(g, +m[2], +m[3], +m[4]) : null;
      return { data: d || (await VN.abOTrong()) };
    });
  }
  const TEN_KIEU = { 2: "PNG", 3: "JPEG", 4: "WebP", 5: "AVIF" };
  async function doc(file) {
    const h = docDau(await docB(file, 0, 127));
    if (h.tt === 1 || h.tt === 6) throw new Error("Gói .pmtiles này là bản đồ vector — ở đây chỉ mở gói ảnh (PNG / JPEG / WebP)");
    if (!TEN_KIEU[h.tt]) throw new Error("Không rõ kiểu ô ảnh trong gói .pmtiles");
    if (h.tc !== 0 && h.tc !== 1) throw new Error("Ô ảnh trong gói .pmtiles bị nén thêm (gzip / brotli…) — chưa hỗ trợ");
    const goc = docDir(await moNen(await docB(file, h.gocOff, h.gocLen), h.ic));
    let meta = {};
    try { if (h.metaLen) meta = JSON.parse(new TextDecoder().decode(await moNen(await docB(file, h.metaOff, h.metaLen), h.ic))) || {}; }
    catch (_) { meta = {}; }
    return { h, goc, meta, file, la: new Map() };
  }
  // ctx: { map, h: { escapeHtml } } → mô tả lớp giống anhbay.js (hien, datDoRo, go)
  async function mo(file, ctx) {
    const g = await doc(file), h = g.h, meta = g.meta;
    let bb = h.bb;
    if (!(bb[2] > bb[0] && bb[3] > bb[1]) && Array.isArray(meta.bounds)) bb = meta.bounds.map(Number);
    if (!(bb[0] > -180 && bb[2] < 180 && bb[1] > -85 && bb[3] < 85 && bb[2] > bb[0] && bb[3] > bb[1])) throw new Error("Gói .pmtiles không ghi phạm vi hợp lệ");
    const id = "pm" + ++demGoi;
    g.id = id; GOI.set(id, g); dangKy();
    const map = ctx.map, ten = file.name;
    map.addSource(id, { type: "raster", tiles: [`anhpm://${id}/{z}/{x}/{y}`], tileSize: 256, minzoom: h.minZ, maxzoom: h.maxZ,
      bounds: bb, attribution: `Ảnh: ${ctx.h.escapeHtml(meta.vn2000_nguon || ten)} (gói .pmtiles trên máy)` });
    const lopIds = map.getStyle().layers.map((l) => l.id);
    const truoc = ["nen-ranh-tinh"].find((x) => lopIds.includes(x));
    map.addLayer({ id: id + "-anh", type: "raster", source: id, paint: { "raster-fade-duration": 0 } }, truoc);
    const hop = (v) => Array.isArray(v) && v.length > 3 && v.every((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
    const vien = Array.isArray(meta.vn2000_vien_ds) && meta.vn2000_vien_ds.length && meta.vn2000_vien_ds.every(hop) ? meta.vn2000_vien_ds
      : [hop(meta.vn2000_vien) ? meta.vn2000_vien : [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]], [bb[0], bb[1]]]];
    map.addSource(id + "-v", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: vien } } });
    map.addLayer({ id: id + "-vien", type: "line", source: id + "-v",
      paint: { "line-color": "#ff7a00", "line-width": 1.5, "line-dasharray": [3, 2], "line-opacity": ["interpolate", ["linear"], ["zoom"], h.minZ, 1, h.minZ + 1, 0.35] } });
    const nguon = meta.vn2000_so_anh > 1 ? `${meta.vn2000_so_anh} ảnh (${meta.vn2000_nguon})` : meta.vn2000_nguon;
    const goc = nguon ? ` · vẽ sẵn từ ${nguon}${meta.vn2000_he_toa_do_goc ? " — " + meta.vn2000_he_toa_do_goc : ""}` : "";
    return {
      id, ten, bb, zMin: h.minZ, goi: true,
      loai: `Gói ảnh .pmtiles · ${(h.soO || 0).toLocaleString("vi-VN")} ô ${TEN_KIEU[h.tt]} · zoom ${h.minZ}–${h.maxZ}${goc}`,
      hien(v) { for (const s of ["-anh", "-vien"]) if (map.getLayer(id + s)) map.setLayoutProperty(id + s, "visibility", v ? "visible" : "none"); },
      datDoRo(v) { if (map.getLayer(id + "-anh")) map.setPaintProperty(id + "-anh", "raster-opacity", v); },
      go() {
        for (const s of ["-anh", "-vien"]) if (map.getLayer(id + s)) map.removeLayer(id + s);
        for (const s of ["", "-v"]) if (map.getSource(id + s)) map.removeSource(id + s);
        GOI.delete(id);
      },
    };
  }

  VN.goiAnh = { uocTinh, uocMuc, xuat, tenGoi: (ids) => gop(ids).ten, mo, doc, layO, soO: (bb, z) => khoang(bb, z).n, mucThap,
    _maO: maO, _vietDir: vietDir, _docDir: docDir, _timO: timO, _taoThuMuc: taoThuMuc, _taoDau: taoDau, _docDau: docDau };
})(typeof window !== "undefined" ? window : globalThis);
