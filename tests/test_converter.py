"""
Test lõi chuyển đổi. Mục đích: khoá hành vi thuật toán hiện tại để mọi
thay đổi sau này (do người hay AI) không vô tình làm lệch kết quả.
"""
import pytest

from functions.converter import vn2000_to_wgs84_baibao, wgs84_to_vn2000_baibao

LON0_QUANG_TRI = 106.25

# Các điểm VN-2000 mẫu quanh Hướng Hóa / Quảng Trị (X Bắc, Y Đông)
SAMPLES = [
    (1_850_000.0, 520_000.0, 10.0),
    (1_840_000.0, 480_000.0, 300.0),
    (1_860_500.0, 505_250.0, 0.0),
]


@pytest.mark.parametrize("x, y, h", SAMPLES)
def test_ket_qua_nam_trong_viet_nam(x, y, h):
    lat, lon, _ = vn2000_to_wgs84_baibao(x, y, h, LON0_QUANG_TRI)
    assert 8 < lat < 24
    assert 102 < lon < 110


@pytest.mark.parametrize("x, y, h", SAMPLES)
def test_khu_hoi_vn2000_wgs84_vn2000(x, y, h):
    """VN2000 → WGS84 → VN2000 phải quay về gần đúng điểm ban đầu."""
    lat, lon, hw = vn2000_to_wgs84_baibao(x, y, h, LON0_QUANG_TRI)
    x2, y2, h2 = wgs84_to_vn2000_baibao(lat, lon, hw, LON0_QUANG_TRI)
    assert x2 == pytest.approx(x, abs=0.005)
    assert y2 == pytest.approx(y, abs=0.005)
    assert h2 == pytest.approx(h, abs=0.005)


@pytest.mark.parametrize("x, y, h, lat, lon", [
    (1_850_000.0, 520_000.0, 10.0, 16.72672282, 106.43940148),
    (1_840_000.0, 480_000.0, 300.0, 16.63635531, 106.06435322),
])
def test_khoa_ket_qua_thuat_toan(x, y, h, lat, lon):
    """Giá trị chốt từ thuật toán hiện tại. Test này đỏ = thuật toán đã bị đổi."""
    lat2, lon2, _ = vn2000_to_wgs84_baibao(x, y, h, LON0_QUANG_TRI)
    assert lat2 == pytest.approx(lat, abs=1e-7)
    assert lon2 == pytest.approx(lon, abs=1e-7)


def test_diem_tren_kinh_tuyen_truc():
    """Y = 500 000 nghĩa là nằm trên kinh tuyến trục (sai lệch chỉ do Helmert, < 0.01°)."""
    _, lon, _ = vn2000_to_wgs84_baibao(1_850_000.0, 500_000.0, 0.0, LON0_QUANG_TRI)
    assert lon == pytest.approx(LON0_QUANG_TRI, abs=0.01)
