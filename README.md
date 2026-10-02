# Trung tâm công cụ Hoa Sen Home

Một địa chỉ web có trang chọn công cụ và bốn công cụ hiện tại:

- **Tồn kho theo định mức:** giữ nguyên `data.js` và `app.js` từ app được cung cấp. Dữ liệu người dùng tiếp tục lưu trong `localStorage` với khóa `hoasen_inventory_data`. Chức năng nhập Excel dùng bản SheetJS 0.20.3 giống app gốc, được lưu cục bộ để không phụ thuộc CDN khi chạy.
- **Tối ưu tải xe V7:** phần thuật toán trong `truck/core.py` là bản sao nguyên văn từ `Truck_Loading_Optimizer_V7.py` (lưu ở `truck/original_v7.py`). Giao diện web mới gọi thuật toán Python trên cùng máy chủ. Bao gồm preset xe, 6 loại hàng, tấm phẳng, mục tiêu kg, ba chiến lược, chỉnh thủ công, bảng chi tiết và mô phỏng Plotly 3D.
- **Dashboard kinh doanh:** chọn hoặc thả file báo cáo HĐKD .xlsx. Trang đọc dữ liệu ngay trong trình duyệt, tự lấy kế hoạch tháng từ file và hiển thị tổng quan, tiến độ miền/tỉnh, nhóm hàng, tồn kho, kéo hàng và cửa hàng. File không được tải lên máy chủ.
- **Kiểm tra kéo hàng:** đọc sheet `Chi tiết Cửa hàng` trong file Excel đã nhập tại công cụ tồn kho, hoặc cho phép chọn file báo cáo trực tiếp. Tên tỉnh, cửa hàng, mô hình lấy từ D, E, F; tồn kho lấy từ CP–FA. Người dùng tìm sản phẩm và nhập mức kg cho từng cửa hàng theo mô hình. Ba tab miền cho phép xem riêng kết quả từng miền; bảng kết quả nhóm cửa hàng theo tỉnh và có dòng tổng từng tỉnh. Tồn hiện tại được tính là số đã kéo; phần còn cần kéo của từng cửa hàng bằng `max(mức chia - tồn, 0)`. Tồn vượt ở cửa hàng khác không bù thiếu. Có thể tải file Excel gồm trang tổng hợp và chi tiết từng miền.

File Excel mới nhập được lưu trong IndexedDB của trình duyệt để chia sẻ giữa công cụ tồn kho và công cụ kéo hàng. File không được tải lên máy chủ. Nếu dùng trình duyệt/thiết bị khác, cần nhập lại file.

Giao diện mặc định là tối. Nút Sáng/Tối ở thanh đầu trang lưu lựa chọn trong trình duyệt và áp dụng chung cho các công cụ. Dòng “Made by Danny196Vnhat” và logo Danny nằm ở chân trang.

## Cấu trúc thư mục

- `assets/`: giao diện và dữ liệu dùng chung, chế độ sáng/tối, logo Hoa Sen Home và logo Danny.
- `inventory/`, `truck/`, `pull/`, `dashboard/`: bốn công cụ độc lập trong cùng website.
- `api/`: các hàm máy chủ cho Vercel; `server.py`: máy chủ chạy trên Mac.
- `tests/`: kiểm tra thuật toán tải xe và kết quả kéo hàng.

## Triển khai trên Vercel

Chọn thư mục gốc của dự án này làm **Root Directory**. Vercel sẽ phục vụ các trang HTML/CSS/JS và tự tạo Python Functions từ `api/plan.py` và `api/presets.py`. Không cần chạy `server.py` trên Vercel. Sau khi triển khai, kiểm tra `/api/presets` trả về JSON trước khi dùng công cụ tải xe.

Trên Vercel, xe tùy chỉnh được lưu trong bộ nhớ của **trình duyệt đang dùng** (`localStorage`), nên không tự đồng bộ sang thiết bị hoặc trình duyệt khác. Khi chạy trên Mac bằng `server.py`, xe tùy chỉnh vẫn được lưu trong `truck/vehicle_presets.json` như trước.

## Chạy trên Mac

Nhấp đúp **`Chay_HoaSenHome.command`**. Trang web sẽ tự mở tại **http://127.0.0.1:8765/**. Giữ cửa sổ Terminal vừa mở trong lúc dùng web; đóng cửa sổ sẽ dừng máy chủ tính tải xe.

Nếu macOS chặn lần mở đầu tiên, nhấp chuột phải vào tệp, chọn **Open** rồi xác nhận mở.

## Chạy bằng lệnh

Yêu cầu Python 3.10+; không cần cài thêm gói Python.

```bash
python3 server.py
```

Mở **http://127.0.0.1:8080/**. Nếu cần dùng từ máy khác trong mạng nội bộ, chạy `python3 server.py --host 0.0.0.0 --port 8080` và tự đặt biện pháp truy cập phù hợp trước khi mở mạng.

## Kiểm tra

```bash
python3 -m unittest discover -s tests -v
node tests/test_pull.cjs
```

## Bổ sung công cụ sau này

Thêm thư mục `new-tool/index.html`, dùng `/assets/shared.css`, `/assets/theme.css`, `/assets/theme.js` và thanh điều hướng chung. Thêm một thẻ công cụ trong `index.html` và một liên kết trong thanh điều hướng của các trang. Nếu công cụ cần tính toán phía máy chủ, thêm endpoint cho cả `server.py` (Mac) và `api/` (Vercel), dùng chung module logic nghiệp vụ để dễ đối chiếu với bản gốc.
