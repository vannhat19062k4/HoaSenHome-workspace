# Trung tâm công cụ Hoa Sen Home

Một địa chỉ web có trang chọn công cụ và hai công cụ hiện tại:

- **Tồn kho theo định mức:** giữ nguyên `data.js` và `app.js` từ app được cung cấp. Dữ liệu người dùng tiếp tục lưu trong `localStorage` với khóa `hoasen_inventory_data`. Chức năng nhập Excel dùng bản SheetJS 0.20.3 giống app gốc, được lưu cục bộ để không phụ thuộc CDN khi chạy.
- **Tối ưu tải xe V7:** phần thuật toán trong `truck/core.py` là bản sao nguyên văn từ `Truck_Loading_Optimizer_V7.py` (lưu ở `truck/original_v7.py`). Giao diện web mới gọi thuật toán Python trên cùng máy chủ. Bao gồm preset xe, 6 loại hàng, tấm phẳng, mục tiêu kg, ba chiến lược, chỉnh thủ công, bảng chi tiết và mô phỏng Plotly 3D.

## Chạy

Yêu cầu Python 3.10+; không cần cài thêm gói Python.

```bash
python3 server.py
```

Mở **http://127.0.0.1:8080/**. Nếu cần dùng từ máy khác trong mạng nội bộ, chạy `python3 server.py --host 0.0.0.0 --port 8080` và tự đặt biện pháp truy cập phù hợp trước khi mở mạng.

## Kiểm tra

```bash
python3 -m unittest discover -s tests -v
```

## Bổ sung công cụ sau này

Thêm thư mục `new-tool/index.html`, dùng `shared.css` và thanh điều hướng chung. Thêm một thẻ công cụ trong `index.html` và một liên kết trong thanh điều hướng của các trang. Nếu công cụ cần tính toán phía máy chủ, thêm endpoint riêng trong `server.py` và giữ logic nghiệp vụ trong một module độc lập để dễ đối chiếu với bản gốc.
