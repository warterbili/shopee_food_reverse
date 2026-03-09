/**
 * Shopee Food VN (DeliveryNow) SAP签名模块 — 手动Stub方案
 *
 * 原理: 手动构造浏览器API的最小stub, 注入Node.js全局作用域,
 *       然后通过vm执行从main.js中提取的SAP签名IIFE代码。
 *       所有浏览器指纹返回固定值, 保证每次生成的签名可被服务端验证通过。
 *
 * 优点: 零依赖(仅Node.js内置模块), 启动快, 指纹确定性高
 * 缺点: 如果SAP算法更新检测项, 需要手动补充对应stub
 *
 * 用法:
 *   // 作为模块引入
 *   const { generateHeaders, buildFullHeaders } = require('./sap_sign_stub');
 *   const headers = buildFullHeaders('https://gappapi.deliverynow.vn/api/...', body);
 *
 *   // 命令行直接使用
 *   node sap_sign_stub.js "https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=83024"
 *
 * 依赖: 无 (纯Node.js内置模块)
 * 前置: 同目录下需要有 sap_core.js (从webpack bundle提取的SAP算法核心)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

// SAP算法核心代码 (从main.js webpack bundle中提取的 "0az5" 模块)
const SAP_CORE_PATH = path.join(__dirname, 'sap_core.js');

let _generateSignEntry = null;

function _init() {
    if (_generateSignEntry) return;

    // ========== 1. 构建浏览器环境stub ==========
    // 将stub直接设置在global上, 使 window === global (与浏览器中 window === globalThis 一致)
    const window = global;

    window.TextEncoder = TextEncoder;
    window.TextDecoder = TextDecoder;
    window.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
    window.atob = (s) => Buffer.from(s, 'base64').toString('binary');

    // Web Crypto API (仅需 getRandomValues)
    window.crypto = {
        getRandomValues: (arr) => { nodeCrypto.randomFillSync(arr); return arr; }
    };

    // Navigator (影响指纹中的UA、平台、硬件并发数等)
    window.navigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        platform: 'Win32',
        language: 'en-US',
        languages: ['en-US', 'en'],
        hardwareConcurrency: 8,
        maxTouchPoints: 0,
        webdriver: false,
        plugins: { length: 0 },
        mimeTypes: { length: 0 },
        connection: { rtt: 50 }
    };

    // Location (SAP会读取当前页面URL)
    window.location = {
        href: 'https://shopeefood.vn/',
        protocol: 'https:',
        hostname: 'shopeefood.vn',
        pathname: '/',
        search: '',
        hash: ''
    };

    // Document (Canvas指纹、DOM查询等)
    window.document = {
        querySelectorAll: () => [],
        createElement: (tag) => {
            if (tag === 'canvas') return {
                getContext: () => ({
                    fillText() {}, fillRect() {}, beginPath() {}, arc() {}, closePath() {},
                    fill() {}, stroke() {}, rect() {}, moveTo() {}, lineTo() {},
                    bezierCurveTo() {}, quadraticCurveTo() {},
                    measureText: () => ({ width: 10 }),
                    isPointInPath: () => false,
                    getImageData: () => ({ data: new Uint8Array(400) }),
                    createLinearGradient: () => ({ addColorStop() {} }),
                    canvas: { toDataURL: () => 'data:image/png;base64,stub' }
                }),
                toDataURL: () => 'data:image/png;base64,stub',
                width: 200, height: 200
            };
            return {
                style: {}, appendChild() {}, setAttribute() {},
                getAttribute() { return null; },
                addEventListener() {}, removeEventListener() {}
            };
        },
        documentElement: { style: {} },
        body: { appendChild() {}, removeChild() {} },
        cookie: '',
        referrer: 'https://shopeefood.vn/',
        addEventListener() {},
        getElementById() { return null; },
        getElementsByTagName() { return []; },
        getElementsByClassName() { return []; }
    };

    // Screen (屏幕分辨率指纹)
    window.screen = {
        width: 1920, height: 1080,
        availWidth: 1920, availHeight: 1040,
        colorDepth: 24, pixelDepth: 24
    };

    // 其他浏览器全局对象
    window.performance = { now: () => Date.now() };
    window.devicePixelRatio = 1;
    window.innerWidth = 1920; window.innerHeight = 1080;
    window.outerWidth = 1920; window.outerHeight = 1080;
    window.screenX = 0; window.screenY = 0;
    window.pageXOffset = 0; window.pageYOffset = 0;
    window.MutationObserver = class { observe() {} disconnect() {} };
    window.getComputedStyle = () => new Proxy({}, { get: () => '' });
    window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    window.OffscreenCanvas = undefined;
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    window.WebGLRenderingContext = undefined;
    window.HTMLCanvasElement = function () {};
    window.HTMLElement = function () {};
    window.HTMLDocument = function () {};
    window.speechSynthesis = undefined;
    window.Notification = undefined;
    window.chrome = undefined;
    window.opera = undefined;
    window.$fa_12d = window.$fa_12d || [];
    window.addEventListener = () => {};
    window.removeEventListener = () => {};
    window.dispatchEvent = () => {};
    window.postMessage = () => {};

    // 确保 global 上的快捷引用一致
    global.navigator = window.navigator;
    global.document = window.document;
    global.location = window.location;
    global.screen = window.screen;

    // ========== 2. Webpack运行时shim ==========
    function __webpack_require__(id) {
        if (id === 'LGuY') return { amd: false };
        return {};
    }
    __webpack_require__.n = function (m) { return function () { return m; }; };
    var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;

    // ========== 3. 读取并执行IIFE ==========
    const iifeBody = fs.readFileSync(SAP_CORE_PATH, 'utf-8');
    const code = '(function(Buffer, process, module) {\n' + iifeBody + '\n}).call(exports, Buffer, process, module);';

    const moduleObj = { exports: {} };
    const context = vm.createContext({
        ...global,
        window, self: window, globalThis: global, global,
        navigator: window.navigator, document: window.document,
        location: window.location, screen: window.screen,
        Buffer, process, module: moduleObj, exports: moduleObj.exports,
        __webpack_require__, __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__,
        TextEncoder, TextDecoder, URL, URLSearchParams,
        Uint8Array, DataView, ArrayBuffer, Float64Array, Float32Array,
        Int32Array, Int16Array, Int8Array, Uint16Array, Uint32Array, Uint8ClampedArray,
        Symbol, Proxy, Reflect, Promise, Map, Set, WeakMap, WeakSet, RegExp,
        setTimeout, clearTimeout, setInterval, clearInterval,
        console, JSON, Math, Date, Object, Array, String, Number, Boolean, Function,
        Error, TypeError, RangeError, SyntaxError, ReferenceError, URIError, EvalError,
        parseInt, parseFloat, isNaN, isFinite, undefined, NaN, Infinity,
        encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, eval,
        require
    });
    vm.runInContext(code, context, { timeout: 10000 });

    _generateSignEntry = moduleObj.exports.generateSignEntry
        || (moduleObj.exports.default && moduleObj.exports.default.generateSignEntry);

    if (!_generateSignEntry) {
        throw new Error('Failed to extract generateSignEntry from main.js');
    }
}

/**
 * 生成SAP签名headers (仅签名部分, 通常4个key)
 * @param {string} url  - 完整的请求URL
 * @param {string|undefined} body - 请求体 (GET请求传undefined)
 * @returns {object} 签名headers键值对
 */
function generateHeaders(url, body) {
    _init();
    return _generateSignEntry(url, body);
}

/**
 * 生成完整的请求headers (签名 + 浏览器特征 + Foody业务headers)
 * @param {string} url  - 完整的请求URL
 * @param {string|undefined} body - 请求体
 * @param {object} [extra] - 额外的headers覆盖 (如 x-foody-access-token)
 * @returns {object} 完整headers, 可直接用于http请求
 */
function buildFullHeaders(url, body, extra = {}) {
    const signHeaders = generateHeaders(url, body);
    return {
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
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'x-foody-access-token': '',
        'x-foody-api-version': '1',
        'x-foody-app-type': '1004',
        'x-foody-client-id': '',
        'x-foody-client-language': 'vi',
        'x-foody-client-type': '1',
        'x-foody-client-version': '3.0.0',
        ...signHeaders,
        ...extra
    };
}

// ========== 导出 ==========
module.exports = { generateHeaders, buildFullHeaders };

// ========== 命令行入口 ==========
if (require.main === module) {
    const url = process.argv[2];
    const body = process.argv[3] || undefined;

    if (!url) {
        console.log('用法: node sap_sign_stub.js <url> [body]');
        console.log('示例: node sap_sign_stub.js "https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=83024"');
        process.exit(1);
    }

    console.log('URL:', url);
    if (body) console.log('Body:', body);

    const headers = generateHeaders(url, body);
    console.log('\n=== 签名Headers ===');
    for (const [k, v] of Object.entries(headers)) {
        console.log(`  ${k}: ${typeof v === 'string' && v.length > 80 ? v.substring(0, 80) + '...' : v}`);
    }

    console.log('\n=== 完整Headers ===');
    const full = buildFullHeaders(url, body);
    for (const [k, v] of Object.entries(full)) {
        console.log(`  ${k}: ${typeof v === 'string' && v.length > 80 ? v.substring(0, 80) + '...' : v}`);
    }
}
