import { createError, defineEventHandler } from 'nitro/h3';
import { createUserSupabase, getServiceSupabase } from '../../courseGeneration/database.js';

const GAMMA_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

function readBearerToken(request) {
    const authorization = request.headers.get('authorization') || '';
    return authorization.toLowerCase().startsWith('bearer ')
        ? authorization.slice(7).trim()
        : '';
}

function parseGammaAssetUrl(value) {
    try {
        const url = new URL(String(value || ''));
        if (url.protocol !== 'https:' || url.hostname !== 'assets.api.gamma.app') {
            return null;
        }
        return url;
    } catch {
        return null;
    }
}

export default defineEventHandler(async ({ req }) => {
    const accessToken = readBearerToken(req);
    if (!accessToken) {
        throw createError({ statusCode: 401, statusMessage: 'Authentication required' });
    }

    const body = await req.json().catch(() => ({}));
    const gammaId = String(body?.gammaId || '').trim();
    const pdfUrl = parseGammaAssetUrl(body?.pdfDownloadUrl);

    if (!GAMMA_ID_PATTERN.test(gammaId)) {
        throw createError({ statusCode: 400, statusMessage: 'A valid Gamma presentation ID is required' });
    }
    if (!pdfUrl) {
        throw createError({ statusCode: 400, statusMessage: 'A valid Gamma PDF URL is required' });
    }

    const userClient = createUserSupabase(accessToken);
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData?.user) {
        throw createError({ statusCode: 401, statusMessage: 'Your session has expired' });
    }

    const { data: profile, error: profileError } = await userClient
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();

    if (profileError || !['manager', 'admin'].includes(profile?.role)) {
        throw createError({ statusCode: 403, statusMessage: 'Manager access required' });
    }

    const pdfResponse = await fetch(pdfUrl, {
        signal: AbortSignal.timeout(120000)
    });
    if (!pdfResponse.ok) {
        throw createError({
            statusCode: 502,
            statusMessage: `Gamma PDF download failed with status ${pdfResponse.status}`
        });
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    if (!pdfBuffer.length || pdfBuffer.length > MAX_PDF_BYTES) {
        throw createError({ statusCode: 413, statusMessage: 'The exported PDF is too large to store' });
    }
    if (pdfBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw createError({ statusCode: 502, statusMessage: 'Gamma did not return a valid PDF' });
    }

    const filePath = `slides/${gammaId}.pdf`;
    const bucket = getServiceSupabase().storage.from('course_assets');
    const { error: uploadError } = await bucket.upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        cacheControl: '0',
        upsert: true
    });

    if (uploadError) {
        console.error('Presentation PDF upload failed.', uploadError);
        throw createError({
            statusCode: 502,
            statusMessage: 'Could not store the presentation PDF'
        });
    }

    const publicUrl = bucket.getPublicUrl(filePath).data.publicUrl;
    return {
        publicUrl: `${publicUrl}?v=${Date.now()}`
    };
});
