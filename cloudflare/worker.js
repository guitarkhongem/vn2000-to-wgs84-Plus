/*
 * Cloudflare Worker — đếm lượt truy cập ứng dụng VN2000 ⇄ WGS84 theo ngày / quốc gia / thành phố.
 *
 *   POST /hit    (ứng dụng gửi khi mở trang)  → +1 lượt cho thành phố của người xem
 *   GET  /stats?tu=YYYY-MM-DD&den=YYYY-MM-DD   (cần khoá quản trị) → số liệu tổng hợp
 *
 * Thành phố / quốc gia lấy từ request.cf do chính Cloudflare cung cấp; KHÔNG lưu IP, không cookie,
 * không mã định danh. Liên kết (binding) cần có:
 *   DB              — cơ sở dữ liệu D1 (bảng trong schema.sql)
 *   ADMIN_KEY       — bí mật (Secret): khoá quản trị để xem thống kê
 *   ALLOWED_ORIGIN  — (tuỳ chọn) trang được phép gửi lượt, mặc định https://guitarkhongem.github.io
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cho = (env.ALLOWED_ORIGIN || "https://guitarkhongem.github.io").split(",").map((s) => s.trim());
    const cors = {
      "Access-Control-Allow-Origin": cho.includes(origin) ? origin : cho[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/hit" && request.method === "POST") {
      if (!cho.includes(origin)) return json({ ok: false, loi: "origin" }, 403);
      let moi = 0;
      try { const b = JSON.parse((await request.text()) || "{}"); moi = b && b.moi ? 1 : 0; } catch (_) { /* thân rỗng */ }
      const cf = request.cf || {};
      const cat = (s, n) => String(s || "").slice(0, n);
      const so = (v) => (v == null || v === "" || !isFinite(Number(v)) ? null : Number(v));   // cf.latitude là chuỗi
      const ngay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);   // giờ Việt Nam
      await env.DB.prepare(
        `INSERT INTO luot (ngay, quoc_gia, thanh_pho, vung, lat, lon, so_luot, so_moi)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)
         ON CONFLICT (ngay, quoc_gia, thanh_pho) DO UPDATE SET
           so_luot = so_luot + 1, so_moi = so_moi + excluded.so_moi,
           vung = excluded.vung, lat = COALESCE(excluded.lat, lat), lon = COALESCE(excluded.lon, lon)`)
        .bind(ngay, cat(cf.country, 2), cat(cf.city, 80), cat(cf.region, 80),
          so(cf.latitude), so(cf.longitude), moi)
        .run();
      return json({ ok: true });
    }

    if (url.pathname === "/stats" && request.method === "GET") {
      const key = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!env.ADMIN_KEY || !bang(key, env.ADMIN_KEY)) return json({ ok: false, loi: "khoa" }, 401);
      const ngayOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
      const tu = ngayOk(url.searchParams.get("tu")) ? url.searchParams.get("tu") : "0000-01-01";
      const den = ngayOk(url.searchParams.get("den")) ? url.searchParams.get("den") : "9999-12-31";
      const q = (sql) => env.DB.prepare(sql).bind(tu, den).all().then((r) => r.results || []);
      const [tong, ngay, quoc, pho] = await Promise.all([
        q(`SELECT COALESCE(SUM(so_luot),0) AS luot, COALESCE(SUM(so_moi),0) AS moi FROM luot WHERE ngay BETWEEN ?1 AND ?2`),
        q(`SELECT ngay, SUM(so_luot) AS luot, SUM(so_moi) AS moi FROM luot WHERE ngay BETWEEN ?1 AND ?2 GROUP BY ngay ORDER BY ngay`),
        q(`SELECT quoc_gia, SUM(so_luot) AS luot, SUM(so_moi) AS moi FROM luot WHERE ngay BETWEEN ?1 AND ?2
           GROUP BY quoc_gia ORDER BY luot DESC`),
        q(`SELECT quoc_gia, thanh_pho, MAX(vung) AS vung, AVG(lat) AS lat, AVG(lon) AS lon, SUM(so_luot) AS luot, SUM(so_moi) AS moi
           FROM luot WHERE ngay BETWEEN ?1 AND ?2 GROUP BY quoc_gia, thanh_pho ORDER BY luot DESC LIMIT 1000`),
      ]);
      return json({ ok: true, tu, den, tong: tong[0], theo_ngay: ngay, quoc_gia: quoc, thanh_pho: pho });
    }

    return json({ ok: true, ten: "VN2000-WGS84 thống kê truy cập" });
  },
};

// so sánh khoá không phụ thuộc thời gian
function bang(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
