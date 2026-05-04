# Tài liệu thiết kế: Quản lý phiên thi (Exam Session State Management)

---

## 1. Tổng quan

Mỗi lượt thi của thí sinh được đại diện bởi một **ExamAttempt** — một thực thể có vòng đời xác định, chuyển qua các trạng thái theo các sự kiện từ phía thí sinh, hệ thống, hoặc quản trị viên.

Trạng thái phiên thi được lưu song song ở hai nơi:
- **Database (MySQL):** nguồn sự thật duy nhất (source of truth), persist lâu dài.
- **Redis:** cache session phục vụ ping loop mỗi 30 giây, giảm tải DB, TTL 90 giây.

---

## 2. Các trạng thái

| Trạng thái     | Ý nghĩa                                              | Loại       |
|----------------|------------------------------------------------------|------------|
| `INITIALIZED`  | Lượt thi đã được tạo, thí sinh chưa vào làm bài      | Transient  |
| `ACTIVE`       | Thí sinh đang làm bài, đồng hồ đang chạy             | Transient  |
| `SUBMITTED`    | Thí sinh đã nộp bài thành công, có kết quả           | Terminal   |
| `VIOLATED`     | Phiên thi bị khóa do vi phạm quy chế                 | Terminal   |
| `TERMINATED`   | Quản trị viên kết thúc phiên thi cưỡng bức           | Terminal   |

> Ba trạng thái terminal không thể chuyển tiếp. Chỉ admin mới có thể tạo lượt thi mới (`attemptNo + 1`) từ trạng thái terminal.

---

## 3. Sơ đồ trạng thái tổng hợp

```
                        [Admin tạo / reset lượt thi]
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    INITIALIZED      │◄─────────────────────────────┐
                         │  (chưa vào làm bài) │                              │
                         └──────────┬──────────┘                              │
                                    │                                         │
               ┌────────────────────┼────────────────────┐                    │
               │                    │                    │                    │
   [Device mismatch]   [GET /attempts/exam/:id]  [Admin terminate]            │
   (server phát hiện)   (user vào trang thi)             │                    │
               │                    │                    │                    │
               │                    ▼                    │                    │
               │         ┌─────────────────────┐         │                    │
               │         │       ACTIVE        │         │                    │
               │         │   (đang làm bài)    │         │                    │
               │         └──────────┬──────────┘         │                    │
               │                    │                    │                    │
               │    ┌───────────────┼──────────────┐     │                    │
               │    │               │              │     │                    │
               │  [Vi phạm]    [Nộp bài]    [Admin terminate]                 │
               │    │               │              │     │                    │
               │    │               ▼              ▼     ▼                    │
               │    │    ┌──────────────┐   ┌────────────────┐                │
               │    │    │  SUBMITTED   │   │  TERMINATED    │                │
               │    │    │ (đã nộp bài) │   │ (admin kết thúc│                │
               │    │    └──────────────┘   └────────────────┘                │
               │    │        (terminal)          (terminal)                   │
               │    │                                                         │
               ▼    ▼                                                         │
          ┌──────────────┐                                                    │
          │   VIOLATED   │                                                    │
          │ (bị khóa)    │                                                    │
          └──────────────┘                                                    │
               (terminal)                                                     │
                                                                              │
                    [Admin reset → tạo lượt thi mới (attemptNo + 1)]  ────────┘
```

---

## 4. Chi tiết các luồng chuyển trạng thái

### 4.1 Luồng START — `INITIALIZED → ACTIVE`

Khi thí sinh vào trang làm bài, server thực hiện `GET /attempts/exam/:examId`:

```
Thí sinh vào trang làm bài
        │
        ▼
Kiểm tra attempt mới nhất của user với exam này
        │
        ├─[Không tìm thấy attempt] ──────────────────────────────► Lỗi 404
        │
        ├─[Device mismatch] ─────────────────────────────────────► VIOLATED
        │   deviceId hiện tại ≠ deviceId đã lưu
        │   → Ghi violation DEVICE_MISMATCH vào DB ngay lập tức
        │
        ├─[Status đã SUBMITTED / VIOLATED / TERMINATED] ─────────► Lỗi 403
        │
        └─[Hợp lệ] ──────────────────────────────────────────────► ACTIVE
              • Ghi startedAt (chỉ lần đầu, giữ nguyên khi reload)
              • Sync Redis session (TTL 90s)
              • Client bắt đầu:
                  - Countdown timer (đếm ngược từ thời gian còn lại)
                  - Ping loop mỗi 30 giây
                  - Auto-save đáp án vào localStorage mỗi 5 giây
                  - ExamGuard (fullscreen + anti-cheat)
```

**Lưu ý quan trọng:** `startedAt` chỉ được ghi lần đầu tiên. Các lần reload sau giữ nguyên giá trị này để tính đúng thời gian còn lại (`remaining = duration - elapsed`).

---

### 4.2 Luồng LOCK — `ACTIVE → VIOLATED`

Có bốn con đường dẫn đến trạng thái `VIOLATED`:

#### 4.2.1 Khóa ngay lập tức (Immediate Lock)

Áp dụng cho các vi phạm nghiêm trọng, không có thời gian ân hạn:

| Vi phạm       | Trigger                                      |
|---------------|----------------------------------------------|
| `DEV_TOOLS`   | Nhấn F12 hoặc Ctrl+Shift+I/J/C               |
| `SCREENSHOT`  | Nhấn phím PrintScreen                        |
| `AUTOMATION`  | Phát hiện dấu hiệu headless browser / bot    |

```
Phát hiện vi phạm immediate
        │
        ├─ Ghi log violation lên server (POST /violation-log)
        ├─ POST /attempts/:id/lock → VIOLATED
        ├─ Dừng countdown timer
        ├─ Dừng ping loop
        └─ Xóa auto-save localStorage
```

#### 4.2.2 Khóa sau ân hạn (Grace Period Lock)

Áp dụng khi thí sinh rời khỏi trang thi, cho phép quay lại trong thời hạn:

| Vi phạm       | Grace period | Trigger                              |
|---------------|-------------|-------------------------------------- |
| `TAB_SWITCH`  | 3 giây      | `document.visibilityState = hidden`   |
| `WINDOW_BLUR` | 5 giây      | `window.blur` (Alt+Tab)               |

```
Phát hiện rời trang
        │
        ├─ POST /violation-log (ghi log, KHÔNG đổi status)
        ├─ Hiển thị countdown notification
        │
        ├─[Quay lại trong thời hạn] ──────────────────────────────► ACTIVE (tiếp tục)
        │   • Hủy countdown
        │   • POST /violation-log/:id/resolve
        │   • Hiển thị "Đã quay lại — bài thi tiếp tục"
        │
        └─[Hết grace period] ─────────────────────────────────────► VIOLATED
            • POST /attempts/:id/lock
```

**Idempotency:** Nếu cùng loại grace period đang chạy, sự kiện trùng lặp bị bỏ qua — không khởi tạo grace period thứ hai.

#### 4.2.3 Khóa tích lũy (Warn → Lock)

Áp dụng cho hành vi copy/paste:

| Vi phạm      | Ngưỡng | Hành vi                                      |
|--------------|--------|----------------------------------------------|
| `COPY_PASTE` | 3 lần  | Lần 1–3: cảnh báo; Lần 4+: khóa ngay         |

```
Phát hiện copy / paste / cut
        │
        ├─ POST /violation-log (ghi log mỗi lần)
        │
        ├─[Lần 1, 2, 3] ──────────────────────────────────────────► ACTIVE (cảnh báo)
        │   Hiển thị: "Cảnh báo N/3 — còn X lần trước khi bị khóa"
        │
        └─[Lần 4+] ───────────────────────────────────────────────► VIOLATED
            POST /attempts/:id/lock
```

#### 4.2.4 Khóa từ server (Server-side Lock via Ping)

Server phát hiện vi phạm độc lập với client qua ping loop:

```
Client gửi POST /attempts/:id/ping mỗi 30 giây
        │
        ├─[Device mismatch] ──────────────────────────────────────► VIOLATED
        │   Server cập nhật DB + Redis, trả về { locked: true }
        │   Client nhận → dừng timer, hiển thị lỗi
        │
        ├─[Status không phải ACTIVE/INITIALIZED] ─────────────────► Client dừng bài
        │   (SUBMITTED / VIOLATED / TERMINATED)
        │
        └─[Bình thường] ──────────────────────────────────────────► Refresh TTL Redis
```

---

### 4.3 Luồng SUBMIT — `ACTIVE → SUBMITTED`

#### 4.3.1 Các trigger nộp bài

| Trigger              | Điều kiện                        |
|----------------------|----------------------------------|
| Hết giờ (timeout)    | `timeLeft = 0`, auto-submit      |
| User nhấn nộp bài    | Thủ công, có xác nhận nếu còn câu chưa trả lời |

#### 4.3.2 Luồng xử lý submit

```
Trigger nộp bài
        │
        ├─[Đang offline + user nhấn nộp] ─────────────────────────► Cảnh báo, không nộp
        │
        ├─[0 câu trả lời + user nhấn nộp] ───────────────────────► Cảnh báo, không nộp
        │
        ├─[Còn câu chưa trả lời + user nhấn nộp] ────────────────► Modal xác nhận
        │
        └─[Hợp lệ] ──────────────────────────────────────────────► POST /attempts/:id/submit
                │
                ├─[Thành công] ───────────────────────────────────► SUBMITTED
                │   • Lưu UserAnswers vào DB
                │   • Tính điểm
                │   • Flush violation buffer Redis → DB
                │   • Sync Redis session
                │   • Xóa auto-save localStorage
                │   • Hiển thị kết quả
                │
                └─[Thất bại — offline + timeout] ────────────────► Pending offline submit
                    • Lưu pending flag vào localStorage
                    • Khi có mạng lại → tự động retry
```

#### 4.3.3 Xử lý race condition khi submit

Server sử dụng **distributed lock (Redis)** trên key `submit_lock:{attemptId}` với TTL 120 giây:

```
POST /attempts/:id/submit
        │
        ├─[Không acquire được lock] ──────────────────────────────► Lỗi 409 Conflict
        │   (request trùng lặp đang xử lý)
        │
        └─[Acquire lock thành công]
              │
              ├─ Pessimistic write lock trên DB row
              ├─ Kiểm tra status (assertAttemptAllowed)
              ├─ Lưu answers + tính điểm (transaction)
              ├─ Cập nhật status → SUBMITTED
              └─ Release lock (finally)
```

---

## 5. Chiến lược xử lý Race Condition

Race condition xảy ra khi nhiều request cùng tác động lên một phiên thi tại cùng một thời điểm. Hệ thống xử lý bằng hai lớp bảo vệ kết hợp: **Distributed Lock (Redis)** ở tầng ngoài và **Pessimistic Write Lock (DB)** ở tầng trong.

---

### 5.1 Các tình huống race condition thực tế

#### Tình huống 1: Submit đồng thời (Double Submit)

Xảy ra khi client gửi hai request submit gần như cùng lúc — ví dụ: hết giờ auto-submit đúng lúc user nhấn nộp bài thủ công, hoặc mạng chập chờn khiến client retry.

```
Không có bảo vệ:

  Request A ──► đọc status = ACTIVE ──► tính điểm ──► lưu SUBMITTED ──► trả kết quả A
  Request B ──► đọc status = ACTIVE ──► tính điểm ──► lưu SUBMITTED ──► trả kết quả B
                                                                          (2 kết quả khác nhau!)
```

```
Có bảo vệ (Redis Lock + Pessimistic Write):

  Request A ──► acquireLock("lock:submit:123") = OK
                └─► DB pessimistic_write lock trên row
                    └─► assertAllowed(ACTIVE) ✓
                        └─► lưu SUBMITTED, tính điểm
                            └─► releaseLock ──► trả kết quả A

  Request B ──► acquireLock("lock:submit:123") = FAIL (key đã tồn tại)
                └─► throw 409 Conflict ──► client bỏ qua
```

**Cơ chế:** `SET lock:submit:{attemptId} 1 EX 120 NX` — atomic, chỉ một request thắng. TTL 120 giây đảm bảo lock tự giải phóng nếu server crash giữa chừng.

---

#### Tình huống 2: Submit đồng thời với Admin Terminate

Xảy ra khi admin nhấn "kết thúc cưỡng bức" đúng lúc thí sinh đang nộp bài.

```
Không có bảo vệ:

  Submit    ──► đọc status = ACTIVE ──► lưu SUBMITTED
  Terminate ──► đọc status = ACTIVE ──► lưu TERMINATED
                                         (hai write đè nhau, kết quả không xác định)
```

```
Có bảo vệ (cùng dùng "lock:submit:{attemptId}"):

  Submit    ──► acquireLock("lock:submit:123") = OK ──► xử lý ──► SUBMITTED
  Terminate ──► acquireLock("lock:submit:123") = FAIL ──► 409 Conflict
                (admin retry sau, lúc này status đã SUBMITTED → idempotent return)
```

**Thiết kế quan trọng:** `adminTerminate` dùng **cùng key lock** với `submit` (`lock:submit:{attemptId}`), không phải key riêng. Điều này đảm bảo hai thao tác không bao giờ chạy song song.

---

#### Tình huống 3: Start đồng thời (Double Start)

Xảy ra khi thí sinh mở hai tab cùng lúc và cả hai cùng gọi `POST /attempts/start`.

```
Không có bảo vệ:

  Tab A ──► không tìm thấy attempt ──► INSERT attemptNo=1
  Tab B ──► không tìm thấy attempt ──► INSERT attemptNo=1
                                         (vi phạm UNIQUE constraint hoặc 2 attempt trùng)
```

```
Có bảo vệ (Redis Lock + Pessimistic Write):

  Tab A ──► acquireLock("lock:start:{userId}:{examId}") = OK
            └─► DB pessimistic_write lock
                └─► không tìm thấy attempt → INSERT attemptNo=1
                    └─► releaseLock

  Tab B ──► acquireLock("lock:start:{userId}:{examId}") = FAIL
            └─► 409 Conflict
```

**Lưu ý:** `startAttempt` và `getAttemptByExam` dùng **key lock khác nhau**. `getAttemptByExam` không cần lock vì nó chỉ đọc rồi update một row đã tồn tại — không tạo mới.

---

#### Tình huống 4: Duplicate attemptNo khi Admin Reset

Xảy ra khi admin reset nhiều lần liên tiếp nhanh, có thể tạo hai attempt với cùng `attemptNo`.

```
Có bảo vệ (Pessimistic Write Lock trong transaction):

  Reset A ──► BEGIN TRANSACTION
              └─► SELECT ... FOR UPDATE (lock row mới nhất)
                  └─► last.status = SUBMITTED → tạo attemptNo=2
                      └─► COMMIT

  Reset B ──► BEGIN TRANSACTION
              └─► SELECT ... FOR UPDATE (bị block, chờ A commit)
                  └─► last.status = INITIALIZED (vừa tạo bởi A) → trả về luôn
                      └─► COMMIT (không tạo thêm)
```

**Kết quả:** Dù admin nhấn reset nhiều lần, chỉ một attempt mới được tạo.

---

### 5.2 Tổng hợp các lock và phạm vi bảo vệ

| Lock key                          | TTL    | Bảo vệ                                      | Dùng bởi                        |
|-----------------------------------|--------|---------------------------------------------|---------------------------------|
| `lock:submit:{attemptId}`         | 120s   | Chống double submit, submit vs terminate    | `submitAttempt`, `adminTerminate` |
| `lock:start:{userId}:{examId}`    | 120s   | Chống double start, tạo attempt trùng       | `startAttempt`                  |
| DB `SELECT ... FOR UPDATE`        | —      | Chống dirty read trong transaction          | `submit`, `start`, `reset`, `terminate` |

---

### 5.3 Hai lớp bảo vệ kết hợp

```
Request đến
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  LỚP 1: Redis Distributed Lock                      │
│  SET key 1 EX {ttl} NX                              │
│  ├─ OK  → tiếp tục vào lớp 2                        │
│  └─ FAIL → 409 Conflict (trả về ngay, không vào DB) │
└─────────────────────────────────────────────────────┘
    │ (chỉ 1 request đi qua)
    ▼
┌─────────────────────────────────────────────────────┐
│  LỚP 2: DB Pessimistic Write Lock                   │
│  SELECT ... FOR UPDATE (trong transaction)          │
│  ├─ Đọc trạng thái mới nhất từ DB                   │
│  ├─ assertAttemptAllowed(status)                    │
│  │   ├─ SUBMITTED → throw (idempotent)              │
│  │   ├─ VIOLATED  → throw                           │
│  │   └─ TERMINATED → throw                          │
│  └─ ACTIVE/INITIALIZED → thực hiện thay đổi        │
└─────────────────────────────────────────────────────┘
    │
    ▼
Commit transaction → syncSession(Redis) → releaseLock
```

**Tại sao cần cả hai lớp?**
- Redis lock ngăn phần lớn request trùng lặp **trước khi chạm DB**, giảm tải.
- DB pessimistic lock là lưới an toàn cuối cùng — bảo vệ trong trường hợp Redis lock bị bypass (restart, TTL expire bất thường) hoặc có nhiều instance server.

---

### 5.4 Xử lý khi lock hết TTL bất thường

Nếu server crash sau khi acquire lock nhưng trước khi release:

```
Server crash ──► lock key vẫn còn trong Redis với TTL 120s
                 ──► Sau 120s, key tự expire
                     ──► Request tiếp theo acquire được lock bình thường
```

Không có deadlock vì lock **luôn có TTL**. Đây là lý do TTL được chọn là 120 giây — đủ dài để xử lý xong một submit bình thường, đủ ngắn để không block quá lâu nếu crash.

---

## 6. Violation Logging — Chiến lược ghi log

Hệ thống phân biệt hai cách ghi log vi phạm để tối ưu hiệu năng:

| Loại              | Cơ chế                  | Khi nào dùng                                      |
|-------------------|-------------------------|---------------------------------------------------|
| **Immediate log** | Ghi thẳng vào DB        | Vi phạm lock ngay: DEVICE_MISMATCH, lock cuối cùng|
| **Buffered log**  | Buffer vào Redis list   | Grace period, COPY_PASTE warnings                 |

**Buffer flush:** Toàn bộ buffer Redis được flush xuống DB khi phiên thi kết thúc (submit, lock, terminate). TTL buffer 24 giờ đảm bảo không mất dữ liệu khi mất kết nối tạm thời.

**Resolve flow:** Vi phạm grace period được đánh dấu `resolved: true` trong buffer khi thí sinh quay lại kịp thời, giúp phân biệt vi phạm thực sự với vi phạm đã được giải quyết khi xem xét sau kỳ thi.

---

## 6. Auto-save — Bảo vệ dữ liệu đáp án

```
Vào trang làm bài
└─ Restore answers từ localStorage (nếu có từ lần trước)

Trong lúc làm bài (mỗi 5 giây)
└─ So sánh với snapshot lần save trước
   ├─ Có thay đổi → localStorage.setItem("exam_autosave_{id}", JSON)
   └─ Không đổi  → bỏ qua (tránh write thừa)

Kết thúc phiên (submit thành công / lock)
└─ localStorage.removeItem("exam_autosave_{id}")
```

---

## 7. Redis Session — Chiến lược đồng bộ

| Sự kiện                        | DB                  | Redis                        |
|--------------------------------|---------------------|------------------------------|
| Start / resume attempt         | `save()`            | `syncSession()` (TTL 90s)    |
| Vào trang làm bài              | `save()` → ACTIVE   | `syncSession()`              |
| Device mismatch (bất kỳ đâu)  | `update()` VIOLATED | `syncSession()`              |
| Submit thành công              | `save()` SUBMITTED  | `syncSession()` sau commit   |
| Ping bình thường               | Không đụng          | Refresh TTL                  |
| TTL expire (mất kết nối)       | Không đổi           | Cache miss → warm lại từ DB  |
| Admin terminate                | `save()` TERMINATED | `syncSession()`              |

---

## 8. Bảng chuyển trạng thái đầy đủ

| Từ trạng thái  | Sự kiện                                      | Đến trạng thái | Tác nhân     |
|----------------|----------------------------------------------|----------------|--------------|
| `INITIALIZED`  | Thí sinh vào trang làm bài (device hợp lệ)  | `ACTIVE`       | User         |
| `INITIALIZED`  | Device mismatch khi vào trang                | `VIOLATED`     | Server       |
| `INITIALIZED`  | Admin terminate                              | `TERMINATED`   | Admin        |
| `ACTIVE`       | Nộp bài (thủ công hoặc hết giờ)             | `SUBMITTED`    | User/System  |
| `ACTIVE`       | Vi phạm immediate / grace hết hạn / warn vượt ngưỡng | `VIOLATED` | Client/Server |
| `ACTIVE`       | Device mismatch qua ping                     | `VIOLATED`     | Server       |
| `ACTIVE`       | Admin terminate                              | `TERMINATED`   | Admin        |
| `SUBMITTED`    | Admin reset                                  | `INITIALIZED`* | Admin        |
| `VIOLATED`     | Admin reset                                  | `INITIALIZED`* | Admin        |
| `TERMINATED`   | Admin reset                                  | `INITIALIZED`* | Admin        |

> \* Admin reset tạo một **lượt thi mới** (`attemptNo + 1`), không phục hồi lượt thi cũ.
