import { defineEventHandler } from 'nitro/h3';
import { createUserSupabase } from '../../courseGeneration/database.js';

function bearerToken(request) {
    const authorization = request.headers.get('authorization') || '';
    return authorization.toLowerCase().startsWith('bearer ')
        ? authorization.slice(7).trim()
        : '';
}

export default defineEventHandler(async ({ req }) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    const accessToken = bearerToken(req);
    if (!accessToken) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    const userClient = createUserSupabase(accessToken);
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Your session has expired' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }
    const { data: profile, error: profileError } = await userClient
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();
    if (profileError || !['manager', 'admin'].includes(profile?.role)) {
        return new Response(JSON.stringify({ error: 'Manager access required' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    const sourceUrl = new URL(req.url);
    const assetPath = sourceUrl.pathname.replace(/^\/api\/gamma-assets\/?/, '');
    if (!assetPath || assetPath.includes('..')) {
        return new Response(JSON.stringify({ error: 'Invalid Gamma asset path' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    const upstreamUrl = new URL(`https://assets.api.gamma.app/${assetPath}`);
    upstreamUrl.search = sourceUrl.search;
    const upstream = await fetch(upstreamUrl, {
        method: req.method,
        signal: AbortSignal.timeout(120000)
    });
    const headers = new Headers();
    for (const name of ['content-type', 'content-length', 'content-disposition', 'etag', 'last-modified']) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
    }
    headers.set('Cache-Control', 'private, max-age=300');

    return new Response(req.method === 'HEAD' ? null : upstream.body, {
        status: upstream.status,
        headers
    });
});
