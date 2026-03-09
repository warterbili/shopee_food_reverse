const https = require('https');

const url = 'https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=83024';
const urlObj = new URL(url);

function request(label, headers) {
    return new Promise((resolve) => {
        https.get({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const json = JSON.parse(data);
                    const d = json.reply.delivery_detail;
                    console.log(`[${label}] Status: ${res.statusCode} | Restaurant: ${d.name} | Rating: ${d.rating.avg}`);
                } else {
                    console.log(`[${label}] Status: ${res.statusCode} | FAILED`);
                }
                resolve();
            });
        }).on('error', e => { console.log(`[${label}] Error: ${e.message}`); resolve(); });
    });
}

(async () => {
    // Test 1: Stub方案
    const stub = require('./sap_sign_stub');
    const h1 = stub.buildFullHeaders(url);
    await request('Stub方案', h1);

    // Test 2: JSDOM方案
    // 需要清除缓存重新加载, 因为两个模块都修改global
    delete require.cache[require.resolve('./sap_sign_jsdom')];
    const jsdom = require('./sap_sign_jsdom');
    const h2 = jsdom.buildFullHeaders(url);
    await request('JSDOM方案', h2);
})();
