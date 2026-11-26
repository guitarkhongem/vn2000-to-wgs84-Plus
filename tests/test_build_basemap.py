"""Test script tạo nền hành chính NV25-44 (scripts/build_basemap_nv2544.py) — không cần dữ liệu gốc."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_basemap_nv2544 as B  # noqa: E402

from functions.converter import wgs84_to_vn2000_baibao  # noqa: E402


@pytest.mark.parametrize("lat, lon", [(4.5, 102.0), (16.6, 106.7), (21.03, 105.85), (9.0, 117.5), (23.4, 109.5)])
def test_lambert_thuan_nguoc(lat, lon):
    east, north = B.lcc_forward(lat, lon)
    lat2, lon2 = B.lcc_inverse(east, north)
    assert lat2 == pytest.approx(lat, abs=1e-9)
    assert lon2 == pytest.approx(lon, abs=1e-9)


def test_lambert_tren_kinh_tuyen_truc():
    """Trên kinh tuyến trục 108°: Đông = False Easting."""
    east, _ = B.lcc_forward(15.0, 108.0)
    assert east == pytest.approx(1_000_000.0, abs=1e-6)


def test_lcc_to_wgs84_dung_ham_cua_app():
    """Điểm Lambert → WGS84 phải bằng: địa lý VN-2000 → (app) WGS84 → (app) ngược về VN-2000 phẳng
    trùng với TM-3 của script (sai < 1 cm)."""
    lat_vn, lon_vn = 16.6, 106.7
    lon_w, lat_w = B.lcc_to_wgs84(*B.lcc_forward(lat_vn, lon_vn))
    lon0 = round(lon_vn * 4) / 4
    x, y, _ = wgs84_to_vn2000_baibao(lat_w, lon_w, 0.0, lon0)
    x2, y2 = B.tm3_forward(lat_vn, lon_vn, lon0)
    assert x == pytest.approx(x2, abs=0.01)
    assert y == pytest.approx(y2, abs=0.01)
    # VN-2000 lệch WGS84 khoảng 100–250 m ở Việt Nam → phải thấy độ lệch đó (không quên Helmert)
    assert 50 < abs(lon_w - lon_vn) * 106_000 + abs(lat_w - lat_vn) * 110_600 < 500


def test_don_gian_hoa_giu_dau_cuoi():
    line = [(0, 0), (1, 0.00001), (2, 0), (3, 5), (4, 0)]
    out = B.simplify(line, 0.001)
    assert out[0] == (0, 0) and out[-1] == (4, 0) and (3, 5) in out and (1, 0.00001) not in out


def test_diem_dat_nhan_nam_trong_vung():
    ring = [[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10], [0, 0]][::-1]   # chữ L, chiều kim đồng hồ
    x, y = B.label_point([[ring]])
    assert B.point_in_ring(x, y, ring)
