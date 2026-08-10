import { defineEventHandler } from 'nitro/h3';
import dalleHandler from '../../api/dalle.js';
import elevenLabsHandler from '../../api/elevenlabs.js';
import emailHandler from '../../api/email.js';
import embeddingsHandler from '../../api/embeddings.js';
import gammaExportHandler from '../../api/gamma/export.js';
import gammaExportStatusHandler from '../../api/gamma/exports/[id].js';
import gammaGenerationHandler from '../../api/gamma/generations.js';
import gammaGenerationStatusHandler from '../../api/gamma/generations/[id].js';
import openRouterHandler from '../../api/openai.js';
import proxyHandler from '../../api/proxy.js';
import transcribeHandler from '../../api/transcribe.js';
import {
    createLegacyRequest,
    createLegacyResponse,
    matchLegacyRoute
} from '../legacyApiAdapter.js';

const LEGACY_HANDLERS = {
    dalle: dalleHandler,
    elevenlabs: elevenLabsHandler,
    email: emailHandler,
    embeddings: embeddingsHandler,
    gammaExport: gammaExportHandler,
    gammaExportStatus: gammaExportStatusHandler,
    gammaGeneration: gammaGenerationHandler,
    gammaGenerationStatus: gammaGenerationStatusHandler,
    openrouter: openRouterHandler,
    proxy: proxyHandler,
    transcribe: transcribeHandler
};

export default defineEventHandler(async ({ req }) => {
    const url = new URL(req.url);
    const legacyRequest = await createLegacyRequest(req, url);
    const route = matchLegacyRoute(url.pathname);
    const handler = route ? LEGACY_HANDLERS[route.name] : null;
    if (!route || !handler) {
        return new Response(JSON.stringify({ error: 'API route not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }
    Object.assign(legacyRequest.query, route.params);

    const legacyResponse = createLegacyResponse();
    await handler(legacyRequest, legacyResponse.response);
    return legacyResponse.toWebResponse();
});
