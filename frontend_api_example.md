# 情感推理 API 前端请求示例

## 1. 接口信息

- **请求方法**: `POST`
- **请求地址**: `http://<服务IP>:7861/infer`
- **Content-Type**: `multipart/form-data`
- **上传字段**:
  - `file`（必填）: `zip` 文件（内含 `.jpg/.jpeg` 帧）

---

## 2. 输入约定

### 2.1 zip 包结构（推荐）

```text
00137_jpg.zip
└── 00137_jpg/
    ├── 0001.jpg
    ├── 0002.jpg
    ├── 0003.jpg
    └── ...
```

### 2.2 也支持根目录直接放帧

```text
00137_jpg.zip
├── 0001.jpg
├── 0002.jpg
├── 0003.jpg
└── ...
```

### 2.3 文件要求

- 只支持 `.zip`
- zip 内仅处理 `.jpg/.jpeg`
- 帧文件名需为数字命名（如 `0001.jpg`）

---

## 3. 输出示例

### 3.1 成功（HTTP 200）

```json
{
  "label": "fear"
}
```

### 3.2 请求参数错误（HTTP 400）

```json
{
  "message": "仅支持 zip 文件上传。"
}
```

或

```json
{
  "message": "缺少上传文件字段 file。"
}
```

### 3.3 推理失败（HTTP 500）

```json
{
  "request_id": "d5c9b8...",
  "message": "推理失败。",
  "detail": "错误堆栈..."
}
```

### 3.4 超时（HTTP 504）

```json
{
  "request_id": "d5c9b8...",
  "message": "请求超时（>600s），请稍后重试。"
}
```

---

## 4. 前端 JavaScript 示例（fetch）

```javascript
/**
 * 上传 zip 并获取情感标签。
 * @param {File} zipFile zip 文件对象
 * @returns {Promise<{label: string}>} 预测结果
 */
async function inferEmotion(zipFile) {
  const formData = new FormData();
  formData.append("file", zipFile);

  const resp = await fetch("http://<服务IP>:7861/infer", {
    method: "POST",
    body: formData,
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data.message || "请求失败");
  }

  return data; // { label: "fear" }
}

document.getElementById("zipInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const result = await inferEmotion(file);
    console.log("预测结果:", result.label);
  } catch (err) {
    console.error("推理失败:", err.message);
  }
});
```

---

## 5. 对应 HTML 示例

```html
<input id="zipInput" type="file" accept=".zip" />
```

---

## 6. curl 调用示例

```bash
curl -X POST "http://127.0.0.1:7861/infer" \
  -F "file=@/path/to/00137_jpg.zip"
```
