/**
 * Shopee Food VN (DeliveryNow) SAP签名模块 — JSDOM方案
 *
 * 原理: 使用jsdom构建完整的浏览器DOM环境, 在其中执行SAP签名代码。
 *       jsdom提供了较为完整的DOM/BOM实现, 但部分浏览器API(Canvas, WebGL等)
 *       仍需手动补充stub, 因为jsdom不支持这些渲染相关的API。
 *
 * 优点: DOM/BOM环境更完整, 更接近真实浏览器, 适应性更强
 * 缺点: 需要安装jsdom依赖, 启动比stub方案稍慢
 *
 * 用法:
 *   // 作为模块引入
 *   const { generateHeaders, buildFullHeaders } = require('./sap_sign_jsdom');
 *   const headers = buildFullHeaders('https://gappapi.deliverynow.vn/api/...', body);
 *
 *   // 命令行直接使用
 *   node sap_sign_jsdom.js "https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=83024"
 *
 * 依赖: npm install jsdom
 * 前置: 同目录下需要有 sap_core.js (从webpack bundle提取的SAP算法核心)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

let JSDOM;
try {
    JSDOM = require('jsdom').JSDOM;
} catch (e) {
    console.error('错误: 需要安装jsdom依赖');
    console.error('请运行: npm install jsdom');
    process.exit(1);
}

// SAP算法核心代码 (从main.js webpack bundle中提取的 "0az5" 模块)
const SAP_CORE_PATH = path.join(__dirname, 'sap_core.js');

let _generateSignEntry = null;

function _init() {
    if (_generateSignEntry) return;

    // ========== 1. 创建JSDOM环境 ==========
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
        url: 'https://shopeefood.vn/',
        referrer: 'https://shopeefood.vn/',
        contentType: 'text/html',
        pretendToBeVisual: true,
        resources: 'usable'
    });
    const window = dom.window;

    // ========== 2. 补充jsdom缺失的浏览器API ==========

    // Web Crypto API (jsdom不提供)
    window.crypto = {
        getRandomValues: (arr) => { nodeCrypto.randomFillSync(arr); return arr; }
    };

    // Navigator扩展 (jsdom的navigator缺少部分属性)
    Object.defineProperties(window.navigator, {
        hardwareConcurrency: { value: 8, configurable: true },
        maxTouchPoints:      { value: 0, configurable: true },
        webdriver:           { value: false, configurable: true },
        connection:          { value: { rtt: 50 }, configurable: true },
        plugins:             { value: { length: 0 }, configurable: true },
        mimeTypes:           { value: { length: 0 }, configurable: true }
    });

    // Canvas stub (jsdom不支持Canvas渲染)
    const origCreateElement = window.document.createElement.bind(window.document);
    window.document.createElement = function (tag) {
        if (tag === 'canvas') {
            return {
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
        }
        return origCreateElement(tag);
    };

    // Screen (jsdom的screen对象属性不完整)
    window.screen = {
        width: 1920, height: 1080,
        availWidth: 1920, availHeight: 1040,
        colorDepth: 24, pixelDepth: 24
    };

    // 其他缺失的全局属性
    window.devicePixelRatio = 1;
    window.innerWidth = 1920; window.innerHeight = 1080;
    window.outerWidth = 1920; window.outerHeight = 1080;
    window.screenX = 0; window.screenY = 0;
    window.pageXOffset = 0; window.pageYOffset = 0;
    window.OffscreenCanvas = undefined;
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    window.WebGLRenderingContext = undefined;
    window.HTMLCanvasElement = function () {};
    window.speechSynthesis = undefined;
    window.Notification = undefined;
    window.chrome = undefined;
    window.opera = undefined;
    window.$fa_12d = [];

    // 注入到Node.js全局 (SAP代码可能直接访问global上的属性)
    global.window = window;
    global.self = window;
    global.navigator = window.navigator;
    global.document = window.document;
    global.location = window.location;
    global.screen = window.screen;
    global.crypto = window.crypto;
    global.btoa = window.btoa;
    global.atob = window.atob;

    // ========== 3. Webpack运行时shim ==========
    function __webpack_require__(id) {
        if (id === 'LGuY') return { amd: false };
        return {};
    }
    __webpack_require__.n = function (m) { return function () { return m; }; };
    var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;

    // ========== 4. 读取并执行IIFE ==========
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
        console.log('用法: node sap_sign_jsdom.js <url> [body]');
        console.log('示例: node sap_sign_jsdom.js "https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=83024"');
        console.log('\n依赖: npm install jsdom');
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
