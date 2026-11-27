/*
 * Thống kê truy cập: mỗi lần mở ứng dụng gửi 1 "lượt" tới máy chủ thống kê của chủ ứng dụng (Cloudflare Worker,
 * xem thư mục cloudflare/). Máy chủ tự biết thành phố / quốc gia từ mạng Cloudflare — ứng dụng KHÔNG gửi IP, vị trí,
 * toạ độ hay dữ liệu người dùng nhập; trình duyệt bật "Do Not Track" thì không gửi.
 *
 * Dòng chữ "📊 Thống kê truy cập" chỉ hiện cho chủ ứng dụng: mở trang với đường dẫn có ?thongke (hoặc #thongke)
 * một lần, máy đó nhớ. Bấm vào chữ → hộp thống kê; nhập khoá quản trị (ADMIN_KEY đặt trên Cloudflare). Tuỳ biến:
 * khoảng thời gian, xem theo quốc gia / thành phố, hiện trên bản đồ, không đếm máy của mình, tải CSV.
 *
 * "Lượt khách" = số máy (trình duyệt) khác nhau trong ngày — lần mở đầu tiên mỗi ngày gửi kèm moi=1
 * (ghi nhớ ngày trong localStorage), cộng dồn các ngày; không phải số người duy nhất trong cả khoảng.
 */
(function (root) {
  "use strict";
  root.VN = root.VN || {};
  const API = String(root.VN_THONGKE_API || "").replace(/\/+$/, "");
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem("vn_tk_" + k); return v == null ? d : v; } catch (_) { return d; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem("vn_tk_" + k); else localStorage.setItem("vn_tk_" + k, v); } catch (_) { /* bỏ qua */ } },
  };
  const homNay = (lui = 0) => new Date(Date.now() + 7 * 3600e3 - lui * 86400e3).toISOString().slice(0, 10);   // giờ VN

  // ---------------- gửi lượt xem ----------------
  function guiLuot() {
    if (!API) return;
    if (navigator.doNotTrack === "1" || root.doNotTrack === "1" || navigator.globalPrivacyControl) return;
    if (LS.get("bo_qua", "") === "1") return;
    let moi = 0;
    if (LS.get("ngay", "") !== homNay()) { moi = 1; LS.set("ngay", homNay()); }
    const body = JSON.stringify({ moi });
    try { if (navigator.sendBeacon && navigator.sendBeacon(API + "/hit", new Blob([body], { type: "text/plain" }))) return; } catch (_) { /* thử fetch */ }
    fetch(API + "/hit", { method: "POST", body, headers: { "Content-Type": "text/plain" }, keepalive: true }).catch(() => {});
  }

  // ---------------- tab quản trị ----------------
  const S = { map: null, h: null, data: null, xem: "quoc_gia" };
  const tenNuoc = (() => {
    let dn = null;
    try { dn = new Intl.DisplayNames(["vi"], { type: "region" }); } catch (_) { /* trình duyệt cũ */ }
    return (c) => { if (!c) return "Không rõ"; try { return (dn && dn.of(c)) || c; } catch (_) { return c; } };
  })();
  const co = (c) => (/^[A-Z]{2}$/.test(c || "") ? String.fromCodePoint(...[...c].map((x) => 0x1f1a5 + x.charCodeAt(0))) : "🏳");

  // gắn sự kiện cho hộp thống kê (một lần)
  function ganHop() {
    const $ = (id) => document.getElementById(id), dlg = $("tk-dlg");
    const dong = () => { if (dlg.open) dlg.close(); };
    $("tk-dong").addEventListener("click", dong);
    $("tk-dong2").addEventListener("click", dong);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dong(); });   // bấm ra ngoài hộp
    $("tk-an").addEventListener("click", () => {
      LS.set("admin", null); dong(); $("tk-mo").hidden = true; xoaBanDo();
      S.h.toast("Đã ẩn mục thống kê — mở lại bằng đường dẫn có ?thongke");
    });
    if (!API) {
      $("tk-noi-dung").innerHTML = `<p class="lf-loi">Chưa kết nối máy chủ thống kê. Làm theo <b>cloudflare/HUONG_DAN.md</b> trong mã nguồn,
        rồi điền địa chỉ Worker vào <code>docs/js/thongke-config.js</code>.</p>`;
      return;
    }
    $("tk-khoa").value = LS.get("khoa", "");
    $("tk-bo-qua").checked = LS.get("bo_qua", "") === "1";
    $("tk-khoang").value = LS.get("khoang", "30");
    capNhatKhoang();
    $("tk-khoang").addEventListener("change", () => { LS.set("khoang", $("tk-khoang").value); capNhatKhoang(); tai(); });
    $("tk-tu").addEventListener("change", tai);
    $("tk-den").addEventListener("change", tai);
    $("tk-xem").addEventListener("click", () => { LS.set("khoa", $("tk-khoa").value.trim()); tai(); });
    $("tk-khoa").addEventListener("keydown", (e) => { if (e.key === "Enter") $("tk-xem").click(); });
    $("tk-bo-qua").addEventListener("change", (e) => { LS.set("bo_qua", e.target.checked ? "1" : null); S.h.toast(e.target.checked ? "Máy này không được đếm nữa" : "Máy này được đếm lại"); });
    $("tk-ban-do").addEventListener("change", (e) => {
      veBanDo();
      if (e.target.checked && S.data) { dong(); nhinBanDo(); }   // đóng hộp để thấy bản đồ
    });
    $("tk-csv").addEventListener("click", taiCsv);
    document.querySelectorAll("#tk-tabs button").forEach((b) => b.addEventListener("click", () => {
      S.xem = b.dataset.xem;
      document.querySelectorAll("#tk-tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      veBang();
    }));
  }

  // bấm chữ "Thống kê truy cập" → mở hộp, tải số liệu mới nhất nếu đã có khoá
  function moHop() {
    const dlg = document.getElementById("tk-dlg");
    if (!S.daGanHop) { S.daGanHop = true; ganHop(); }
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    const khoa = document.getElementById("tk-khoa");
    if (API && khoa && khoa.value) tai(); else if (khoa) khoa.focus();
  }

  function capNhatKhoang() {
    const v = document.getElementById("tk-khoang").value;
    document.getElementById("tk-tuy-chon").hidden = v !== "tuy";
    if (v === "tuy" && !document.getElementById("tk-tu").value) {
      document.getElementById("tk-tu").value = homNay(29); document.getElementById("tk-den").value = homNay();
    }
  }
  function khoang() {
    const v = document.getElementById("tk-khoang").value;
    if (v === "tuy") return [document.getElementById("tk-tu").value || "0000-01-01", document.getElementById("tk-den").value || "9999-12-31"];
    if (v === "all") return ["0000-01-01", "9999-12-31"];
    return [homNay(Number(v) - 1), homNay()];
  }

  async function tai() {
    const khoa = document.getElementById("tk-khoa").value.trim(), tt = document.getElementById("tk-tt");
    if (!khoa) { tt.textContent = "Nhập khoá quản trị (ADMIN_KEY) rồi bấm Xem."; return; }
    const [tu, den] = khoang();
    tt.textContent = "Đang tải…";
    try {
      const r = await fetch(`${API}/stats?tu=${tu}&den=${den}`, { headers: { Authorization: "Bearer " + khoa }, cache: "no-store" });
      if (r.status === 401) { tt.textContent = "Sai khoá quản trị."; return; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      S.data = await r.json();
      LS.set("khoa", khoa);
      ve();
    } catch (e) { tt.textContent = "Không tải được thống kê: " + (e.message || e); }
  }

  function ve() {
    const d = S.data, f = (v) => S.h.fmt(v || 0, 0);
    const moc = d.tu === "0000-01-01" ? "từ đầu" : `${d.tu.split("-").reverse().join("/")} – ${d.den.split("-").reverse().join("/")}`;
    document.getElementById("tk-tt").innerHTML = `<b>${f(d.tong.luot)}</b> lượt xem · <b>${f(d.tong.moi)}</b> lượt khách · ` +
      `${d.quoc_gia.length} quốc gia · ${d.thanh_pho.length} thành phố <span class="muted">(${moc})</span>`;
    // biểu đồ cột theo ngày, ngày không có lượt = cột trống (tối đa 120 ngày gần nhất)
    const ng = dayNgay(d), max = Math.max(1, ...ng.map((x) => x.luot));
    document.getElementById("tk-cot").innerHTML = ng.length ? ng.map((x) =>
      `<span class="tk-c" style="height:${Math.max(2, (x.luot / max) * 100)}%" title="${x.ngay.split("-").reverse().join("/")}: ${x.luot} lượt xem, ${x.moi} khách"></span>`).join("")
      : `<span class="muted small">Chưa có lượt nào trong khoảng này</span>`;
    veBang();
    veBanDo();
  }

  function dayNgay(d) {
    const co = new Map(d.theo_ngay.map((x) => [x.ngay, x]));
    if (!d.theo_ngay.length) return [];
    let dau = d.tu > d.theo_ngay[0].ngay ? d.tu : d.theo_ngay[0].ngay;
    const cuoi = [d.den, homNay(), d.theo_ngay[d.theo_ngay.length - 1].ngay].sort()[1];
    const ra = [], t = new Date(dau + "T00:00:00Z");
    for (let i = 0; i < 4000; i++, t.setUTCDate(t.getUTCDate() + 1)) {
      const k = t.toISOString().slice(0, 10);
      if (k > cuoi) break;
      ra.push(co.get(k) || { ngay: k, luot: 0, moi: 0 });
    }
    return ra.slice(-120);
  }

  function veBang() {
    const d = S.data; if (!d) return;
    const e = S.h.escapeHtml, f = (v) => S.h.fmt(v || 0, 0), tong = d.tong.luot || 1;
    const ds = S.xem === "quoc_gia" ? d.quoc_gia : d.thanh_pho;
    const dong = ds.slice(0, 300).map((x) => {
      const ten = S.xem === "quoc_gia" ? `${co(x.quoc_gia)} ${e(tenNuoc(x.quoc_gia))}`
        : `${co(x.quoc_gia)} ${e(x.thanh_pho || "Không rõ")}${x.vung && x.vung !== x.thanh_pho ? ` <small class="muted">${e(x.vung)}</small>` : ""}`;
      return `<tr><td>${ten}</td><td class="so">${f(x.luot)}</td><td class="so">${f(x.moi)}</td>` +
        `<td class="tk-pt"><span style="width:${(x.luot / tong) * 100}%"></span></td></tr>`;
    }).join("");
    document.getElementById("tk-bang").innerHTML = `<table><thead><tr><th>${S.xem === "quoc_gia" ? "Quốc gia" : "Thành phố"}</th>` +
      `<th class="so">Lượt xem</th><th class="so" title="Số máy (trình duyệt) khác nhau mỗi ngày, cộng các ngày">Khách</th><th></th></tr></thead><tbody>${dong || `<tr><td colspan="4" class="muted">Chưa có dữ liệu</td></tr>`}</tbody></table>`;
  }

  // bản đồ: vòng tròn tại thành phố, to theo số lượt
  function xoaBanDo() {
    const m = S.map; if (!m) return;
    for (const l of ["tk-diem", "tk-chu"]) if (m.getLayer(l)) m.removeLayer(l);
    if (m.getSource("tk")) m.removeSource("tk");
  }
  function veBanDo() {
    const m = S.map; if (!m) return;
    const bat = document.getElementById("tk-ban-do").checked && S.data;
    if (!bat) { xoaBanDo(); return; }
    const fc = { type: "FeatureCollection", features: S.data.thanh_pho.filter((x) => x.lat != null && x.lon != null && isFinite(x.lat) && isFinite(x.lon))
      .map((x) => ({ type: "Feature", geometry: { type: "Point", coordinates: [x.lon, x.lat] },
        properties: { ten: `${x.thanh_pho || "Không rõ"}, ${tenNuoc(x.quoc_gia)}`, luot: x.luot, moi: x.moi } })) };
    if (m.getSource("tk")) { m.getSource("tk").setData(fc); return; }
    m.addSource("tk", { type: "geojson", data: fc, attribution: "Vị trí lượt truy cập: Cloudflare (ước tính theo địa chỉ mạng)" });
    m.addLayer({ id: "tk-diem", type: "circle", source: "tk", paint: {
      "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "luot"]], 1, 5, 10, 14, 40, 30],
      "circle-color": "#7c3aed", "circle-opacity": 0.55, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
    if (S.daGan) return;
    S.daGan = true;   // gắn sự kiện một lần (lớp có thể bị xoá rồi tạo lại)
    m.on("click", "tk-diem", (ev) => {
      const p = ev.features[0].properties, e = S.h.escapeHtml;
      new root.maplibregl.Popup().setLngLat(ev.lngLat).setHTML(`<b>${e(p.ten)}</b><br>${p.luot} lượt xem · ${p.moi} lượt khách`).addTo(m);
    });
    m.on("mouseenter", "tk-diem", () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "tk-diem", () => { m.getCanvas().style.cursor = ""; });
  }

  function nhinBanDo() {
    const m = S.map, d = S.data; if (!m || !d || !root.maplibregl) return;
    const ds = d.thanh_pho.filter((x) => x.lat != null && x.lon != null && isFinite(x.lat) && isFinite(x.lon));
    if (!ds.length) { S.h.toast("Chưa có thành phố nào có toạ độ"); return; }
    const b = new root.maplibregl.LngLatBounds([ds[0].lon, ds[0].lat], [ds[0].lon, ds[0].lat]);
    ds.forEach((x) => b.extend([x.lon, x.lat]));
    try { m.fitBounds(b, { padding: 60, maxZoom: 8, duration: 600 }); } catch (_) { /* bỏ qua */ }
    S.h.toast(`Đang hiện ${ds.length} thành phố trên bản đồ — bấm "📊 Thống kê truy cập" để mở lại bảng`);
  }

  function taiCsv() {
    const d = S.data; if (!d) { S.h.toast("Chưa có số liệu"); return; }
    const q = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const L = ["Quoc gia,Ma,Thanh pho,Vung,Vi do,Kinh do,Luot xem,Luot khach"];
    d.thanh_pho.forEach((x) => L.push([q(tenNuoc(x.quoc_gia)), x.quoc_gia, q(x.thanh_pho), q(x.vung), x.lat ?? "", x.lon ?? "", x.luot, x.moi].join(",")));
    L.push("", "Ngay,Luot xem,Luot khach");
    d.theo_ngay.forEach((x) => L.push([x.ngay, x.luot, x.moi].join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + L.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `thong_ke_truy_cap_${d.tu}_${d.den}.csv`.replace(/0000-01-01|9999-12-31/g, "all");
    document.body.appendChild(a); a.click(); a.remove();
  }

  function init(map, helpers) {
    S.map = map; S.h = helpers;
    const note = document.getElementById("tk-note");
    if (note) note.hidden = !API;
    const q = new URLSearchParams(location.search);
    if (q.has("thongke") || /thongke/.test(location.hash)) LS.set("admin", "1");
    const nut = document.getElementById("tk-mo");
    if (nut && LS.get("admin", "") === "1") {
      nut.hidden = false;
      nut.addEventListener("click", moHop);
    }
  }

  guiLuot();
  Object.assign(root.VN, { thongKeInit: init, tkCo: co, tkTenNuoc: tenNuoc, tkHomNay: homNay, tkDayNgay: dayNgay });
})(typeof window !== "undefined" ? window : globalThis);
