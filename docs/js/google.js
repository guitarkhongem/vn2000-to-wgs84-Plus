/*
 * Ảnh vệ tinh Google — cách CHÍNH THỨC: Google Maps Platform, Map Tiles API (2D Tiles, mapType "satellite").
 *   https://developers.google.com/maps/documentation/tile/2d-tiles-overview
 *
 * - Khoá API của chủ ứng dụng KHÔNG nằm trong mã nguồn: cất ở Cloudflare Worker (Secret GOOGLE_MAPS_KEY,
 *   xem cloudflare/HUONG_DAN.md), ứng dụng lấy qua GET <máy chủ>/google. Khoá được giới hạn theo trang web
 *   (HTTP referrer) và chỉ dùng cho Map Tiles API; hạn mức theo ngày đặt trong Google Cloud để không vượt mức miễn phí.
 * - Phiên (session token) tạo bằng POST /v1/createSession ngay trên trình duyệt, lưu localStorage (hạn ~2 tuần).
 * - Theo chính sách Map Tiles API: hiện chữ "Google Maps" và chuỗi bản quyền ảnh lấy từ viewport info của khung nhìn
 *   hiện tại (góc dưới trái). Không tải trước, không lưu ảnh.
 * - Mức zoom tối đa có ảnh lấy từ maxZoomRects của viewport info → không xin ô ảnh vượt mức (tránh ô trống).
 * - Ảnh Esri vẫn bật bên dưới: chỗ Google chưa có ảnh vẫn thấy nền. Hết hạn mức / khoá lỗi → báo và quay về Esri.
 */
(function (root) {
  "use strict";
  root.VN = root.VN || {};
  const G = "https://tile.googleapis.com";
  const may = () => String(root.VN_THONGKE_API || "").replace(/\/+$/, "");   // máy chủ của ứng dụng (Cloudflare Worker)
  const LS = {
    get: (k) => { try { return JSON.parse(localStorage.getItem("vn_gsat_" + k) || "null"); } catch (_) { return null; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem("vn_gsat_" + k); else localStorage.setItem("vn_gsat_" + k, JSON.stringify(v)); } catch (_) { /* bỏ qua */ } },
  };
  const S = { map: null, h: null, key: "", session: "", bat: false, nguonZ: 0, banQuyen: "", nhan: null,
    baoLoi: false, thuLai: 0, hen: 0, dangMo: null };

  // ---------- hàm thuần (có test) ----------
  // Mức zoom tối đa có ảnh tại điểm (lon, lat) theo maxZoomRects của viewport info
  function maxZoomTai(rects, lon, lat) {
    let z = 0;
    for (const r of rects || []) {
      const trongLon = r.west <= r.east ? lon >= r.west && lon <= r.east : lon >= r.west || lon <= r.east;   // qua kinh tuyến 180
      if (lat <= r.north && lat >= r.south && trongLon) z = Math.max(z, Number(r.maxZoom) || 0);
    }
    return z;
  }
  const urlO = (session, key) => `${G}/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`;

  // ---------- khoá + phiên ----------
  async function layKhoa() {
    const c = LS.get("khoa");
    if (c && c.k && Date.now() - c.t < 12 * 3600e3) return c.k;
    if (!may()) throw new Error("chua-cau-hinh");
    const r = await fetch(may() + "/google", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.key) throw new Error("chua-cau-hinh");
    LS.set("khoa", { k: j.key, t: Date.now() });
    return j.key;
  }
  async function layPhien(key, moi) {
    const c = LS.get("phien");
    if (!moi && c && c.k === key && c.exp * 1000 - Date.now() > 86400e3) return c.s;
    const r = await fetch(`${G}/v1/createSession?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapType: "satellite", language: "vi-VN", region: "VN" }) });
    if (!r.ok) { const e = new Error("phien"); e.status = r.status; throw e; }
    const j = await r.json();
    LS.set("phien", { s: j.session, exp: Number(j.expiry) || Date.now() / 1000 + 13 * 86400, k: key });
    return j.session;
  }

  // ---------- lớp bản đồ ----------
  function taoNguon(maxZ) {
    const m = S.map;
    if (m.getLayer("gsat")) m.removeLayer("gsat");
    if (m.getSource("gsat")) m.removeSource("gsat");
    m.addSource("gsat", { type: "raster", tileSize: 256, maxzoom: maxZ, tiles: [urlO(S.session, S.key)] });
    const ids = m.getStyle().layers.map((l) => l.id), i = ids.indexOf("sat"), sat = m.getLayer("sat");
    const lop = { id: "gsat", type: "raster", source: "gsat", layout: { visibility: S.bat ? "visible" : "none" } };
    if (sat && sat.minzoom) lop.minzoom = sat.minzoom;
    const op = m.getLayer("sat") && m.getPaintProperty("sat", "raster-opacity");
    if (op != null) lop.paint = { "raster-opacity": op };
    m.addLayer(lop, i >= 0 && ids[i + 1] ? ids[i + 1] : undefined);   // ngay trên ảnh Esri
    S.nguonZ = maxZ;
  }

  async function vungNhin() {
    const m = S.map, b = m.getBounds(), z = Math.max(0, Math.min(22, Math.round(m.getZoom())));
    const q = `session=${encodeURIComponent(S.session)}&key=${encodeURIComponent(S.key)}&zoom=${z}` +
      `&north=${b.getNorth().toFixed(6)}&south=${b.getSouth().toFixed(6)}&east=${b.getEast().toFixed(6)}&west=${b.getWest().toFixed(6)}`;
    const r = await fetch(`${G}/tile/v1/viewport?${q}`);
    if (!r.ok) { const e = new Error("viewport"); e.status = r.status; throw e; }
    return r.json();
  }
  async function capNhatVung() {
    if (!S.bat || !S.session) return;
    let j;
    try { j = await vungNhin(); } catch (_) { return; }
    S.banQuyen = j.copyright || "";
    veNhan();
    const c = S.map.getCenter(), mz = Math.min(22, maxZoomTai(j.maxZoomRects, c.lng, c.lat));
    // đổi mức zoom tối đa của nguồn khi đang xem sâu hơn mức có ảnh, hoặc nơi này có ảnh nét hơn
    if (mz && mz !== S.nguonZ && S.map.getZoom() > Math.min(mz, S.nguonZ)) taoNguon(mz);
  }

  // chữ "Google Maps" + bản quyền ảnh, góc dưới trái
  class NhanGoogle {
    onAdd() {
      const d = document.createElement("div");
      d.className = "maplibregl-ctrl gsat-nhan";
      d.hidden = true;
      d.innerHTML = `<span class="gsat-logo" role="img" aria-label="Google Maps">Google Maps</span><span class="gsat-bq"></span>`;
      d.title = "Ảnh vệ tinh: Google Maps Platform — bấm để xem đủ nguồn ảnh";
      d.addEventListener("click", () => d.classList.toggle("mo"));
      S.nhan = d;
      return d;
    }
    onRemove() { if (S.nhan) S.nhan.remove(); }
  }
  function veNhan() {
    if (!S.nhan) return;
    S.nhan.hidden = !S.bat;
    S.nhan.querySelector(".gsat-bq").textContent = S.banQuyen ? " " + S.banQuyen : "";
  }

  function veEsri(thongBao) {
    S.bat = false;
    if (S.map.getLayer("gsat")) S.map.setLayoutProperty("gsat", "visibility", "none");
    veNhan();
    if (thongBao) S.h.toast(thongBao);
    if (S.h.veEsri) S.h.veEsri();
  }

  // bật / tắt ảnh Google (app.js gọi khi đổi nền)
  async function bat(on) {
    S.bat = !!on;
    const m = S.map;
    if (on) { S.baoLoi = false; S.thuLai = 0; }
    if (!on) { if (m.getLayer("gsat")) m.setLayoutProperty("gsat", "visibility", "none"); veNhan(); return true; }
    if (S.dangMo) return S.dangMo;
    S.dangMo = (async () => {
      try {
        S.key = await layKhoa();
        S.session = await layPhien(S.key);
        let moiTao = false;
        if (!m.getSource("gsat")) {
          let z = 19;
          try { const j = await vungNhin(); S.banQuyen = j.copyright || ""; const c = m.getCenter(); z = maxZoomTai(j.maxZoomRects, c.lng, c.lat) || 19; } catch (_) { /* dùng 19 */ }
          taoNguon(Math.min(22, z));
          moiTao = true;
        }
        if (!S.bat) return false;           // người dùng đã đổi nền trong lúc chờ
        m.setLayoutProperty("gsat", "visibility", "visible");
        veNhan();
        if (!moiTao) capNhatVung();
        return true;
      } catch (e) {
        if (e.message === "chua-cau-hinh") veEsri("Ảnh vệ tinh Google chưa được cài đặt khoá — đang dùng ảnh Esri");
        else if (e.status === 403 || e.status === 429) veEsri("Ảnh Google hết hạn mức hôm nay hoặc khoá bị chặn — đang dùng ảnh Esri");
        else veEsri("Không tải được ảnh Google (" + (e.status || e.message || "lỗi mạng") + ") — đang dùng ảnh Esri");
        return false;
      } finally { S.dangMo = null; }
    })();
    return S.dangMo;
  }

  function init(map, helpers) {
    S.map = map; S.h = helpers || {};
    map.addControl(new NhanGoogle(), "bottom-left");
    // nút "Google" chỉ hiện khi máy chủ đã có khoá (chủ ứng dụng cài xong là tự hiện, không cần sửa mã)
    const nut = document.querySelector('.basemap button[data-base="gsat"]');
    if (nut) layKhoa().then(() => { nut.hidden = false; }).catch(() => {});
    map.on("moveend", () => { clearTimeout(S.hen); S.hen = setTimeout(capNhatVung, 400); });
    // lỗi ô ảnh: 403/429 = hết hạn mức / khoá bị chặn → về Esri; 400/401 = phiên hết hạn → tạo phiên mới (1 lần)
    map.on("error", (ev) => {
      if (!ev || ev.sourceId !== "gsat" || !S.bat) return;
      const st = ev.error && ev.error.status;
      if ((st === 403 || st === 429) && !S.baoLoi) {
        S.baoLoi = true;
        LS.set("khoa", null);
        veEsri("Ảnh Google hết hạn mức hôm nay hoặc khoá bị chặn — đã chuyển về ảnh Esri");
      } else if ((st === 400 || st === 401) && S.thuLai < 1) {
        S.thuLai++;
        layPhien(S.key, true).then((s) => { S.session = s; taoNguon(S.nguonZ || 19); }).catch(() => {});
      }
    });
  }

  Object.assign(root.VN, { googleInit: init, googleBat: bat, gsatMaxZoomTai: maxZoomTai, gsatUrlO: urlO });
})(typeof window !== "undefined" ? window : globalThis);
