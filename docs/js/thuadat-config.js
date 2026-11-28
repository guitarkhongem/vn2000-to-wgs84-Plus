// Chế độ ẩn "Thửa đất" (docs/js/thuadat.js) — chỉ máy đã bật chế độ quản trị (?thongke / ?thuadat) mới thấy nút.
//
// VN_GOOGLE_CLIENT_ID: mã khách OAuth (loại "Web application", dự án Google Cloud vn2000-ban-do). Mã khách KHÔNG phải
// bí mật: Google chỉ cho dùng trên trang đã khai báo (Authorized JavaScript origins: https://guitarkhongem.github.io) và
// ứng dụng đang ở chế độ Thử nghiệm — chỉ tài khoản trong danh sách test users đăng nhập được. Không để "client secret" ở đây.
//
// VN_THUADAT_BANG: bảng tính Google Sheets chứa dữ liệu AppSheet (mỗi phần tử một link). Bảng để chế độ chia sẻ
// "Bị hạn chế" nên người khác có link cũng không đọc được — chỉ tài khoản Google có quyền xem bảng mới tải được dữ liệu.
window.VN_GOOGLE_CLIENT_ID = "731230681673-23g9m2rhhotr2ur9483ounpv7jctast3.apps.googleusercontent.com";
window.VN_THUADAT_BANG = [
  "https://docs.google.com/spreadsheets/d/1eYjTIgi0jru8b5qbnz1dh1hKZqkLkouNcV5DegIyxv8",   // Dulieukhesanh
];
