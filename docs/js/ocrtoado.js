/*
 * Nhận dạng toạ độ in trên ảnh (OCR): ảnh chụp màn hình máy RTK / GNSS, bộ điều khiển drone, ảnh chụp sổ đo,
 * bảng toạ độ… → tìm các cặp Vĩ độ–Kinh độ (WGS84) hoặc X–Y (VN-2000), kèm độ cao nếu có chữ "m", rồi đưa vào khung
 * chuyển đổi (chuyển đổi bằng thuật toán của ứng dụng).
 *
 * OCR dùng Tesseract.js (giấy phép Apache-2.0), tải từ CDN jsDelivr CHỈ khi dùng chức năng này; ảnh chỉ xử lý trên
 * máy, không gửi đi đâu. Ảnh được nhận dạng 2 lượt: (A) tách chữ sáng (chữ trắng trên màn hình), (B) ảnh xám thường
 * (chữ tối trên nền sáng); kết quả hai lượt được gộp, trùng vị trí thì giữ số đầy đủ hơn.
 *
 * Phần thuần (tách số, phân loại, ghép cặp) chạy được trong Node để kiểm thử.
 */
(function (root) {
  "use strict";
  root.VN = root.VN || {};

  // TSV của Tesseract → [{ text, x0, y0, x1, y1, conf }]
  function docTsv(tsv) {
    const out = [];
    for (const line of String(tsv || "").split(/\r?\n/)) {
      const c = line.split("\t");
      if (c.length < 12 || c[0] !== "5") continue;
      const text = c.slice(11).join("\t").trim();
      if (!text) continue;
      const x = +c[6], y = +c[7], w = +c[8], h = +c[9];
      out.push({ text, x0: x, y0: y, x1: x + w, y1: y + h, conf: +c[10] });
    }
    return out;
  }

  // Chuẩn hoá một từ chứa số: lỗi OCR hay gặp (O→0, l/I→1 giữa các chữ số), dấu thập phân kiểu Việt
  function chuanSo(t) {
    let s = String(t).replace(/(?<=\d)[Oo](?=[\d.,])|(?<=[\d.,])[Oo](?=\d)/g, "0").replace(/(?<=\d)[lI|](?=\d)/g, "1");
    s = s.replace(/(\d{1,3}(?:\.\d{3})+),(\d+)/g, (_, a, b) => a.replace(/\./g, "") + "." + b);   // 1.842.173,70
    s = s.replace(/(\d),(\d)/g, "$1.$2");                                                           // 16,7532 → 16.7532
    return s;
  }

  const tam = (w) => [(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2];
  const kc = (a, b) => { const p = tam(a), q = tam(b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
  const chong = (a, b) => {                           // hai khung chữ đè lên nhau?
    const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ix <= 0 || iy <= 0) return false;
    const s = ix * iy, sa = (a.x1 - a.x0) * (a.y1 - a.y0), sb = (b.x1 - b.x0) * (b.y1 - b.y0);
    return s / Math.min(sa, sb) > 0.4;
  };
  const soChuSo = (t) => (String(t).match(/\d/g) || []).length;

  // Gộp từ của nhiều lượt nhận dạng: trùng vị trí thì giữ từ có nhiều chữ số hơn (cùng số thì độ tin cậy cao hơn)
  function gopLuot(luot) {
    const giu = [];
    for (const words of luot) {
      for (const w of words) {
        if (!/\d/.test(w.text)) continue;
        const k = giu.findIndex((g) => chong(g, w));
        if (k < 0) giu.push(w);
        else {
          const g = giu[k], dw = soChuSo(w.text), dg = soChuSo(g.text);
          if (dw > dg || (dw === dg && w.conf > g.conf)) giu[k] = w;
        }
      }
    }
    return giu;
  }

  // Tách các số có nghĩa toạ độ trong danh sách từ (đã gộp)
  function tachSo(words, tatCa) {
    const so = [];
    const ke = (w) => {                                // từ đứng ngay bên phải cùng dòng (vd "N", "E", "m")
      const h = w.y1 - w.y0;
      let best = null, bd = Infinity;
      for (const v of tatCa) {
        if (v === w) continue;
        const dy = Math.abs((v.y0 + v.y1) / 2 - (w.y0 + w.y1) / 2), dx = v.x0 - w.x1;
        if (dy < h * 0.6 && dx >= -2 && dx < h * 1.5 && dx < bd) { bd = dx; best = v; }
      }
      return best ? best.text.trim() : "";
    };
    for (const w of words) {
      const t = chuanSo(w.text);
      const re = /-?\d+(?:\.\d+)?/g;
      let m;
      while ((m = re.exec(t))) {
        const str = m[0], v = parseFloat(str);
        const thap = (str.split(".")[1] || "").length, nguyen = str.replace(/^-/, "").split(".")[0].length;
        let hau = t.slice(m.index + str.length).trim().charAt(0);
        if (!hau && m.index + str.length >= t.length) hau = ke(w).charAt(0);
        hau = (hau || "").toUpperCase();
        let loai = "";
        if (hau === "N" || hau === "S") loai = v >= 1 && v <= 90 && thap >= 3 ? "lat" : "";
        else if (hau === "E" || hau === "W") loai = v >= 1 && v <= 180 && thap >= 3 ? "lon" : "";
        if (!loai && thap >= 4 && v >= 5 && v <= 25) loai = "lat";
        if (!loai && thap >= 4 && v >= 100 && v <= 120) loai = "lon";
        if (!loai && thap >= 1 && nguyen === 7 && v >= 900000 && v <= 2700000) loai = "x";
        if (!loai && thap >= 1 && nguyen === 6 && v >= 100000 && v < 1000000) loai = "y";
        if (!loai && hau === "M" && thap >= 1 && v > -500 && v < 9000) loai = "h";
        if (!loai) continue;
        const gt = (hau === "S" || hau === "W") ? -Math.abs(v) : v;
        so.push({ loai, v: gt, text: str + (hau && "NSEWM".includes(hau) ? hau : ""), x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, nguon: w });
      }
    }
    return so;
  }

  // Độ-phút-giây trên một dòng chữ (vd 16°45'11.67"N) → số; dùng khi màn hình hiện DMS
  function tachDms(words) {
    const dong = [];
    for (const w of [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
      const cy = (w.y0 + w.y1) / 2, h = w.y1 - w.y0;
      let d = dong.find((l) => Math.abs(l.cy - cy) < h * 0.6);
      if (!d) { d = { cy, ws: [] }; dong.push(d); }
      d.ws.push(w);
    }
    const so = [];
    const re = /(\d{1,3})\s*[°º˚*o]\s*(\d{1,2})\s*['’′`]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["”″]|'')?\s*([NSEW])?/g;
    for (const d of dong) {
      d.ws.sort((a, b) => a.x0 - b.x0);
      const text = d.ws.map((w) => w.text).join(" ");
      let m;
      while ((m = re.exec(text))) {
        const v = +m[1] + +m[2] / 60 + parseFloat(m[3].replace(",", ".")) / 3600;
        const hau = (m[4] || "").toUpperCase();
        let loai = hau === "N" || hau === "S" ? "lat" : hau === "E" || hau === "W" ? "lon" : v >= 5 && v <= 25 ? "lat" : v >= 100 && v <= 120 ? "lon" : "";
        if (!loai) continue;
        // vị trí: từ chứa phần độ
        const w = d.ws.find((x) => x.text.includes(m[1])) || d.ws[0];
        so.push({ loai, v: hau === "S" || hau === "W" ? -v : v, text: m[0], x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, dms: true });
      }
    }
    return so;
  }

  // Ghép cặp gần nhau nhất (tham lam theo khoảng cách tâm khung chữ)
  function ghep(A, B) {
    const cap = [];
    for (const a of A) for (const b of B) cap.push([kc(a, b), a, b]);
    cap.sort((p, q) => p[0] - q[0]);
    const dung = new Set(), out = [];
    for (const [d, a, b] of cap) {
      if (dung.has(a) || dung.has(b)) continue;
      dung.add(a); dung.add(b); out.push({ a, b, d });
    }
    return out;
  }

  // words: mảng các lượt nhận dạng ([[từ…], [từ…]]) hoặc một mảng từ
  function timToaDo(luot) {
    const ds = Array.isArray(luot[0]) ? luot : [luot];
    const words = gopLuot(ds), tatCa = ds.flat();
    let so = tachSo(words, tatCa);
    const dms = tachDms(tatCa).filter((d) => !so.some((s) => chong(s, d)));
    so = so.concat(dms);
    const pick = (k) => so.filter((s) => s.loai === k);
    const hs = pick("h"), dungH = new Set();
    const voiDoCao = (p) => {
      let best = null, bd = Infinity;
      for (const h of hs) {
        if (dungH.has(h)) continue;
        const d = kc(p.b, h);
        if (d < bd && d <= Math.max(p.d * 2.5, (p.b.y1 - p.b.y0) * 4)) { bd = d; best = h; }
      }
      if (best) dungH.add(best);
      return best;
    };
    const xep = (p, q) => (p.a.y0 - q.a.y0) || (p.a.x0 - q.a.x0);
    const wgs = ghep(pick("lat"), pick("lon")).sort(xep).map((p) => { const h = voiDoCao(p); return { lat: p.a.v, lon: p.b.v, h: h ? h.v : NaN, o: [p.a, p.b, h].filter(Boolean) }; });
    const vn = ghep(pick("x"), pick("y")).sort(xep).map((p) => { const h = voiDoCao(p); return { x: p.a.v, y: p.b.v, h: h ? h.v : NaN, o: [p.a, p.b, h].filter(Boolean) }; });
    return { wgs, vn, so };
  }

  Object.assign(root.VN, { ocrDocTsv: docTsv, ocrChuanSo: chuanSo, ocrTimToaDo: timToaDo });

  if (typeof document === "undefined") return;

  // ===================================================================== giao diện
  const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";
  const S = { h: null, worker: null, napLib: null, kq: [], anh: [] };

  function napTesseract() {
    if (!S.napLib) {
      S.napLib = new Promise((resolve, reject) => {
        if (root.Tesseract) { resolve(root.Tesseract); return; }
        const sc = document.createElement("script");
        sc.src = TESS; sc.async = true;
        sc.onload = () => resolve(root.Tesseract);
        sc.onerror = () => { S.napLib = null; reject(new Error("Không tải được bộ nhận dạng chữ (Tesseract.js) — kiểm tra kết nối mạng")); };
        document.head.appendChild(sc);
      });
    }
    return S.napLib;
  }
  async function layWorker(baoTien) {
    if (S.worker) return S.worker;
    const T = await napTesseract();
    S.worker = await T.createWorker("eng", 1, { logger: (m) => { if (m && m.status && baoTien) baoTien(m); } });
    await S.worker.setParameters({ tessedit_pageseg_mode: "11" });       // chữ rải rác (màn hình, bảng)
    return S.worker;
  }

  // Ảnh → 2 canvas: (A) chữ sáng → đen, (B) ảnh xám; cạnh dài 1000–2400 px
  async function chuanBi(file) {
    const url = URL.createObjectURL(file), img = new Image();
    img.src = url;
    try { await img.decode(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    const dai = Math.max(img.naturalWidth, img.naturalHeight);
    const k = dai < 1000 ? 2 : dai > 2400 ? 2400 / dai : 1;
    const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
    const goc = document.createElement("canvas"); goc.width = W; goc.height = H;
    const g = goc.getContext("2d"); g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H), px = d.data, n = W * H, xam = new Uint8ClampedArray(n), hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) { const v = (px[4 * i] * 299 + px[4 * i + 1] * 587 + px[4 * i + 2] * 114) / 1000; xam[i] = v; hist[xam[i]]++; }
    let dem = 0, p98 = 255;                           // ngưỡng chữ sáng: phân vị 98 % trừ 15, kẹp 180–245
    for (let v = 255; v >= 0; v--) { dem += hist[v]; if (dem >= n * 0.02) { p98 = v; break; } }
    const T = Math.min(245, Math.max(180, p98 - 15));
    const mk = (fn) => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"), o = x.createImageData(W, H);
      for (let i = 0; i < n; i++) { const v = fn(xam[i]); o.data[4 * i] = o.data[4 * i + 1] = o.data[4 * i + 2] = v; o.data[4 * i + 3] = 255; } x.putImageData(o, 0, 0); return c; };
    return { goc, A: mk((v) => (v >= T ? 0 : 255)), B: mk((v) => v), W, H };
  }

  async function nhanDang(files) {
    const dlg = document.getElementById("ocr-dlg");
    const tt = document.getElementById("ocr-tt");
    document.getElementById("ocr-ds").value = "";
    document.getElementById("ocr-anh").innerHTML = "";
    dlg.showModal();
    const bao = (s) => { tt.textContent = s; };
    let w;
    try {
      bao("Đang tải bộ nhận dạng chữ (Tesseract.js, chỉ lần đầu)…");
      w = await layWorker((m) => { if (/loading|initializ/i.test(m.status)) bao(`Đang tải bộ nhận dạng chữ… ${Math.round((m.progress || 0) * 100)}%`); });
    } catch (e) { bao(e.message || String(e)); return; }
    const dong = { wgs: [], vn: [] }, khong = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i], ten = f.name.replace(/\.[^.]+$/, "").replace(/[\s,;]+/g, "_") || "anh";
      bao(`Đang nhận dạng ảnh ${i + 1}/${files.length}: ${f.name}…`);
      let c;
      try { c = await chuanBi(f); } catch (_) { khong.push(f.name + " (không đọc được ảnh)"); continue; }
      const luot = [];
      for (const cv of [c.A, c.B]) { const r = await w.recognize(cv, {}, { tsv: true }); luot.push(docTsv(r.data.tsv)); }
      const kq = timToaDo(luot);
      veKhung(c, kq, f.name);
      const so = (v, n) => (isFinite(v) ? v.toFixed(n) : "0");
      kq.wgs.forEach((p, k) => dong.wgs.push(`${ten}_${k + 1} ${p.lat.toFixed(9)} ${p.lon.toFixed(9)} ${so(p.h, 3)}`));
      kq.vn.forEach((p, k) => dong.vn.push(`${ten}_${k + 1} ${p.x.toFixed(3)} ${p.y.toFixed(3)} ${so(p.h, 3)}`));
      if (!kq.wgs.length && !kq.vn.length) khong.push(f.name);
    }
    const chieu = dong.wgs.length >= dong.vn.length ? "wgs2vn" : "vn2wgs";
    S.kq = { chieu, dong };
    document.getElementById("ocr-chieu").value = chieu;
    document.getElementById("ocr-ds").value = (chieu === "wgs2vn" ? dong.wgs : dong.vn).join("\n");
    const n = dong.wgs.length + dong.vn.length;
    bao(n ? `Tìm thấy ${dong.wgs.length} điểm Vĩ độ–Kinh độ, ${dong.vn.length} điểm X–Y. Kiểm tra, sửa nếu nhận sai, rồi bấm "Đưa vào khung chuyển đổi".` +
      (khong.length ? ` Không thấy toạ độ trong: ${khong.join(", ")}.` : "")
      : "Không nhận ra toạ độ nào trong ảnh. Thử ảnh rõ nét hơn, chụp thẳng màn hình, tránh loá.");
  }

  // Vẽ ảnh thu nhỏ + khung các số nhận được (xanh lá: vĩ độ / X, xanh dương: kinh độ / Y, cam: độ cao)
  function veKhung(c, kq, ten) {
    const box = document.getElementById("ocr-anh");
    const cv = document.createElement("canvas"), k = Math.min(1, 900 / c.W);
    cv.width = Math.round(c.W * k); cv.height = Math.round(c.H * k); cv.title = ten;
    const g = cv.getContext("2d"); g.drawImage(c.goc, 0, 0, cv.width, cv.height);
    const mau = { lat: "#16a34a", x: "#16a34a", lon: "#2563eb", y: "#2563eb", h: "#ea580c" };
    g.lineWidth = Math.max(2, 3 * k);
    for (const s of kq.so) { g.strokeStyle = mau[s.loai]; g.strokeRect(s.x0 * k - 3, s.y0 * k - 3, (s.x1 - s.x0) * k + 6, (s.y1 - s.y0) * k + 6); }
    g.font = `bold ${Math.max(14, Math.round(28 * k))}px Arial`;
    [...kq.wgs, ...kq.vn].forEach((p, i) => { const a = p.o[0]; g.fillStyle = "#dc2626"; g.fillText(String(i + 1), a.x0 * k - 6 - 24 * k, a.y1 * k); });
    box.appendChild(cv);
  }

  function init(helpers) {
    S.h = helpers;
    const inp = document.getElementById("ocr-file");
    inp.addEventListener("change", () => { const fs = [...inp.files]; inp.value = ""; if (fs.length) nhanDang(fs); });
    document.getElementById("ocr-chieu").addEventListener("change", (e) => {
      if (!S.kq.dong) return;
      document.getElementById("ocr-ds").value = (e.target.value === "wgs2vn" ? S.kq.dong.wgs : S.kq.dong.vn).join("\n");
    });
    document.getElementById("ocr-huy").addEventListener("click", () => document.getElementById("ocr-dlg").close());
    document.getElementById("ocr-ok").addEventListener("click", () => {
      const txt = document.getElementById("ocr-ds").value.trim();
      if (!txt) { S.h.toast("Chưa có toạ độ nào"); return; }
      document.getElementById("ocr-dlg").close();
      S.h.dua(document.getElementById("ocr-chieu").value, txt);
    });
  }

  root.VN.ocrInit = init;
})(typeof window !== "undefined" ? window : globalThis);
