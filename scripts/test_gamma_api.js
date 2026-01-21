import https from 'https';

const apiKey = 'sk-gamma-eCc3ewq8TTmLFWgl8CHXsZZrBgOeyyeLGXfgKEbR0';
const generationId = 'Qz3OEqm6JiDz8jrYnYLX1'; // From previous step

const options = {
    hostname: 'public-api.gamma.app',
    path: `/v1.0/generations/${generationId}`,
    method: 'GET',
    headers: {
        'X-API-KEY': apiKey
    }
};

console.log(`Testing Gamma Polling for ${generationId}...`);
const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('BODY:', body);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
