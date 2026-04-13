const url = "https://www.fsw.uk.com/";

async function testProxy(name, proxyUrl, isJson) {
    try {
        console.log(`Testing ${name}...`);
        const res = await fetch(proxyUrl);
        if (!res.ok) {
            console.log(`  Failed: HTTP ${res.status}`);
            return;
        }
        if (isJson) {
            const data = await res.json();
            console.log(`  Success! Content length: ${data.contents ? data.contents.length : 'N/A'}`);
        } else {
            const text = await res.text();
            console.log(`  Success! Content length: ${text.length}`);
        }
    } catch (e) {
        console.log(`  Failed: ${e.message}`);
    }
}

async function run() {
    await testProxy("allorigins", `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, true);
    await testProxy("corsproxy", `https://corsproxy.io/?${encodeURIComponent(url)}`, false);
    await testProxy("codetabs", `https://api.codetabs.com/v1/proxy?quest=${url}`, false);
}

run();
