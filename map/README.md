# Bản đồ cửa hàng và tổng kho Hoa Sen

MVP hiển thị vị trí cửa hàng và phân công tổng kho. Chưa có dữ liệu tồn kho, sản phẩm hoặc SKU.

## Chạy ứng dụng

Trong thư mục này, chạy:

```bash
python3 -m http.server 4173
```

Mở `http://localhost:4173`. Ứng dụng dùng Leaflet 1.9.4 từ CDN và nền bản đồ OpenStreetMap, nên cần kết nối Internet. Bản đồ giữ [ghi công OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) trên giao diện.

## Cấu trúc dữ liệu đã xác nhận

Workbook nguồn thực tế có **6 sheet**. Hai sheet cửa hàng dùng cho MVP là:

| Sheet | Số cửa hàng | Loại trong ứng dụng |
|---|---:|---|
| `CỬA HÀNG TRUYỀN THỐNG` | 240 | Cửa hàng truyền thống |
| `SIÊU THỊ HOA SEN HOME` | 147 | Hoa Sen Home |

Trong cả hai sheet, hàng 3 là tiêu đề chính, hàng 4 là tiêu đề phụ, dữ liệu bắt đầu ở hàng 5 và xen các hàng tiêu đề miền/tỉnh. Các cột được dùng:

| Cột | Nội dung thực tế | Cách dùng |
|---|---|---|
| C | `CNT QUẢN LÝ` | Nhận diện hàng tiêu đề miền; không dùng làm tỉnh vì nhiều giá trị là cụm quản lý |
| D | `MÃ CH` | Khóa cửa hàng để nối tồn kho về sau |
| E | `Mô Hình` / `MÔ HÌNH HOẠT ĐỘNG` | Mô hình Home khi có; loại cửa hàng lấy theo sheet |
| F, G | Tên cửa hàng Hoa Sen Group / Hoa Sen Home | Lấy G khi có, nếu trống lấy F |
| O, N | Email công ty Hoa Sen Home / Hoa Sen Group | Hiển thị email công ty nếu có |
| P | `ĐỊA CHỈ CH` | Hiển thị địa chỉ và xác định tỉnh thực tế |
| Q | `ĐỊNH VỊ TỌA ĐỘ CH` / `ĐỊNH VỊ TỌA ĐỘ CỬA HÀNG` | Giữ link Maps và trích xuất tọa độ |

Các sheet còn lại là dữ liệu phụ, không được đưa vào ứng dụng. Dữ liệu quản lý, tên nhân sự và số điện thoại cá nhân cũng không được đưa vào file dùng trên trình duyệt.

## Chất lượng vị trí

- 387 cửa hàng thuộc 31 tỉnh/thành: miền Nam 157, miền Trung 111, miền Bắc 119. Có 376 cửa hàng trích xuất được tọa độ từ link Maps.
- 355 tọa độ từ chuỗi độ/phút/giây trong link Maps; 3 từ truy vấn tọa độ; 1 từ điểm đến của link chỉ đường; 17 từ tâm khung xem Maps.
- 11 link rút gọn chưa thể giải trong môi trường xử lý. Các cửa hàng này vẫn có trong bộ lọc và danh sách, cùng link Maps gốc; ứng dụng không tạo ghim ước đoán.
- Vòng tròn tổng hợp trên bản đồ đếm **toàn bộ cửa hàng** của miền/tỉnh; số “ghim” đếm riêng các cửa hàng có tọa độ. Với tỉnh không có cửa hàng nào xác định được tọa độ, cửa hàng vẫn nằm trong danh sách nhưng không có vòng tròn đặt theo vị trí đoán.
- Bốn địa chỉ còn tên tỉnh cũ được quy về tỉnh sau sắp xếp năm 2025: Quảng Bình → Quảng Trị, Hải Dương → Hải Phòng, Long An → Tây Ninh, Bình Phước → Đồng Nai. Địa chỉ gốc vẫn được giữ nguyên trong popup. Tham chiếu: [Cổng Thông tin điện tử Chính phủ](https://xaydungchinhsach.chinhphu.vn/chi-tiet-34-don-vi-hanh-chinh-cap-tinh-tu-12-6-2025-119250612141845533.htm).
- Miền lấy theo các phần miền trong workbook nguồn. Vì vậy Thanh Hóa, Nghệ An và Hà Tĩnh nằm trong **Miền Bắc** theo cách phân nhóm của file.
- Hoàng Sa và Trường Sa được hiển thị bằng nhãn tham chiếu trên bản đồ và sơ đồ góc màn hình. Đây là chỉ dẫn vị trí, không phải ranh giới hay hình học quần đảo.

## Đối chiếu số lượng cửa hàng

Bản nhập liệu đầu tiên đã bỏ sót 8 mã có hai chữ cái: `GC01`, `TK04`, `TX02`, `TX03`, `TX04`, `TX05`, `TX06`, `TX07`. Bộ đọc hiện lấy mọi dòng có mã cửa hàng và tên cửa hàng, nên không còn phụ thuộc vào hình thức mã.

Mốc đối chiếu được cung cấp là Nam 158, Trung 112, Bắc 122 (tổng 392). Hai sheet cửa hàng trong workbook này chỉ có 387 dòng có mã và tên; không có thêm dòng cửa hàng thiếu mã. Khoảng chênh còn lại là **Nam 1, Trung 1, Bắc 3**. Sheet phụ `Mô hình Miền NAm` cũng liệt kê đúng 157 mã miền Nam, trùng với hai sheet cửa hàng. Cần file mới hơn hoặc 5 mã cửa hàng để bổ sung chính xác; ứng dụng không tự tạo cửa hàng giả để khớp số đếm.

## Sơ đồ cung ứng tổng kho

File `Data thống kê CH 3 miền.xlsx` có một sheet, chứa ba bảng đặt cạnh nhau. Mỗi dòng cửa hàng có tỉnh cũ, tên, mô hình, tổng kho chính và (khi có) kho dự phòng. Bảng chi tiết có **392 phân công**: Nam 158, Trung 112, Bắc 122. Ô tóm tắt đầu sheet ghi Nam 125 và tổng 359 nên không phản ánh bảng chi tiết. Ứng dụng dùng từng dòng phân công thay cho ô tóm tắt.

Đã ghép **387/392 phân công** với 387 ghim cửa hàng. Năm tên chỉ có ở file cung ứng: `Đắk Song 2`, `Tây Sơn 2`, `Vĩnh Bảo`, `Sóc Sơn`, `Hưng Hà`. Sáu dòng có mô hình cửa hàng khác với sheet vị trí; danh sách chi tiết ở `data/supply_audit.json`. Loại ghim vẫn theo sheet vị trí. Có 22 phân công có kho dự phòng.

| Tổng kho | Số cửa hàng chính trong file cung ứng |
|---|---:|
| Cái Cui | 65 |
| Bình Dương | 60 |
| Phan Thiết | 23 |
| Đắk Lắk | 38 |
| Bình Định | 42 |
| Đà Nẵng | 42 |
| Nghệ An | 33 |
| Hà Nam | 66 |
| Yên Bái | 23 |

Chọn một tổng kho bằng ghim hoặc danh sách sẽ tự bật đường nối tới các cửa hàng được cấp từ kho đó, kể cả vai trò dự phòng. Các bộ lọc miền, tỉnh, loại và tìm kiếm được đặt lại để thấy đầy đủ cửa hàng của kho. Trong phần chi tiết mỗi cửa hàng có tên kho chính và kho dự phòng. Nút **Đường nối** trên bản đồ vẫn bật/tắt kết nối; bộ chọn bên trái chuyển giữa kết nối tới từng cửa hàng và tới tâm các cửa hàng theo tỉnh. Các đường cong hội tụ tại ghim kho chỉ thể hiện **quan hệ cung ứng**, không phải hình học đường ô tô. Đường liền là kho chính; đường đứt là kho dự phòng.

Cả 9 tổng kho hiện có biểu tượng lớn và nhãn trên bản đồ. Tọa độ là **điểm tham chiếu của khu công nghiệp, cảng hoặc khu vực trong địa chỉ** tra trên Maps; chưa xác minh cổng kho. Riêng Phan Thiết và Nghệ An có kết quả địa điểm Hoa Sen gần địa chỉ; các điểm khác chủ yếu là tâm khu vực. Chọn kho rồi dán cặp `vĩ độ,kinh độ` hoặc link Google Maps đầy đủ chứa tọa độ để sửa; thay đổi lưu trong trình duyệt hiện tại. Nút khôi phục đưa về điểm tham chiếu.

Khi chọn cửa hàng, ứng dụng gọi dịch vụ định tuyến ô tô [FOSSGIS OSRM](https://routing.openstreetmap.de/about.html) **một lần theo yêu cầu** và hiển thị km ngay trên thẻ chi tiết. Kết quả được lưu tạm trong phiên, các yêu cầu cách nhau tối thiểu 1 giây; không tính hàng loạt. Nếu dịch vụ không phản hồi, giao diện hiển thị một số km **ước tính từ khoảng cách địa lý** và gắn nhãn rõ ràng; nút Google Maps cho phép kiểm tra lại. Con số chưa tính giới hạn tải trọng/kích thước xe tải và có sai số do điểm kho tham chiếu. Trước khi sử dụng ở quy mô vận hành, cần xác minh link Maps từng cổng kho và dùng dịch vụ định tuyến có cam kết phù hợp; máy chủ FOSSGIS công cộng có [giới hạn sử dụng](https://routing.openstreetmap.de/about.html).

## Làm mới dữ liệu

Cài `openpyxl` nếu máy chưa có, rồi chạy:

```bash
python3 normalize_stores.py "/đường/dẫn/Danh sách vị trí cửa hàng.xlsx"
```

Lệnh tạo lại `data/stores.json`, `data/stores.js` và `data/audit.json`. Ứng dụng đọc `stores.js`; `stores.json` là dữ liệu chuẩn để giai đoạn sau nối tồn kho bằng trường `code` hoặc `id` (`loại:mã CH`). File nguồn được giữ ngoài ứng dụng; chỉ dữ liệu cửa hàng cần thiết được xuất sang trình duyệt.

Để tái tạo sơ đồ cung ứng, chạy `python3 build_supply.py "/đường/dẫn/Data thống kê CH 3 miền.xlsx"`. Lệnh tạo `data/supply.json`, `data/supply.js` và `data/supply_audit.json`. Nếu một bản Excel mới thêm cửa hàng hoặc đổi tên, đối chiếu `supply_audit.json` trước khi cập nhật các ghép tên trong `build_supply.py`.
