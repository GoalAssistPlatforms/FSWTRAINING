import { Readable } from 'node:stream';

const EXACT_ROUTES = new Map([
    ['/api/dalle', 'dalle'],
    ['/api/elevenlabs', 'elevenlabs'],
    ['/api/email', 'email'],
    ['/api/embeddings', 'embeddings'],
    ['/api/gamma/export', 'gammaExport'],
    ['/api/gamma/generations', 'gammaGeneration'],
    ['/api/openai', 'openrouter'],
    ['/api/proxy', 'proxy'],
    ['/api/transcribe', 'transcribe']
]);

export function matchLegacyRoute(pathname) {
    const exactName = EXACT_ROUTES.get(pathname);
    if (exactName) return { name: exactName, params: {} };

    const exportMatch = pathname.match(/^\/api\/gamma\/exports\/([^/]+)$/);
    if (exportMatch) {
        return { name: 'gammaExportStatus', params: { id: decodeURIComponent(exportMatch[1]) } };
    }

    const generationMatch = pathname.match(/^\/api\/gamma\/generations\/([^/]+)$/);
    if (generationMatch) {
        return { name: 'gammaGenerationStatus', params: { id: decodeURIComponent(generationMatch[1]) } };
    }

    return null;
}

export async function createLegacyRequest(request, url) {
    const bytes = request.method === 'GET' || request.method === 'HEAD'
        ? Buffer.alloc(0)
        : Buffer.from(await request.arrayBuffer());
    const legacyRequest = Readable.from(bytes.length ? [bytes] : []);
    legacyRequest.method = request.method;
    legacyRequest.url = `${url.pathname}${url.search}`;
    legacyRequest.headers = Object.fromEntries(request.headers.entries());
    legacyRequest.query = Object.fromEntries(url.searchParams.entries());
    legacyRequest.body = undefined;

    const contentType = legacyRequest.headers['content-type'] || '';
    if (bytes.length && contentType.includes('application/json')) {
        try {
            legacyRequest.body = JSON.parse(bytes.toString('utf8'));
        } catch {
            legacyRequest.body = {};
        }
    }
    return legacyRequest;
}

export function createLegacyResponse() {
    const state = {
        statusCode: 200,
        headers: new Headers(),
        chunks: []
    };

    const response = {
        status(code) {
            state.statusCode = code;
            return response;
        },
        setHeader(name, value) {
            state.headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
            return response;
        },
        getHeader(name) {
            return state.headers.get(name);
        },
        writeHead(code, headers = {}) {
            state.statusCode = code;
            for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
            return response;
        },
        write(value) {
            if (value !== undefined && value !== null) {
                state.chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
            }
            return true;
        },
        end(value) {
            response.write(value);
            return response;
        },
        json(value) {
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            state.chunks = [Buffer.from(JSON.stringify(value))];
            return response;
        },
        send(value) {
            if (value !== undefined && value !== null) {
                state.chunks = [Buffer.isBuffer(value) ? value : Buffer.from(String(value))];
            }
            return response;
        }
    };

    return {
        response,
        toWebResponse() {
            return new Response(state.chunks.length ? Buffer.concat(state.chunks) : null, {
                status: state.statusCode,
                headers: state.headers
            });
        }
    };
}
