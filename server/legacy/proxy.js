import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateAddress(address) {
    const normalised = String(address || '').toLowerCase();
    if (isIP(normalised) === 4) {
        const parts = normalised.split('.').map(Number);
        return parts[0] === 0
            || parts[0] === 10
            || parts[0] === 127
            || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
            || (parts[0] === 169 && parts[1] === 254)
            || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
            || (parts[0] === 192 && parts[1] === 168)
            || parts[0] >= 224;
    }
    if (isIP(normalised) === 6) {
        return normalised === '::1'
            || normalised === '::'
            || normalised.startsWith('fc')
            || normalised.startsWith('fd')
            || normalised.startsWith('fe8')
            || normalised.startsWith('fe9')
            || normalised.startsWith('fea')
            || normalised.startsWith('feb')
            || normalised.startsWith('::ffff:');
    }
    return true;
}

async function validatePublicUrl(value) {
    const target = new URL(value);
    if (target.protocol !== 'https:' || target.username || target.password || (target.port && target.port !== '443')) {
        throw new Error('Only public HTTPS links are supported.');
    }
    if (target.hostname === 'localhost' || target.hostname.endsWith('.localhost')) {
        throw new Error('Local addresses are not supported.');
    }

    const addresses = await lookup(target.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) {
        throw new Error('Private network addresses are not supported.');
    }
    return target;
}

async function requireManager(req) {
    const authorization = req.headers.authorization || '';
    const accessToken = authorization.toLowerCase().startsWith('bearer ')
        ? authorization.slice(7).trim()
        : '';
    if (!accessToken) return false;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase server configuration.');
    const client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const { data: userData, error: userError } = await client.auth.getUser(accessToken);
    if (userError || !userData?.user) return false;
    const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();
    return !profileError && ['manager', 'admin'].includes(profile?.role);
}

async function fetchPublicPage(initialUrl) {
    let target = await validatePublicUrl(initialUrl);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        const response = await fetch(target, {
            redirect: 'manual',
            headers: {
                'User-Agent': 'FSW Training Link Reader/1.0',
                Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9'
            },
            signal: AbortSignal.timeout(15000)
        });
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location || redirect === MAX_REDIRECTS) throw new Error('The link redirected too many times.');
            target = await validatePublicUrl(new URL(location, target).toString());
            continue;
        }
        return response;
    }
    throw new Error('The link could not be fetched.');
}

async function readBoundedText(response) {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw new Error('The linked page is too large to process.');
    }

    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new Error('The linked page is too large to process.');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        if (!await requireManager(req)) return res.status(401).json({ error: 'Manager authentication required' });
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'Missing url parameter' });

        const response = await fetchPublicPage(url);
        if (!response.ok) return res.status(response.status).send(`Failed to fetch: ${response.statusText}`);
        const contentType = response.headers.get('content-type') || '';
        if (!/^(text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
            return res.status(415).json({ error: 'The link did not return a supported text page.' });
        }

        res.setHeader('Content-Type', contentType || 'text/html; charset=utf-8');
        return res.status(200).send(await readBoundedText(response));
    } catch (error) {
        console.error('Proxy Fetch Error:', error);
        return res.status(400).json({ error: error.message || 'The link could not be fetched.' });
    }
}
