# Shopee Food VN — SAP签名逆向还原

## 概述

本项目实现了 Shopee Food Vietnam (shopeefood.vn / deliverynow.vn) 网站 **SAP (Shopee Anti-fraud Protection)** 请求头签名算法的纯算还原。完全脱离浏览器环境，在 Node.js 中独立生成合法的加密请求头，可直接用于 API 调用。

项目提供两种实现方案（API完全一致，任选其一即可）：

| 方案 | 脚本 | 外部依赖 | 适用场景 |
|------|------|----------|----------|
| **手动Stub** (推荐) | `sap_sign_stub.js` | 无 | 生产环境、性能敏感 |
| **JSDOM** | `sap_sign_jsdom.js` | `jsdom` | 开发调试、需要更完整的DOM |

---

## 项目结构

```
reverse/
├── sap_core.js          # SAP算法核心 (从Shopee webpack bundle提取, ~490KB)
├── sap_sign_stub.js      # 方案一: 手动Stub (零依赖)
├── sap_sign_jsdom.js     # 方案二: JSDOM
├── test.js               # 集成测试 (验证两种方案)
└── README.md             # 本文档
```

- `sap_core.js` 是两个脚本的共享依赖，包含从 Shopee Food 前端 webpack 打包文件中提取的 SAP 签名算法原始代码（webpack模块 `"0az5"`，约9400行）。两个脚本在运行时读取此文件并在沙箱中执行。

---

## 方案一: sap_sign_stub.js (手动Stub，推荐)

### 原理

手动构造浏览器API的最小化stub（window、navigator、document、canvas、screen等），注入Node.js全局作用域，然后通过 `vm.createContext` 沙箱执行SAP签名代码。所有浏览器指纹返回固定值，保证签名结果可被服务端验证通过。

### 依赖

**无**。仅使用 Node.js 内置模块（`fs`, `path`, `vm`, `crypto`, `util`）。

### 命令行使用

```bash
# GET请求 (body为undefined)
node sap_sign_stub.js "<完整URL>"

# POST请求 (带body)
node sap_sign_stub.js "<完整URL>" "<请求体JSON>"
```

示例：
```bash
node sap_sign_stub.js "https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=83024"
```

输出：
```
URL: https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=83024

=== 签名Headers ===
  61958a5e: MF`:9Uin/CfIri]F?XknII4+$
  a10add97: ra_pr&bQgB9em6CG'\&\:>ekp
  x-sap-ri: 0cb5ae693cb83da97ffbb239a05c5593d0f494c87beea371
  afca6f2: E,:PFk1efAGh_.(kPH)r,Y6pV...

=== 完整Headers ===
  accept: application/json, text/plain, */*
  accept-language: en-US,en;q=0.9
  ...（共20+个header）
```

### 代码中引入

```js
const { generateHeaders, buildFullHeaders } = require('./sap_sign_stub');

// ---- 方式1: 获取完整headers，直接发请求 ----
const url = 'https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=83024';
const headers = buildFullHeaders(url);
// headers 已包含所有必要的header，可直接用于 http/https/axios/fetch 请求

// ---- 方式2: 仅获取签名headers，自己拼接其他header ----
const signHeaders = generateHeaders(url);
// signHeaders 仅包含4个SAP签名key，需要自己补充其他业务header

// ---- 方式3: 带登录token ----
const authedHeaders = buildFullHeaders(url, undefined, {
    'x-foody-access-token': 'your_token_here'
});

// ---- 方式4: POST请求 ----
const postUrl = 'https://gappapi.deliverynow.vn/api/some_post_endpoint';
const body = JSON.stringify({ key: 'value' });
const postHeaders = buildFullHeaders(postUrl, body);
```

### 完整请求示例

```js
const https = require('https');
const { buildFullHeaders } = require('./sap_sign_stub');

const url = 'https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=83024';
const headers = buildFullHeaders(url);
const urlObj = new URL(url);

https.get({
    hostname: urlObj.hostname,
    path: urlObj.pathname + urlObj.search,
    headers
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        console.log('Status:', res.statusCode);  // 200
        const json = JSON.parse(data);
        console.log('Restaurant:', json.reply.delivery_detail.name);
    });
});
```

---

## 方案二: sap_sign_jsdom.js (JSDOM)

### 原理

使用 `jsdom` 库构建较为完整的浏览器DOM/BOM环境，在其中执行SAP签名代码。jsdom提供了完整的DOM API、window对象、navigator等，但Canvas、WebGL、Audio等渲染相关API仍需手动stub补充（jsdom不支持这些）。

### 依赖

需要安装 `jsdom`：

```bash
npm install jsdom
```

> 如果在项目根目录（`reverse/` 的父目录）已安装则无需重复安装。脚本启动时会自动检测，未安装会提示错误信息。

### 命令行使用

```bash
# 与方案一完全相同
node sap_sign_jsdom.js "<完整URL>"
node sap_sign_jsdom.js "<完整URL>" "<请求体JSON>"
```

示例：
```bash
node sap_sign_jsdom.js "https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=83024"
```

### 代码中引入

```js
// API与方案一完全一致，仅引入路径不同
const { generateHeaders, buildFullHeaders } = require('./sap_sign_jsdom');

const url = 'https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=83024';
const headers = buildFullHeaders(url);
// 直接用于请求，与方案一输出格式完全相同
```

---

## API 文档

两个脚本导出完全相同的API：

### `generateHeaders(url, body)`

生成 **仅SAP签名部分** 的headers（通常4个动态key）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` | 是 | 完整的请求URL（含协议、域名、路径、query参数） |
| `body` | `string \| undefined` | 是 | 请求体。GET请求传 `undefined`，POST请求传JSON字符串 |

**返回值**: `object` — 包含4个签名header的键值对

```js
// 返回示例 (key名每次不同，基于MurmurHash128动态生成)
{
  '61958a5e': 'MF`:9Uin/CfIri]F?XknII4+$',
  'a10add97': 'ra_pr&bQgB9em6CG....',
  'x-sap-ri': '0cb5ae693cb83da9...',       // 这个key名固定
  'afca6f2':  'E,:PFk1efAGh_...'
}
```

### `buildFullHeaders(url, body, extra?)`

生成 **完整的请求headers**，包含：SAP签名 + 浏览器特征headers（sec-ch-ua等） + Foody业务headers。返回值可直接作为HTTP请求的headers使用，无需额外拼接。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` | 是 | 完整的请求URL |
| `body` | `string \| undefined` | 是 | 请求体，GET传 `undefined` |
| `extra` | `object` | 否 | 额外headers，会覆盖默认值（如传入登录token） |

**返回值**: `object` — 完整headers，包含以下三类：

```js
{
  // --- 浏览器特征headers (服务端校验，缺少会403) ---
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'origin': 'https://shopeefood.vn',
  'pragma': 'no-cache',
  'referer': 'https://shopeefood.vn/',
  'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'cross-site',
  'user-agent': 'Mozilla/5.0 ...',

  // --- Foody业务headers ---
  'x-foody-access-token': '',      // 可通过extra参数覆盖
  'x-foody-api-version': '1',
  'x-foody-app-type': '1004',
  'x-foody-client-id': '',
  'x-foody-client-language': 'vi',
  'x-foody-client-type': '1',
  'x-foody-client-version': '3.0.0',

  // --- SAP签名headers (动态生成) ---
  '61958a5e': '...',
  'a10add97': '...',
  'x-sap-ri': '...',
  'afca6f2':  '...'
}
```

---

## 两种方案对比

| 维度 | 手动Stub | JSDOM |
|------|----------|-------|
| **外部依赖** | 无 (纯Node.js内置) | 需要 `npm install jsdom` |
| **启动速度** | 快 (~200ms) | 稍慢 (~500ms，jsdom初始化) |
| **包体积** | 0 | jsdom + 依赖约 5MB |
| **DOM完整度** | 最小stub (仅SAP所需) | 较完整的DOM/BOM实现 |
| **指纹确定性** | 高 (全部固定返回值) | 高 (Canvas等仍用固定stub) |
| **维护成本** | SAP新增检测项需手动补stub | DOM部分由jsdom自动覆盖 |
| **推荐场景** | 生产环境、CI/CD、无网络环境 | 开发调试、需要真实DOM操作 |

> **推荐**: 优先使用 **手动Stub方案**。两种方案在签名生成层面完全等价（相同URL/body生成的签名均可通过服务端验证），但Stub方案零依赖、更轻量。

---

## 技术原理

### 1. SAP签名算法定位

签名入口位于 Shopee Food 前端 webpack bundle 的 `"0az5"` 模块中（已提取到 `sap_core.js`）：
- **入口函数**: `generateSignEntry(url, body)`
- **调用链**: 前端代码 `h = Object(r.generateSignEntry)(p, u)` → 内部函数 `v(e, t)`
- **原始位置**: webpack bundle `main.js` 第 11278 ~ 20740 行

### 2. 签名流程 (5步)

```
URL + Body
    │
    ▼
┌──────────────────┐
│ Step 1: CRC32    │  对URL path + query + body 计算CRC32校验值
│   (module 6139)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Step 2: HMAC     │  使用硬编码AES密钥做HMAC签名
│   (module 4397)  │  密钥: [101,163,210,143,22,179,164,85,...]
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Step 3: Body签名  │  对请求体进行额外签名处理
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Step 4: 浏览器指纹│  收集Canvas/Screen/Navigator/UA等指纹
│   Fingerprint    │  → 这就是为什么需要浏览器API stub
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Step 5: 组装      │  用MurmurHash128生成动态header key名
│   Final Headers  │  组装4个签名header (含固定key x-sap-ri)
└──────────────────┘
```

### 3. 字符串混淆机制

SAP代码使用多层字符串混淆来隐藏关键逻辑：

- **O0R数组**: 895个编码字符串，使用自定义base64字母表
  `"evntbkcmsuzayrglphdiqjofxwXCLDMZPHGQFTIYRBAVWONKEUSJ6180439275+/="`
- **数组旋转**: 启动时旋转370次（校验目标和: 433632）
- **O0P函数**: 索引查找 + 缓存，将数字索引映射为解码后的属性名/方法名

### 4. 关键发现: sec-* Headers

**SAP签名正确不代表请求一定成功**。服务端还会校验HTTP请求中的浏览器特征headers：

```
sec-ch-ua: "Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"
sec-ch-ua-mobile: ?0
sec-ch-ua-platform: "Windows"
sec-fetch-dest: empty
sec-fetch-mode: cors
sec-fetch-site: cross-site
```

**缺少这6个header，即使SAP签名完全正确也会返回 403 (error: 90309999)**。这些header已内置到 `buildFullHeaders()` 中，使用该函数无需手动处理。

### 5. 执行环境

使用 Node.js `vm.createContext` 创建隔离的V8上下文执行 `sap_core.js` 中的代码，同时将必要的浏览器API stub注入全局作用域，确保签名代码能正确访问所需的浏览器环境（navigator、document、crypto等）。

---

## 注意事项

1. **`sap_core.js` 必须与脚本在同一目录下**，两个脚本启动时会读取此文件
2. **每次调用都会生成新签名**（包含时间戳），签名不可复用/缓存
3. **签名header的key名是动态的**（基于MurmurHash128 + 时间戳），每次调用都不同，仅 `x-sap-ri` 固定
4. **如果API返回403**，可能原因：
   - Shopee更新了SAP算法 → 需要重新抓取 `main.js` 并提取新的 `sap_core.js`
   - Chrome版本号不匹配 → `buildFullHeaders` 中的 `sec-ch-ua` 版本号应与抓取时一致
   - 缺少必要的请求headers → 确保使用 `buildFullHeaders()` 而非 `generateHeaders()`
5. **`sap_core.js` 来源**: 从 shopeefood.vn 前端 webpack bundle (`main.js`) 第 11278~20740 行提取，如需更新，重新抓取网站的 JS bundle 并提取相同模块即可
