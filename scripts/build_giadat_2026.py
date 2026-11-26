"""
Bảng giá đất tỉnh Quảng Trị áp dụng từ 01/01/2026 → dữ liệu cho WebGIS (docs/data/giadat_2026.json).

NGUỒN:
    - Nghị quyết 12/2025/NQ-HĐND ngày 11/12/2025 của HĐND tỉnh Quảng Trị quy định Bảng giá đất áp dụng
      từ ngày 01/01/2026 (Phụ lục I: đất nông nghiệp; Phụ lục II: đất ở; Phụ lục III: đất thương mại,
      dịch vụ và đất cơ sở sản xuất phi nông nghiệp).
    - Bản tổng hợp Excel "BANG GIA DAT 2026.xlsm" (78 xã, phường, đặc khu; mỗi đoạn đường kèm liên kết
      Google Maps điểm đầu → điểm cuối). File gốc KHÔNG nằm trong repo
      (máy tác giả: C:\\Users\\msi\\Downloads\\BANG GIA DAT 2026.xlsm).
    - Hình học đoạn đường: dò tuyến theo mạng đường © OpenStreetMap contributors (ODbL) bằng OSRM,
      giữa điểm đầu – (điểm giữa) – điểm cuối của liên kết Google Maps. Kết quả dò lưu ở
      data/giadat_tuyen.json (do scripts/do_tuyen_giadat.js tạo: {id: {"di_bo": …, "o_to": …}}), script này chỉ đọc lại.

Dò tuyến hai hồ sơ OSRM: "di_bo" (đi được hai chiều đường một chiều) và, với đoạn chưa đạt, "o_to".
Chọn tuyến theo thứ tự: hạng chất lượng tốt hơn, rồi tỉ lệ chiều dài nằm trên đường TRÙNG TÊN với tên
đường trong bảng giá ("khop", so tên OSM theo từng bước của tuyến; 'Quốc lộ 9' = 'QL9').

Kiểm tra chất lượng mỗi đoạn (trường "cl"):
    "tot"     — hai đầu bám đường ≤ 30 m, chiều dài tuyến ≤ 2,5 lần đường thẳng (hoặc đoạn < 60 m) và,
                khi so được tên (≥ 30 % tuyến nằm trên đường có tên), ≥ 50 % tuyến trùng tên đường
    "xem_lai" — dò được nhưng không đạt các điều kiện trên, đầu mút cách đường ≤ 150 m
    "thang"   — không dò được / đầu mút xa đường > 150 m → vẽ đường thẳng nối các điểm, nét đứt
Đoạn không có liên kết toạ độ vẫn được giữ để tra cứu theo xã và tên đường.

Chạy:  python scripts/build_giadat_2026.py "đường/dẫn/BANG GIA DAT 2026.xlsm"
       python scripts/build_giadat_2026.py "…xlsm" --diem data/giadat_diem.json   (chỉ xuất danh sách điểm để dò tuyến)
Cần: openpyxl.
"""
import json
import math
import re
from collections import defaultdict
import sys
import urllib.parse
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
TUYEN = ROOT / "data" / "giadat_tuyen.json"          # kết quả dò tuyến (cache)
LINK_RUT_GON = ROOT / "data" / "giadat_link_rut_gon.json"   # maps.app.goo.gl → link đầy đủ

NGUON = {
    "van_ban": "Nghị quyết 12/2025/NQ-HĐND ngày 11/12/2025 của HĐND tỉnh Quảng Trị — Bảng giá đất áp dụng "
               "từ 01/01/2026 (Phụ lục I, II, III)",
    "du_lieu": "Bản tổng hợp Excel \"BANG GIA DAT 2026.xlsm\" (78 xã, phường, đặc khu; liên kết Google Maps "
               "điểm đầu – điểm cuối từng đoạn đường)",
    "hinh_hoc": "Dò tuyến theo mạng đường © OpenStreetMap contributors (ODbL) — dữ liệu tải qua Overpass API "
                "(maps.mail.ru), dò đường ngắn nhất ưu tiên đúng tên trên máy; một phần dò bằng OSRM "
                "(routing.openstreetmap.de) — giữa các điểm của liên kết Google Maps; vị trí chỉ để tham khảo",
    "luu_y": "Giá đất xác định chính thức theo văn bản gốc và hồ sơ địa chính; vị trí (1–4) của thửa đất "
             "do cơ quan có thẩm quyền xác định.",
}

# ------------------------------------------------------------------ liên kết Google Maps
SO = r"(-?\d{1,3}\.\d+)"


def diem_tu_link(url, rut_gon=None):
    """Lấy danh sách (vĩ độ, kinh độ) từ liên kết google.com/maps/dir/A/B[/C]. None nếu không đọc được."""
    if not isinstance(url, str) or "google" not in url and "goo.gl" not in url:
        return None
    if "goo.gl" in url:
        url = (rut_gon or {}).get(url.strip())
        if not url:
            return None
    url = urllib.parse.unquote(url).replace("+", " ")
    if "/dir/" not in url:
        m = re.search(r"@" + SO + r"," + SO, url)
        return [(float(m.group(1)), float(m.group(2)))] if m else None
    pts = []
    for part in url.split("/dir/", 1)[1].split("/"):
        if part.startswith(("@", "data=", "am=")):
            break
        m = re.fullmatch(r"\s*" + SO + r"\s*,\s*" + SO + r"\s*", part)
        if m:
            pts.append((float(m.group(1)), float(m.group(2))))
    pts = [p for p in pts if 15.5 < p[0] < 18.5 and 105.0 < p[1] < 108.0]   # trong tỉnh Quảng Trị
    return pts or None


def khoang_cach(a, b):
    """Khoảng cách (m) gần đúng giữa hai điểm (vĩ, kinh) — đủ dùng cho kiểm tra chất lượng."""
    dy = (b[0] - a[0]) * 110_574
    dx = (b[1] - a[1]) * 111_320 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)

def don_gian(points, tol=1.5e-5):
    """Douglas–Peucker (≈ 1,5 m) để giảm số đỉnh tuyến dò được; points: [(lon, lat)]."""
    n = len(points)
    if n < 3:
        return [list(p) for p in points]
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = points[i], points[j]
        dx, dy = x2 - x1, y2 - y1
        d2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for k in range(i + 1, j):
            px, py = points[k]
            t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / d2)) if d2 else 0.0
            dist = (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2
            if dist > best:
                best, idx = dist, k
        if idx > 0 and best > tol * tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [list(p) for p, k in zip(points, keep) if k]

# ------------------------------------------------------------------ đối chiếu tên đường
import unicodedata  # noqa: E402

TU_BO = {"duong", "pho", "tuyen", "phai", "trai", "nhanh", "kiet", "hem", "ngo", "so", "khu", "vuc", "cac",
         "thon", "ban", "to", "dan", "pho", "xom"}


def chuan_hoa_ten(s):
    """Tên đường → chuỗi so sánh: bỏ dấu, chữ thường, 'Quốc lộ 9' → 'ql9', 'Tỉnh lộ 12' → 'tl12', bỏ ngoặc."""
    s = unicodedata.normalize("NFD", str(s or "")).replace("đ", "d").replace("Đ", "D")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\bquoc lo\s*", "ql", s)
    s = re.sub(r"\b(tinh lo|duong tinh|dt)\s*", "tl", s)
    s = re.sub(r"\b(ql|tl|dh|hl)[\s.]*(\d)", r"\1\2", s)
    # "QL1A" là tên cũ của QL1 (OSM ghi "Quốc lộ 1"/"QL.1"): bỏ hậu tố "a"; các tuyến 9D, 48B… giữ nguyên.
    s = re.sub(r"\b(ql|tl|dh|hl)(\d+)a\b", r"\1\2", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def khop_ten(ten_bang, ten_osm):
    """Tỉ lệ (0–1) từ khoá của tên đường trong bảng giá có mặt trong tên đường OSM."""
    a = [t for t in chuan_hoa_ten(ten_bang).split() if t not in TU_BO]
    b = set(chuan_hoa_ten(ten_osm).split())
    if not a or not b:
        return 0.0
    return sum(t in b for t in a) / len(a)


def ty_le_khop(ten_bang, buoc):
    """buoc: [[tên OSM, mét], …] của tuyến dò. Trả (tỉ lệ chiều dài nằm trên đường trùng tên,
    tỉ lệ chiều dài trên đường có tên). Tên khớp khi ≥ 60 % từ khoá trùng."""
    tong = sum(m for _, m in buoc) or 1
    co_ten = sum(m for t, m in buoc if t)
    trung = sum(m for t, m in buoc if t and khop_ten(ten_bang, t) >= 0.6)
    return trung / tong, co_ten / tong


# ------------------------------------------------------------------ chọn tuyến & đánh giá
def danh_gia(c, pts, ten):
    """Đánh giá một tuyến dò c = {toa_do, dai, bam, buoc} cho đoạn có các điểm pts và tên đường ten.
    Trả (hạng 0 = tốt / 1 = xem lại / 2 = nối thẳng, thông tin)."""
    thang = sum(khoang_cach(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
    if not c or not c.get("toa_do") or len(c["toa_do"]) < 2:
        return 2, {"cl": "thang", "dai": round(thang)}
    bam = max(c.get("bam") or [0])
    ti_le = c["dai"] / thang if thang > 1 else 1
    info = {"dai": round(c["dai"]), "bam": round(bam)}
    trung, co_ten = ty_le_khop(ten, c.get("buoc") or [])
    so_duoc = co_ten >= 0.3 and any(t not in TU_BO for t in chuan_hoa_ten(ten).split())
    if so_duoc:
        info["khop"] = round(trung, 2)
        if trung < 0.5:   # ghi tên OSM chiếm phần dài nhất để người xem tự đối chiếu
            dai_ten = defaultdict(float)
            for t, m in c.get("buoc") or []:
                if t:
                    dai_ten[t] += m
            if dai_ten:
                info["ten_osm"] = max(dai_ten, key=dai_ten.get)
    if bam <= 30 and (ti_le <= 2.5 or thang < 60) and (not so_duoc or trung >= 0.5):
        return 0, {**info, "cl": "tot"}
    if bam <= 150:
        return 1, {**info, "cl": "xem_lai"}
    return 2, {**info, "cl": "thang"}


def chon_tuyen(cac_tuyen, pts, ten):
    """cac_tuyen = {"di_bo": …, "o_to": …} (hồ sơ OSRM). Chọn tuyến hạng tốt nhất, cùng hạng thì
    tuyến trùng tên đường nhiều hơn. Trả (hình [[lon, lat]], thông tin)."""
    if len(pts) == 1:   # chỉ một điểm: không vẽ được đoạn, giữ làm điểm
        return [[pts[0][1], pts[0][0]]], {"cl": "thang", "dai": 0}
    best = None
    for ho_so, c in cac_tuyen.items():
        hang, info = danh_gia(c, pts, ten)
        key = (hang, -info.get("khop", 0))
        if hang < 2 and (best is None or key < best[0]):
            best = (key, c, {**info, "ho_so": ho_so})
    if best is None:
        _, info = danh_gia(None, pts, ten)
        return [[lo, la] for la, lo in pts], info
    _, c, info = best
    return don_gian([tuple(p) for p in c["toa_do"]]), info

# ------------------------------------------------------------------ đọc Excel
def so(v):
    return int(round(v)) if isinstance(v, (int, float)) else None


def doc_excel(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

    # Phụ lục I — đất nông nghiệp theo xã
    nn = {}
    for r in wb["PL I. Dat NN"].iter_rows(min_row=8, values_only=True):
        if isinstance(r[0], (int, float)) and r[1] and r[15]:
            nn[int(r[15])] = {"ten": r[1], "nhom": r[16], "huyen_cu": r[17], "tinh_cu": r[18],
                              "hnk": [so(v) for v in r[2:5]], "cln": [so(v) for v in r[5:8]],
                              "nts": [so(v) for v in r[8:11]], "rsx": [so(v) for v in r[11:13]],
                              "lmu": [so(v) for v in r[13:15]]}

    # Phụ lục III — TMDV & SXKD, ghép theo id đoạn đường
    tm = {}
    for r in wb["PL III. Dat TMDV, SKC"].iter_rows(min_row=9, values_only=True):
        if len(r) > 21 and r[21] and isinstance(r[4], (int, float)):
            tm[r[21]] = ([so(v) for v in r[4:8]], [so(v) for v in r[11:15]])

    # Phụ lục II — đất ở
    doan, ten_duong, xa = [], None, None
    for r in wb["PL II. Dat o"].iter_rows(min_row=9, values_only=True):
        if r[14] and not isinstance(r[4], (int, float)) and r[1] and r[1] == r[14]:
            xa, ten_duong = r[14], None          # dòng tiêu đề xã
            continue
        if not isinstance(r[4], (int, float)) or not r[12]:
            continue
        if r[1]:
            ten_duong = str(r[1]).strip()
        gia_tm, gia_sx = tm.get(r[12], (None, None))
        doan.append({
            "id": r[12], "stt": str(r[0]) if r[0] is not None else None,
            "xa_id": int(r[13]) if r[13] else None, "xa": r[14] or xa,
            "xa_cu": r[16] if len(r) > 16 else None,
            "duong": ten_duong, "tu": (str(r[2]).strip() if r[2] else ""), "den": (str(r[3]).strip() if r[3] else ""),
            "o": [so(v) for v in r[4:8]], "o_cu": so(r[8]),
            "tm": gia_tm, "sx": gia_sx,
            "link": r[18] if len(r) > 18 else None,
            "bddc": r[19] if len(r) > 19 else None,
        })
    return doan, nn

# ------------------------------------------------------------------ chính
def main(src, diem_out=None):
    rut_gon = json.loads(LINK_RUT_GON.read_text(encoding="utf-8")) if LINK_RUT_GON.exists() else {}
    doan, nn = doc_excel(src)
    for d in doan:
        d["diem"] = diem_tu_link(d["link"], rut_gon)

    if diem_out:   # danh sách để dò tuyến
        ds = [{"id": d["id"], "duong": d["duong"], "diem": d["diem"]} for d in doan if d["diem"]]
        chua = sorted({d["link"].strip() for d in doan if isinstance(d["link"], str) and "goo.gl" in d["link"]
                       and not d["diem"]})
        Path(diem_out).write_text(json.dumps({"doan": ds, "link_rut_gon": chua}, ensure_ascii=False), encoding="utf-8")
        print(f"{len(ds)} đoạn có toạ độ, {len(chua)} liên kết rút gọn chưa giải")
        return

    tuyen = json.loads(TUYEN.read_text(encoding="utf-8")) if TUYEN.exists() else {}
    out, thong_ke = [], {"tot": 0, "xem_lai": 0, "thang": 0, "khong_toa_do": 0}
    for d in doan:
        rec = {k: d[k] for k in ("xa_id", "xa", "xa_cu", "duong", "tu", "den", "o", "o_cu", "tm", "sx")}
        if d["bddc"]:
            rec["bddc"] = d["bddc"]
        pts = d["diem"]
        if not pts:
            thong_ke["khong_toa_do"] += 1
        else:
            hinh, info = chon_tuyen(tuyen.get(d["id"]) or {}, pts, d["duong"])
            rec.update(info, hinh=hinh)
            cl = info["cl"]
            thong_ke[cl] += 1
            rec["hinh"] = [[round(x, 5), round(y, 5)] for x, y in rec["hinh"]]
        out.append(rec)

    dst = ROOT / "docs" / "data" / "giadat_2026.json"
    dst.write_text(json.dumps({"nguon": NGUON, "nong_nghiep": nn, "doan": out}, ensure_ascii=False,
                              separators=(",", ":")), encoding="utf-8")
    print(f"{len(out)} đoạn đường, {len(nn)} xã; chất lượng hình học: {thong_ke}; "
          f"file {dst.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    args = sys.argv[1:]
    diem = args[args.index("--diem") + 1] if "--diem" in args else None
    main(args[0], diem)
