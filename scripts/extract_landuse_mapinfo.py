"""
Tạo lớp quy hoạch CÓ LOẠI ĐẤT + MÀU từ bản MapInfo gốc (thư mục MAP/, xuất từ DGN quy hoạch).

Nguồn (đã kiểm tra với bản đồ Điều chỉnh QHSDĐ đến 2030 huyện Hướng Hóa):
    MAP/Level 30.tab  — 19 809 vùng tô màu (màu gốc của bản đồ quy hoạch)
    MAP/Level 33.tab  — ~9 900 nhãn mã loại đất (CLN, HNK, ONT+CLN, …)

Cách gán:
    1. Nhãn nằm trong vùng nào thì vùng đó mang mã của nhãn (nhiều vùng lồng nhau → vùng nhỏ nhất).
    2. Vùng không có nhãn: suy ra từ màu — màu ứng với một mã ≥ 90 %, hoặc mọi mã của màu đó có chung
       một mã thành phần (ONT+CLN, ONT+HNK → ONT), hoặc màu chuẩn (#ffaa32 → DGT).
    3. Màu dùng chung cho cả nhóm (công trình công cộng…): chỉ ghi tên nhóm (nguon = "nhom").
    4. Còn lại: để trống (nguon = null).

Ra:
    data/QHHUONGHOA_30.geojson      — VN-2000 (EPSG:9212), thuộc tính ma_dat, ten_dat, mau, nguon
    docs/data/quyhoach_chugiai.json — chú giải: mã, tên, màu, số thửa

Chạy (cần pyogrio + shapely):
    python scripts/extract_landuse_mapinfo.py "đường/dẫn/MAP"
"""
import collections
import json
import re
import sys
from pathlib import Path

import shapely
from pyogrio import raw
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent

# Tên loại đất theo hệ thống mã của Luật Đất đai 2024 / Thông tư 08/2024/TT-BTNMT
TEN_LOAI_DAT = {
    "LUC": "Đất chuyên trồng lúa", "LUK": "Đất trồng lúa còn lại", "HNK": "Đất trồng cây hằng năm khác",
    "CLN": "Đất trồng cây lâu năm", "RSX": "Đất rừng sản xuất", "RPH": "Đất rừng phòng hộ",
    "RDD": "Đất rừng đặc dụng", "NTS": "Đất nuôi trồng thủy sản", "NKH": "Đất nông nghiệp khác",
    "ONT": "Đất ở tại nông thôn", "ODT": "Đất ở tại đô thị", "TSC": "Đất xây dựng trụ sở cơ quan",
    "CQP": "Đất quốc phòng", "CAN": "Đất an ninh", "DVH": "Đất xây dựng cơ sở văn hóa",
    "DXH": "Đất xây dựng cơ sở dịch vụ xã hội", "DYT": "Đất xây dựng cơ sở y tế",
    "DGD": "Đất xây dựng cơ sở giáo dục và đào tạo", "DTT": "Đất xây dựng cơ sở thể dục thể thao",
    "DKH": "Đất xây dựng cơ sở khoa học và công nghệ", "DNG": "Đất xây dựng cơ sở ngoại giao",
    "DSK": "Đất xây dựng công trình sự nghiệp khác", "SKK": "Đất khu kinh tế", "SKN": "Đất khu công nghiệp",
    "SKC": "Đất cơ sở sản xuất phi nông nghiệp", "TMD": "Đất thương mại, dịch vụ",
    "SKS": "Đất sử dụng cho hoạt động khoáng sản", "DGT": "Đất công trình giao thông",
    "DTL": "Đất công trình thủy lợi", "DNL": "Đất công trình năng lượng, chiếu sáng công cộng",
    "DBV": "Đất công trình bưu chính, viễn thông", "DCH": "Đất chợ dân sinh, chợ đầu mối",
    "DDT": "Đất có di tích lịch sử - văn hóa, danh lam thắng cảnh", "DRA": "Đất công trình xử lý chất thải",
    "DKV": "Đất khu vui chơi, giải trí công cộng", "DTS": "Đất xây dựng trụ sở của tổ chức sự nghiệp",
    "TON": "Đất tôn giáo", "TIN": "Đất tín ngưỡng", "NTD": "Đất nghĩa trang, nhà tang lễ, cơ sở hỏa táng",
    "SON": "Đất có mặt nước dạng sông, ngòi, kênh, rạch, suối", "MNC": "Đất có mặt nước chuyên dùng",
    "PNK": "Đất phi nông nghiệp khác", "DCS": "Đất chưa sử dụng",
}
MA_HOP_LE = re.compile(r"^[A-Z]{3}(\+[A-Z]{3})*$")

# Màu chuẩn (bảng màu bản đồ quy hoạch sử dụng đất) cho loại đất thường KHÔNG ghi nhãn trên bản đồ
MAU_CHUAN = {"#ffaa32": "DGT"}   # đường giao thông: RGB 255,170,50

# Màu dùng chung cho cả một nhóm mã → không biết mã cụ thể, chỉ ghi tên nhóm
NHOM_THEO_MAU = {
    "#ffaaa0": "Đất công trình công cộng, sự nghiệp (chưa có nhãn mã)",
    "#faaaa0": "Đất sản xuất, kinh doanh phi nông nghiệp (chưa có nhãn mã)",
}


def ten_dat(ma):
    return " + ".join(TEN_LOAI_DAT.get(m, m) for m in ma.split("+"))


def read_layer(path, layer):
    meta, _, geom, fields = raw.read(path, sql=f'SELECT OGR_STYLE AS s FROM "{layer}"', sql_dialect="OGRSQL")
    return shapely.from_wkb(geom), fields[0]


def main(map_dir):
    map_dir = Path(map_dir)
    polys, pstyles = read_layer(map_dir / "Level 30.tab", "Level 30")
    labels, lstyles = read_layer(map_dir / "Level 33.tab", "Level 33")

    # --- Vùng + màu ---
    keep = [i for i, g in enumerate(polys) if g is not None and g.geom_type in ("Polygon", "MultiPolygon")]
    geoms = [polys[i] for i in keep]
    colors = []
    for i in keep:
        m = re.search(r"BRUSH\([^)]*fc:(#[0-9a-fA-F]{6})", pstyles[i] or "")
        colors.append(m.group(1).lower() if m else None)
    areas = shapely.area(geoms)
    tree = STRtree(geoms)
    print(f"Vùng: {len(geoms)}")

    # --- Gán mã theo nhãn ---
    ma = [None] * len(geoms)
    n_lbl = n_out = n_conflict = 0
    for g, s in zip(labels, lstyles):
        if g is None or g.geom_type != "Point":
            continue
        m = re.search(r'LABEL\([^)]*t:"([^"]*)"', s or "")
        code = m.group(1).strip().upper().replace(" ", "") if m else ""
        if not MA_HOP_LE.match(code):
            continue
        n_lbl += 1
        hits = tree.query(g, predicate="intersects")
        if len(hits) == 0:
            n_out += 1
            continue
        j = int(min(hits, key=lambda k: areas[k]))
        if ma[j] and ma[j] != code:
            n_conflict += 1
            continue          # giữ nhãn đầu tiên
        ma[j] = code
    print(f"Nhãn hợp lệ: {n_lbl}, ngoài mọi vùng: {n_out}, vùng có 2 nhãn khác nhau: {n_conflict}")

    # --- Suy ra mã từ màu cho vùng không có nhãn ---
    by_color = collections.defaultdict(collections.Counter)
    for c, m in zip(colors, ma):
        if c and m:
            by_color[c][m] += 1
    color_code = {}
    for c, cnt in by_color.items():
        code, k = cnt.most_common(1)[0]
        total = sum(cnt.values())
        if k / total >= 0.9 and total >= 5:
            color_code[c] = code
        elif total >= 5:
            # ≥ 90 % mã của màu này cùng chứa một mã thành phần (vd ONT+CLN, ONT+HNK, ONT → ONT)
            parts = collections.Counter(p for m, k in cnt.items() for p in set(m.split("+")) for _ in range(k))
            common = {p for p, k in parts.items() if k / total >= 0.9}
            if common:
                color_code[c] = "+".join(sorted(common))
    # Màu chuẩn bản đồ quy hoạch cho loại đất thường không ghi nhãn
    for c, code in MAU_CHUAN.items():
        color_code.setdefault(c, code)

    nguon, nhom = [], []
    for j in range(len(geoms)):
        nhom.append(NHOM_THEO_MAU.get(colors[j]))
        if ma[j]:
            nguon.append("nhan")
        elif colors[j] in color_code:
            ma[j] = color_code[colors[j]]
            nguon.append("mau")
        else:
            nguon.append("nhom" if nhom[j] else None)
    cnt_src = collections.Counter(nguon)
    print(f"Có mã theo nhãn: {cnt_src['nhan']}, suy từ màu: {cnt_src['mau']}, "
          f"chỉ biết nhóm: {cnt_src['nhom']}, chưa xác định: {cnt_src[None]}")
    unk = collections.Counter(colors[j] for j in range(len(geoms)) if nguon[j] is None)
    if unk:
        print("   Màu của vùng chưa xác định:", unk.most_common(8))

    # --- Ghi GeoJSON (giữ nguyên hệ VN-2000, toạ độ [Đông, Bắc]) ---
    out = ROOT / "data" / "QHHUONGHOA_30.geojson"
    feats = []
    for j, g in enumerate(geoms):
        props = {"ma_dat": ma[j], "ten_dat": ten_dat(ma[j]) if ma[j] else nhom[j],
                 "mau": colors[j], "nguon": nguon[j]}
        feats.append({"type": "Feature", "properties": props,
                      # làm tròn toạ độ 3 số lẻ (mm) — không dùng set_precision vì nó sửa cả hình học
                      "geometry": json.loads(shapely.to_geojson(shapely.transform(g, lambda c: c.round(3))))})
    with open(out, "w", encoding="utf-8") as f:
        f.write('{"type":"FeatureCollection","name":"QHHUONGHOA_30",'
                '"crs":{"type":"name","properties":{"name":"urn:ogc:def:crs:EPSG::9212"}},"features":[\n')
        f.write(",\n".join(json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in feats))
        f.write("\n]}\n")
    print(f"Đã ghi {out} ({out.stat().st_size / 1e6:.1f} MB)")

    # --- Chú giải: mỗi mã đơn → màu phổ biến nhất ---
    legend = collections.defaultdict(lambda: {"so_thua": 0, "mau": collections.Counter()})
    for m, c in zip(ma, colors):
        if not m:
            continue
        legend[m]["so_thua"] += 1
        if c:
            legend[m]["mau"][c] += 1
    items = [{"ma": m, "ten": ten_dat(m), "mau": v["mau"].most_common(1)[0][0] if v["mau"] else None,
              "so_thua": v["so_thua"]} for m, v in legend.items()]
    items.sort(key=lambda x: -x["so_thua"])
    lg = ROOT / "docs" / "data" / "quyhoach_chugiai.json"
    lg.parent.mkdir(parents=True, exist_ok=True)
    lg.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Chú giải: {len(items)} mã → {lg}")
    for it in items[:15]:
        print(f"   {it['ma']:12} {it['mau']}  {it['so_thua']:5}  {it['ten']}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "MAP")
