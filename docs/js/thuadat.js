/*
 * Thửa đất của tôi — chế độ ẩn, chỉ chủ ứng dụng thấy (cùng cờ quản trị với Thống kê: mở trang 1 lần bằng
 * ?thongke hoặc ?thuadat trên máy đó; thoát chế độ quản trị trong hộp Thống kê).
 *
 * Giao diện: nút "Thửa đất" trong khung "Lớp bản đồ" (chỉ máy đã bật chế độ quản trị thấy) — bấm lần đầu tự đăng nhập
 * Google và tải, sau đó bật / tắt chấm thửa; ô nhỏ dưới nút: số thửa, giờ cập nhật, ⟳ cập nhật, tìm kiếm.
 * Bảng tính gắn sẵn trong thuadat-config.js (VN_THUADAT_BANG; bảng để chế độ "Bị hạn chế" nên lộ link cũng không đọc được).
 *
 * Đọc dữ liệu AppSheet nằm trong Google Sheets bằng chính tài khoản Google của người dùng
 * (Google Identity Services, quyền CHỈ ĐỌC spreadsheets.readonly; mã khách OAuth ở thuadat-config.js — mã này công khai,
 * không phải bí mật). Mỗi bảng (tab) có cột toạ độ dạng "vĩ độ, kinh độ" (kiểu LatLong của AppSheet) hoặc 2 cột
 * vĩ độ / kinh độ → chấm vị trí thửa lên bản đồ (gom cụm khi thu nhỏ), bấm xem toàn bộ thông tin dòng đó;
 * sau mỗi lần chuyển toạ độ gợi ý các thửa trong dữ liệu ở gần (app.js gọi VN.thuaDatRows).
 *
 * Dữ liệu chỉ đi giữa trình duyệt và Google, không qua máy chủ nào khác, không nằm trong mã nguồn. Lưu tạm trên
 * máy đang dùng (IndexedDB "vn_thuadat") để lần sau mở nhanh / không cần mạng; nút "Xoá khỏi máy" xoá hẳn.
 */
(function (root) {
  "use strict";
  const VN = (root.VN = root.VN || {});
  const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
  const S = { map: null, h: null, bang: [], diem: [], luc: 0, token: null, het: 0, popup: null, so: new Map(), rows: [], hien: true, bk: 300, dang: "" };
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem("vn_td_" + k); return v == null ? d : v; } catch (_) { return d; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem("vn_td_" + k); else localStorage.setItem("vn_td_" + k, v); } catch (_) { /* bỏ qua */ } },
  };
  const laQuanTri = () => { try { return localStorage.getItem("vn_tk_admin") === "1"; } catch (_) { return false; } };
  const maKhach = () => String(root.VN_GOOGLE_CLIENT_ID || "").trim();
  const $ = (id) => document.getElementById(id);
  const boDau = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

  // ======================================================================= đọc toạ độ, nhận cột
  // "16.7258, 106.7212" (LatLong của AppSheet), "16,7258; 106,7212", link Google Maps ?q=…/@lat,lng; tự đảo nếu ghi kinh độ trước
  function docLatLon(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) return null;
    let m = /[?&](?:q|ll|query|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(s) || /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(s)
      || /^\(?\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*\)?$/.exec(s);
    if (!m) { const n = /^\(?\s*(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)\s*\)?$/.exec(s); if (n) m = [n[0], n[1].replace(",", "."), n[2].replace(",", ".")]; }
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2]);
    if (a >= 8 && a <= 24 && b >= 102 && b <= 110) return [a, b];
    if (b >= 8 && b <= 24 && a >= 102 && a <= 110) return [b, a];
    return null;
  }
  const soThuc = (s) => { const t = String(s == null ? "" : s).trim().replace(/\s/g, ""); const v = Number(/^-?\d+,\d+$/.test(t) ? t.replace(",", ".") : t); return t && isFinite(v) ? v : NaN; };
  // vai trò cột theo tên cột (bỏ dấu, chữ thường)
  const VAI = {
    ten: /^(ho (va )?ten|ho ten|ten chu|chu su dung|nguoi su dung|ten nguoi su dung|chu ho|ten)\b/,
    toThua: /so to.*so thua|^to\W+thua$/,
    to: /^(so )?to( ban do)?( so)?$|^so to ban do$|^so to$/,
    thua: /^(so )?thua( dat)?( so)?$|^so thua$/,
    loai: /loai dat|muc dich/,
    dt: /dien tich/,
    id: /^(id|ma|ma ho so|stt)$/,
  };
  // values: mảng dòng (dòng 1 = tên cột) → { header, rows, cot } hoặc null nếu bảng không có toạ độ
  function phanTich(values) {
    if (!values || values.length < 2) return null;
    const header = values[0].map((h, j) => String(h == null || h === "" ? `Cột ${j + 1}` : h).trim());
    const rows = values.slice(1).map((r) => r || []);        // giữ cả dòng trống để số dòng khớp bảng tính
    if (!rows.some((r) => r.some((v) => String(v == null ? "" : v).trim() !== ""))) return null;
    const nCot = Math.max(header.length, ...rows.slice(0, 200).map((r) => r.length));
    let tot = -1, totDem = 0;
    for (let j = 0; j < nCot; j++) {
      let dem = 0, co = 0;
      for (const r of rows) { const v = r[j]; if (v == null || String(v).trim() === "") continue; co++; if (docLatLon(v)) dem++; }
      if (dem > totDem && dem >= Math.max(1, co * 0.2)) { tot = j; totDem = dem; }
    }
    const tenCot = header.map(boDau);
    const cot = { ll: tot, lat: -1, lon: -1 };
    if (tot < 0) {
      cot.lat = tenCot.findIndex((t) => /^(vi do|lat|latitude|y wgs84)$/.test(t));
      cot.lon = tenCot.findIndex((t) => /^(kinh do|lon|lng|long|longitude|x wgs84)$/.test(t));
      if (cot.lat < 0 || cot.lon < 0) return null;
      if (!rows.some((r) => soThuc(r[cot.lat]) >= 8 && soThuc(r[cot.lat]) <= 24 && soThuc(r[cot.lon]) >= 102 && soThuc(r[cot.lon]) <= 110)) return null;
    }
    for (const [k, re] of Object.entries(VAI)) cot[k] = tenCot.findIndex((t, j) => j !== cot.ll && re.test(t));
    return { header, rows, cot };
  }
  function viTri(b, r) {
    const c = b.cot;
    if (c.ll >= 0) return docLatLon(r[c.ll]);
    const la = soThuc(r[c.lat]), lo = soThuc(r[c.lon]);
    return la >= 8 && la <= 24 && lo >= 102 && lo <= 110 ? [la, lo] : null;
  }
  const o = (r, j) => (j >= 0 && r[j] != null ? String(r[j]).trim() : "");
  function tieuDe(d) {
    const b = S.bang[d.b], r = b.rows[d.r], c = b.cot;
    const ten = o(r, c.ten) || o(r, c.id) || "(không có tên)";
    const tt = o(r, c.toThua) || [o(r, c.to) && `Tờ ${o(r, c.to)}`, o(r, c.thua) && `thửa ${o(r, c.thua)}`].filter(Boolean).join(", ");
    const phu = [tt, o(r, c.loai), o(r, c.dt) && `${o(r, c.dt)} m²`].filter(Boolean).join(" · ");
    return { ten, phu };
  }
  function lapDiem() {
    S.diem = [];
    S.bang.forEach((b, bi) => b.rows.forEach((r, ri) => { const p = viTri(b, r); if (p) S.diem.push({ b: bi, r: ri, lat: p[0], lon: p[1], tim: null }); }));
  }

  // ======================================================================= Google: đăng nhập + đọc bảng tính
  let gisHua = null;
  function napGis() {
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    if (gisHua) return gisHua;
    gisHua = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = () => res(); s.onerror = () => { gisHua = null; rej(new Error("Không tải được thư viện đăng nhập Google (cần mạng)")); };
      document.head.appendChild(s);
    });
    return gisHua;
  }
  async function layToken() {
    if (S.token && Date.now() < S.het - 60000) return S.token;
    if (!maKhach()) throw new Error("Chưa cài mã đăng nhập Google (VN_GOOGLE_CLIENT_ID trong js/thuadat-config.js)");
    await napGis();
    return new Promise((res, rej) => {
      const tc = root.google.accounts.oauth2.initTokenClient({
        client_id: maKhach(), scope: SCOPE, hint: LS.get("email", "") || undefined,
        callback: (r) => {
          if (!r || r.error) { rej(new Error(r && (r.error_description || r.error) || "Đăng nhập Google lỗi")); return; }
          S.token = r.access_token; S.het = Date.now() + (Number(r.expires_in) || 3600) * 1000; res(S.token);
        },
        error_callback: (e) => rej(new Error(e && e.type === "popup_closed" ? "Đã đóng cửa sổ đăng nhập Google"
          : e && e.type === "popup_failed_to_open" ? "Trình duyệt chặn cửa sổ đăng nhập — cho phép cửa sổ bật lên rồi bấm lại" : "Đăng nhập Google lỗi")),
      });
      tc.requestAccessToken({ prompt: "" });
    });
  }
  async function api(url) {
    const r = await fetch(url, { headers: { Authorization: "Bearer " + S.token } });
    if (r.status === 401) { S.token = null; throw new Error("Phiên đăng nhập Google đã hết — bấm tải lại"); }
    if (r.status === 403) throw new Error("Tài khoản Google này không có quyền xem bảng tính (hoặc dự án chưa bật Google Sheets API)");
    if (r.status === 404) throw new Error("Không tìm thấy bảng tính — kiểm tra lại link");
    if (!r.ok) throw new Error(`Google Sheets trả lỗi ${r.status}`);
    return r.json();
  }
  const maBang = (s) => { const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(s) || /^\s*([a-zA-Z0-9_-]{30,})\s*$/.exec(s); return m ? m[1] : null; };
  async function docBangTinh(id) {
    const m = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties(title,sheetType)`);
    const tabs = (m.sheets || []).map((s) => s.properties).filter((p) => !p.sheetType || p.sheetType === "GRID").map((p) => p.title);
    if (!tabs.length) return [];
    const q = tabs.map((t) => "ranges=" + encodeURIComponent(`'${t.replace(/'/g, "''")}'`)).join("&");
    const v = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${q}&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`);
    return (v.valueRanges || []).map((vr, i) => ({ id, nguon: (m.properties && m.properties.title) || id, bang: tabs[i], values: vr.values || [] }));
  }

  // ======================================================================= lưu tạm trên máy (IndexedDB)
  function moDb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("vn_thuadat", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function dbLam(che, fn) {
    const db = await moDb();
    try {
      return await new Promise((res, rej) => {
        const t = db.transaction("kv", che), q = fn(t.objectStore("kv"));
        t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    } finally { db.close(); }
  }
  const dbLuu = (v) => dbLam("readwrite", (s) => s.put(v, "dulieu"));
  const dbDoc = () => dbLam("readonly", (s) => s.get("dulieu"));
  const dbXoa = () => new Promise((res) => { const r = indexedDB.deleteDatabase("vn_thuadat"); r.onsuccess = r.onerror = r.onblocked = () => res(); });

  // ======================================================================= bản đồ
  function geojson() {
    return { type: "FeatureCollection", features: S.diem.map((d, i) => ({ type: "Feature", properties: { i }, geometry: { type: "Point", coordinates: [d.lon, d.lat] } })) };
  }
  function veLop() {
    const map = S.map; if (!map) return;
    const co = S.hien && S.diem.length > 0;
    if (!co) {
      for (const id of ["td-diem", "td-cum"]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("td")) map.removeSource("td");
      veSo(); return;
    }
    if (map.getSource("td")) map.getSource("td").setData(geojson());
    else {
      map.addSource("td", { type: "geojson", data: geojson(), cluster: true, clusterRadius: 44, clusterMaxZoom: 16,
        attribution: "Thửa đất: dữ liệu AppSheet riêng của chủ ứng dụng (Google Sheets)" });
      map.addLayer({ id: "td-cum", type: "circle", source: "td", filter: ["has", "point_count"],
        paint: { "circle-color": "#c1121f", "circle-opacity": 0.88, "circle-stroke-color": "#fff", "circle-stroke-width": 2,
          "circle-radius": ["step", ["get", "point_count"], 13, 10, 16, 100, 20, 1000, 25] } });
      map.addLayer({ id: "td-diem", type: "circle", source: "td", filter: ["!", ["has", "point_count"]],
        paint: { "circle-color": "#e63946", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 6.5, 20, 9] } });
    }
  }
  // số trên mỗi cụm (bản đồ nền không có font chữ cho lớp symbol → dùng nhãn HTML cho các cụm đang thấy)
  function veSo() {
    const map = S.map, moi = new Map();
    if (map && map.getLayer && map.getLayer("td-cum")) {
      let fs = [];
      try { fs = map.queryRenderedFeatures({ layers: ["td-cum"] }); } catch (_) { fs = []; }
      for (const f of fs.slice(0, 400)) {
        const id = f.properties.cluster_id;
        if (moi.has(id)) continue;
        let mk = S.so.get(id);
        if (!mk) {
          const el = document.createElement("div"); el.className = "td-so";
          mk = new root.maplibregl.Marker({ element: el }).setLngLat(f.geometry.coordinates).addTo(map);
        } else mk.setLngLat(f.geometry.coordinates);
        mk.getElement().textContent = f.properties.point_count_abbreviated;
        moi.set(id, mk);
      }
    }
    for (const [id, mk] of S.so) if (!moi.has(id)) mk.remove();
    S.so = moi;
  }
  const lienKet = (v) => /^https?:\/\/\S+$/i.test(v) ? `<a href="${S.h.escapeHtml(v)}" target="_blank" rel="noopener">${S.h.escapeHtml(v.length > 48 ? v.slice(0, 45) + "…" : v)}</a>` : S.h.escapeHtml(v);
  function popupHtml(i) {
    const d = S.diem[i], b = S.bang[d.b], r = b.rows[d.r], e = S.h.escapeHtml, t = tieuDe(d);
    const dong = b.header.map((h, j) => [h, o(r, j)]).filter(([, v]) => v);
    return `<div class="td-pop"><b>${e(t.ten)}</b>${t.phu ? `<div class="muted">${e(t.phu)}</div>` : ""}` +
      `<table>${dong.map(([h, v]) => `<tr><th>${e(h)}</th><td>${lienKet(v)}</td></tr>`).join("")}</table>` +
      `<small class="muted">Nguồn: Google Sheets “${e(b.nguon)}” › ${e(b.bang)}, dòng ${d.r + 2} · đọc lúc ${e(gio(S.luc))}</small></div>`;
  }
  function moThua(i, bay) {
    const d = S.diem[i]; if (!d || !S.map) return;
    if (bay) S.map.flyTo({ center: [d.lon, d.lat], zoom: Math.max(S.map.getZoom(), 18) });
    if (S.popup) S.popup.remove();
    S.popup = new root.maplibregl.Popup({ offset: 8, maxWidth: "360px" }).setLngLat([d.lon, d.lat]).setHTML(popupHtml(i)).addTo(S.map);
  }
  const gio = (t) => t ? new Date(t).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  // gọn: trong ngày chỉ giờ, ngày khác thêm ngày/tháng
  const gioNgan = (t) => { if (!t) return ""; const d = new Date(t), h = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === new Date().toDateString() ? h : `${h} ${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`; };

  // ======================================================================= gợi ý thửa gần các điểm vừa chuyển
  function capNhatGan(rows) {
    S.rows = rows || [];
    const box = $("td-gan"); if (!box) return;
    if (!laQuanTri() || !S.diem.length || !S.rows.length) { box.hidden = true; return; }
    const pts = S.rows.map((r) => [r.lat, r.lon]);
    if (pts.length >= 3) pts.push([pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]);
    const k = Math.cos((pts[0][0] * Math.PI) / 180) * 111320, R = S.bk, gan = [];
    S.diem.forEach((d, i) => {
      let m = Infinity;
      for (const p of pts) { const dx = (d.lon - p[1]) * k, dy = (d.lat - p[0]) * 110574; const v = dx * dx + dy * dy; if (v < m) m = v; }
      m = Math.sqrt(m);
      if (m <= R) gan.push([m, i]);
    });
    gan.sort((a, b) => a[0] - b[0]);
    const e = S.h.escapeHtml;
    const chon = [100, 300, 500, 1000].map((v) => `<option value="${v}"${v === R ? " selected" : ""}>${v < 1000 ? v + " m" : "1 km"}</option>`).join("");
    let html = `<div class="td-dau"><strong>Thửa đất gần đây</strong><label>trong <select data-bk>${chon}</select></label></div>`;
    if (gan.length) {
      html += `<ul class="gd-list td-list">${gan.slice(0, 8).map(([m, i]) => { const t = tieuDe(S.diem[i]);
        return `<li data-i="${i}"><span class="sw td-sw"></span><div><b>${e(t.ten)}</b> <small class="muted">· ${S.h.fmt(m, 0)} m</small>${t.phu ? `<div class="muted">${e(t.phu)}</div>` : ""}</div></li>`; }).join("")}</ul>`;
      if (gan.length > 8) html += `<small class="muted">và ${gan.length - 8} thửa khác.</small>`;
    } else html += `<div class="muted">Không có thửa nào trong phạm vi này.</div>`;
    html += `<small class="muted td-chu">Theo vị trí ghim trong dữ liệu (${e(nguonNgan())}, cập nhật ${e(gioNgan(S.luc))}), không phải ranh thửa.</small>`;
    box.innerHTML = html; box.hidden = false;
  }

  // ======================================================================= tìm trong dữ liệu
  function timKiem() {
    const kq = $("td-kq"), q = boDau($("td-tim").value.trim());
    if (q.length < 2) { kq.innerHTML = ""; kq.hidden = true; return; }
    const tu = q.split(/\s+/).filter(Boolean), out = [];
    for (let i = 0; i < S.diem.length && out.length < 30; i++) {
      const d = S.diem[i];
      if (d.tim == null) { const b = S.bang[d.b]; d.tim = boDau(b.rows[d.r].join(" ")); }
      if (tu.every((t) => d.tim.includes(t))) out.push(i);
    }
    const e = S.h.escapeHtml;
    kq.hidden = false;
    kq.innerHTML = out.length ? `<ul class="td-list">${out.map((i) => { const t = tieuDe(S.diem[i]);
      return `<li data-i="${i}"><b>${e(t.ten)}</b>${t.phu ? `<small>${e(t.phu)}</small>` : ""}</li>`; }).join("")}</ul>`
      : `<small class="muted">Không thấy thửa nào.</small>`;
  }

  // ======================================================================= tải / hiện dữ liệu
  // bảng tính: gắn sẵn trong thuadat-config.js (VN_THUADAT_BANG); bản cũ còn link dán tay trong máy thì dùng thêm
  function dsBang() {
    const ch = [].concat(root.VN_THUADAT_BANG || []), cu = LS.get("link", "");
    return [...new Set(ch.concat(cu.split(/[\n\s]+/)).map(maBang).filter(Boolean))];
  }
  const nguonNgan = () => [...new Set(S.bang.map((b) => b.nguon))].join(", ") || "Google Sheets";
  function giaoDien() {
    const nut = $("td-toggle"), hop = $("td-hop");
    const bat = S.hien && S.diem.length > 0;
    nut.setAttribute("aria-pressed", bat ? "true" : "false");
    nut.classList.toggle("dang", S.dang);
    hop.hidden = !bat && !S.dang;
    const tt = $("td-tt");
    if (S.dang) tt.textContent = S.dang;
    else if (S.diem.length) {
      tt.textContent = `${S.diem.length.toLocaleString("vi-VN")} thửa · cập nhật ${gioNgan(S.luc)}`;
      tt.title = `Nguồn: Google Sheets ${[...new Set(S.bang.map((b) => `“${b.nguon}” › ${b.bang}`))].join("; ")} (dữ liệu AppSheet)`;
    } else tt.textContent = "";
    $("td-capnhat").disabled = !!S.dang;
  }
  function apDung(dl) {
    S.bang = (dl && dl.bang) || []; S.luc = (dl && dl.luc) || 0;
    lapDiem(); veLop(); giaoDien(); capNhatGan(S.rows);
    if ($("td-tim").value) timKiem();
  }
  async function taiVe() {
    if (S.dang) return;
    const ids = dsBang();
    if (!ids.length) { S.h.toast("Chưa gắn bảng tính dữ liệu thửa đất (VN_THUADAT_BANG trong thuadat-config.js)"); return; }
    S.dang = "Đang đăng nhập Google…"; giaoDien();
    try {
      await layToken();
      const bang = [];
      for (const id of ids) {
        S.dang = "Đang đọc dữ liệu…"; giaoDien();
        for (const t of await docBangTinh(id)) { const p = phanTich(t.values); if (p) bang.push({ id: t.id, nguon: t.nguon, bang: t.bang, ...p }); }
      }
      if (!bang.length) throw new Error("Không thấy bảng nào có cột toạ độ (dạng “vĩ độ, kinh độ” hoặc 2 cột Vĩ độ / Kinh độ)");
      const dl = { bang, luc: Date.now() };
      S.dang = ""; S.hien = true; LS.set("hien", "1");
      apDung(dl);
      try { await dbLuu(dl); } catch (_) { /* không lưu được thì vẫn dùng trong phiên này */ }
      S.h.toast(`Đã cập nhật ${S.diem.length.toLocaleString("vi-VN")} thửa đất`);
    } catch (err) {
      S.dang = ""; giaoDien();
      S.h.toast(err && err.message ? err.message : String(err), 7000);
    }
  }

  function init(map, helpers) {
    S.map = map; S.h = helpers;
    const q = new URLSearchParams(location.search);
    if (q.has("thuadat") || /thuadat/.test(location.hash)) { try { localStorage.setItem("vn_tk_admin", "1"); } catch (_) { /* bỏ qua */ } }
    const nut = $("td-toggle");
    if (!nut || !laQuanTri()) return;                    // người dùng thường: không hiện gì, không tải gì
    nut.hidden = false;
    S.hien = LS.get("hien", "1") === "1"; S.bk = Number(LS.get("bk", "300")) || 300;
    nut.addEventListener("click", () => {
      if (S.dang) return;
      if (!S.diem.length) { taiVe(); return; }           // chưa có dữ liệu trên máy: đăng nhập + tải
      S.hien = !S.hien; LS.set("hien", S.hien ? "1" : "0");
      veLop(); giaoDien();
    });
    $("td-capnhat").addEventListener("click", taiVe);
    let hen = 0;
    $("td-tim").addEventListener("input", () => { clearTimeout(hen); hen = setTimeout(timKiem, 200); });
    $("td-xoa").addEventListener("click", async () => {
      await dbXoa(); S.token = null; S.hien = false; LS.set("hien", "0"); LS.set("link", null);
      $("td-tim").value = ""; timKiem(); apDung(null);
      S.h.toast("Đã xoá dữ liệu thửa đất khỏi máy này");
    });
    $("td-gan").addEventListener("change", (ev) => {
      if (!ev.target.matches("[data-bk]")) return;
      S.bk = Number(ev.target.value) || 300; LS.set("bk", String(S.bk)); capNhatGan(S.rows);
    });
    for (const id of ["td-kq", "td-gan"]) $(id).addEventListener("click", (ev) => { const li = ev.target.closest("li[data-i]"); if (li) moThua(Number(li.dataset.i), true); });
    map.on("click", "td-diem", (ev) => { const f = ev.features && ev.features[0]; if (f) moThua(f.properties.i, false); });
    map.on("click", "td-cum", async (ev) => {
      const f = ev.features && ev.features[0]; if (!f) return;
      try { const z = await map.getSource("td").getClusterExpansionZoom(f.properties.cluster_id); map.easeTo({ center: f.geometry.coordinates, zoom: z }); }
      catch (_) { map.easeTo({ center: f.geometry.coordinates, zoom: map.getZoom() + 2 }); }
    });
    for (const l of ["td-diem", "td-cum"]) {
      map.on("mouseenter", l, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", l, () => { map.getCanvas().style.cursor = ""; });
    }
    map.on("moveend", veSo);
    map.on("sourcedata", (ev) => { if (ev.sourceId === "td" && ev.isSourceLoaded) veSo(); });
    if (maKhach()) napGis().catch(() => {});             // nạp sẵn để cửa sổ đăng nhập mở ngay khi bấm (trình duyệt không chặn)
    giaoDien();
    dbDoc().then((dl) => apDung(dl)).catch(() => apDung(null));
  }

  Object.assign(VN, { thuaDatInit: init, thuaDatRows: capNhatGan, tdDocLatLon: docLatLon, tdPhanTich: phanTich });
})(typeof window !== "undefined" ? window : globalThis);
