import { createClient } from '@supabase/supabase-js';
import OpenAI, { toFile } from 'openai';
import busboy from 'busboy';
import { Transform } from 'stream';
import crypto from 'crypto';

const MAX_FILE_BYTES = 3670016; // 3.5 MB
const MAX_MULTIPART_OVERHEAD_BYTES = 65536; // 64 KB
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES; // 3735552 bytes

const ALLOWED_MIMES = ['audio/wav', 'audio/wave', 'video/webm', 'audio/webm'];

const MAX_SOURCE_FILE_BYTES = 24 * 1024 * 1024;
const PROVIDER_TIMEOUT_MS = 50000;
const SOURCE_MIME_CONFIGURATION = new Map([
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['audio/wav', 'wav'],
  ['audio/wave', 'wav'],
  ['audio/webm', 'webm'],
  ['video/mp4', 'mp4'],
  ['video/mpeg', 'mpeg'],
  ['video/webm', 'webm']
]);

const mimeConfiguration = {
  'audio/wav': { extension: 'wav' },
  'audio/wave': { extension: 'wav' },
  'video/webm': { extension: 'webm' },
  'audio/webm': { extension: 'webm' }
};

class TranscribeError extends Error {
  constructor(code, message, status, stage = 'unknown') {
    super(message);
    this.code = code;
    this.status = status;
    this.stage = stage;
  }
}

class ByteCounterStream extends Transform {
  constructor(maxBytes, onLimitExceeded) {
    super();
    this.maxBytes = maxBytes;
    this.bytesRead = 0;
    this.isLimitExceeded = false;
    this.onLimitExceeded = onLimitExceeded;
  }

  _transform(chunk, encoding, callback) {
    this.bytesRead += chunk.length;
    if (this.bytesRead > this.maxBytes) {
      if (!this.isLimitExceeded) {
        this.isLimitExceeded = true;
        this.onLimitExceeded();
      }
      callback(null);
      return;
    }
    this.push(chunk);
    callback();
  }
}

const parseMultipart = (req, correlationId) => {
  return new Promise((resolve, reject) => {
    let hasFinished = false;

    const safeReject = (err) => {
      if (hasFinished) return;
      hasFinished = true;
      reject(err);
    };

    const safeResolve = (data) => {
      if (hasFinished) return;
      hasFinished = true;
      resolve(data);
    };

    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('multipart/form-data')) {
      return safeReject(new TranscribeError('INVALID_REQUEST', 'Missing multipart boundary', 400, 'multipart_header_check'));
    }

    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1].trim();
      if (boundary.length > 70) {
        return safeReject(new TranscribeError('INVALID_REQUEST', 'Boundary parameter exceeds maximum length of 70 characters', 400, 'boundary_length_check'));
      }
    }

    let limitExceeded = false;
    let fileReceived = null;
    let guideIdReceived = null;
    let partsCount = 0;
    let isFinished = false;

    const onLimitExceeded = () => {
      limitExceeded = true;
      req.resume();
      safeReject(new TranscribeError('FILE_TOO_LARGE', 'The uploaded recording is too large.', 413, 'stream_limit_check'));
    };

    const counter = new ByteCounterStream(MAX_REQUEST_BYTES, onLimitExceeded);

    let bb;
    try {
      bb = busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fields: 1,
          parts: 3,
          fileSize: MAX_FILE_BYTES,
          fieldSize: 1024,
          fieldNameSize: 64,
          headerPairs: 20
        }
      });
    } catch (e) {
      req.resume();
      return safeReject(new TranscribeError('INVALID_REQUEST', 'Invalid multipart boundary or configuration', 400, 'busboy_init'));
    }

    let streamEnded = false;
    req.on('end', () => {
      streamEnded = true;
    });

    req.on('aborted', () => {
      safeReject(new TranscribeError('INVALID_REQUEST', 'Client aborted the request', 400, 'req_aborted'));
    });

    req.on('close', () => {
      if (!streamEnded && !isFinished && !limitExceeded && !hasFinished) {
        safeReject(new TranscribeError('INVALID_REQUEST', 'Premature stream closure', 400, 'req_closed'));
      }
    });

    bb.on('file', (name, fileStream, info) => {
      partsCount++;
      if (partsCount > 2) {
        fileStream.resume();
        return safeReject(new TranscribeError('INVALID_REQUEST', 'Excessive parts in request', 400, 'busboy_parts_limit'));
      }
      if (name !== 'file') {
        fileStream.resume();
        return safeReject(new TranscribeError('INVALID_REQUEST', `Unexpected file field: ${name}`, 400, 'busboy_file_field_name'));
      }
      if (fileReceived) {
        fileStream.resume();
        return safeReject(new TranscribeError('INVALID_REQUEST', 'Duplicate file field detected', 400, 'busboy_duplicate_file'));
      }

      const { filename, mimeType } = info;
      if (!filename || filename.trim() === '') {
        fileStream.resume();
        return safeReject(new TranscribeError('INVALID_REQUEST', 'Nonempty filename is required', 400, 'busboy_filename_check'));
      }

      fileReceived = {
        filename: filename.trim(),
        mimeType: mimeType ? mimeType.trim() : '',
        buffer: Buffer.alloc(0),
        size: 0
      };

      const chunks = [];
      fileStream.on('data', chunk => {
        chunks.push(chunk);
      });
      fileStream.on('limit', () => {
        limitExceeded = true;
        safeReject(new TranscribeError('FILE_TOO_LARGE', 'The uploaded recording is too large.', 413, 'busboy_file_size_limit'));
      });
      fileStream.on('end', () => {
        if (limitExceeded) return;
        if (fileStream.truncated) {
          limitExceeded = true;
          return safeReject(new TranscribeError('FILE_TOO_LARGE', 'The uploaded recording is too large.', 413, 'busboy_file_truncation'));
        }
        fileReceived.buffer = Buffer.concat(chunks);
        fileReceived.size = fileReceived.buffer.length;
        if (fileReceived.size === 0) {
          return safeReject(new TranscribeError('INVALID_REQUEST', 'Media content cannot be empty', 400, 'busboy_empty_file'));
        }
      });
      fileStream.on('error', err => {
        safeReject(new TranscribeError('INVALID_REQUEST', 'Error reading file stream', 400, 'busboy_file_stream_error'));
      });
    });

    bb.on('field', (name, val, info) => {
      partsCount++;
      if (partsCount > 2) {
        return safeReject(new TranscribeError('INVALID_REQUEST', 'Excessive parts in request', 400, 'busboy_field_parts_limit'));
      }
      if (name !== 'guideId') {
        return safeReject(new TranscribeError('INVALID_REQUEST', `Unexpected field name: ${name}`, 400, 'busboy_field_name'));
      }
      if (guideIdReceived !== null) {
        return safeReject(new TranscribeError('INVALID_REQUEST', 'Duplicate guide fields detected', 400, 'busboy_duplicate_field'));
      }
      guideIdReceived = val;
    });

    bb.on('filesLimit', () => {
      safeReject(new TranscribeError('INVALID_REQUEST', 'Too many files in request', 400, 'busboy_files_limit_event'));
    });

    bb.on('fieldsLimit', () => {
      safeReject(new TranscribeError('INVALID_REQUEST', 'Too many fields in request', 400, 'busboy_fields_limit_event'));
    });

    bb.on('partsLimit', () => {
      safeReject(new TranscribeError('INVALID_REQUEST', 'Too many parts in request', 400, 'busboy_parts_limit_event'));
    });

    bb.on('error', (err) => {
      safeReject(new TranscribeError('INVALID_REQUEST', 'Parser error', 400, 'busboy_general_error'));
    });

    bb.on('close', () => {
      if (limitExceeded || isFinished || hasFinished) return;
      isFinished = true;

      if (!guideIdReceived) {
        return safeReject(new TranscribeError('INVALID_REQUEST', 'Missing guideId parameter', 400, 'busboy_missing_field'));
      }
      if (!fileReceived) {
        return safeReject(new TranscribeError('INVALID_REQUEST', 'Missing file upload payload', 400, 'busboy_missing_file'));
      }

      safeResolve({
        guideId: guideIdReceived,
        file: fileReceived
      });
    });

    req.pipe(counter);
    counter.pipe(bb);
  });
};

const requireUuid = (value, fieldName) => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new TranscribeError('INVALID_REQUEST', `Invalid ${fieldName}.`, 400, 'source_request_validation');
  }
  return value;
};

const normaliseSourceTranscript = (sourceAssetId, duration, providerResult, requestId) => {
  const rawWords = Array.isArray(providerResult?.words) ? providerResult.words : [];
  const sortedWords = [...rawWords].sort((a, b) => Number(a.start) - Number(b.start));
  const words = [];
  let previousEnd = 0;

  sortedWords.forEach((rawWord, index) => {
    const text = String(rawWord?.word || rawWord?.text || '').trim();
    let start = Number(rawWord?.start);
    let end = Number(rawWord?.end);

    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) return;
    start = Math.max(0, start, previousEnd);
    end = Math.min(duration, end);
    if (end <= start) return;

    words.push({
      id: `${requestId}_w${index}_${Math.round(start * 1000)}_${Math.round(end * 1000)}`,
      text,
      startSourceTime: start,
      endSourceTime: end,
      confidence: null,
      speakerId: null
    });
    previousEnd = end;
  });

  return {
    schemaVersion: 1,
    sourceAssetId,
    language: String(providerResult?.language || 'en').toLowerCase(),
    duration,
    words
  };
};

export default async function handler(req, res) {
  // 1. Validate HTTP method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Generate correlation identifier
  const correlationId = crypto.randomUUID();

  // 3. Set X-Request-ID
  res.setHeader('X-Request-ID', correlationId);
  res.setHeader('Cache-Control', 'no-store');

  try {
    // 4. Validate server configuration
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !openaiApiKey) {
      throw new TranscribeError('SERVER_CONFIGURATION_ERROR', 'Server configuration error: Missing required credentials', 500, 'server_config_check');
    }

    // 5. Extract bearer token
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^bearer\s+/i, '').trim();
    if (!token) {
      throw new TranscribeError('AUTHENTICATION_REQUIRED', 'Missing authentication token', 401, 'auth_header_check');
    }

    // 6. Create user scoped Supabase client
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    // 7. Validate user with auth.getUser
    const { data: { user }, error: authErr } = await userSupabase.auth.getUser();
    if (authErr || !user) {
      throw new TranscribeError('AUTHENTICATION_INVALID', 'Invalid or expired authentication token', 401, 'auth_user_check');
    }

    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (contentType.startsWith('application/json')) {
      const guideId = requireUuid(req.body?.guideId, 'guide identifier');
      const sourceAssetId = requireUuid(req.body?.sourceAssetId, 'source asset identifier');

      const { data: hasEditAccess, error: accessErr } = await userSupabase.rpc('can_edit_video_editor_guide', {
        p_guide_id: guideId
      });
      if (accessErr || !hasEditAccess) {
        throw new TranscribeError('PERMISSION_DENIED', 'You do not have permission to transcribe this guide.', 403, 'source_permission_check');
      }

      const { data: asset, error: assetError } = await userSupabase
        .from('video_source_assets')
        .select('original_storage_path, duration_seconds')
        .eq('id', sourceAssetId)
        .eq('guide_id', guideId)
        .maybeSingle();
      if (assetError || !asset) {
        throw new TranscribeError('SOURCE_NOT_FOUND', 'The source recording could not be found.', 404, 'source_asset_lookup');
      }

      const duration = Number(asset.duration_seconds);
      if (!Number.isFinite(duration) || duration < 0) {
        throw new TranscribeError('SOURCE_INVALID', 'The source recording duration is invalid.', 500, 'source_duration_validation');
      }

      const { data: quotaResult, error: quotaErr } = await userSupabase.rpc('check_and_record_transcription_rate_limit', {
        p_guide_id: guideId,
        p_request_id: correlationId
      });
      if (quotaErr || !quotaResult) {
        throw new TranscribeError('INTERNAL_ERROR', 'Transcription is temporarily unavailable.', 503, 'source_quota_service');
      }
      if (!quotaResult.allowed) {
        throw new TranscribeError('RATE_LIMITED', 'Please wait before generating another transcript.', 429, 'source_quota_limit');
      }

      const sourcePath = String(asset.original_storage_path || '').trim();
      if (!sourcePath) {
        throw new TranscribeError('SOURCE_INVALID', 'The source recording location is invalid.', 400, 'source_path_validation');
      }

      let sourceBuffer;
      let sourceMime;
      if (/^https:\/\//i.test(sourcePath)) {
        const sourceUrl = new URL(sourcePath);
        const allowedHost = new URL(supabaseUrl).host;
        if (sourceUrl.protocol !== 'https:' || sourceUrl.host !== allowedHost) {
          throw new TranscribeError('SOURCE_INVALID', 'The source recording location is invalid.', 400, 'source_url_validation');
        }

        const sourceResponse = await fetch(sourceUrl, { signal: AbortSignal.timeout(30000) });
        if (!sourceResponse.ok) {
          throw new TranscribeError('SOURCE_DOWNLOAD_FAILED', 'The source recording could not be downloaded.', 502, 'source_download');
        }
        const declaredLength = Number(sourceResponse.headers.get('content-length') || 0);
        if (declaredLength > MAX_SOURCE_FILE_BYTES) {
          throw new TranscribeError('FILE_TOO_LARGE', 'This recording is too large for automatic transcription.', 413, 'source_size_header');
        }
        sourceMime = String(sourceResponse.headers.get('content-type') || '').split(';')[0].toLowerCase();
        sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer());
      } else {
        const { data: sourceBlob, error: storageError } = await userSupabase.storage.from('guides').download(sourcePath);
        if (storageError || !sourceBlob) {
          throw new TranscribeError('SOURCE_DOWNLOAD_FAILED', 'The source recording could not be downloaded.', 502, 'source_storage_download');
        }
        sourceMime = String(sourceBlob.type || '').split(';')[0].toLowerCase();
        sourceBuffer = Buffer.from(await sourceBlob.arrayBuffer());
      }

      if (!sourceBuffer.length) {
        throw new TranscribeError('INVALID_REQUEST', 'The source recording is empty.', 400, 'source_empty');
      }
      if (sourceBuffer.length > MAX_SOURCE_FILE_BYTES) {
        throw new TranscribeError('FILE_TOO_LARGE', 'This recording is too large for automatic transcription.', 413, 'source_size_check');
      }

      let extension = SOURCE_MIME_CONFIGURATION.get(sourceMime);
      if (!extension) {
        const pathname = sourcePath.toLowerCase();
        extension = pathname.endsWith('.mp4') ? 'mp4' : pathname.endsWith('.webm') ? 'webm' : null;
        sourceMime = extension === 'mp4' ? 'video/mp4' : extension === 'webm' ? 'video/webm' : sourceMime;
      }
      if (!extension) {
        throw new TranscribeError('UNSUPPORTED_MEDIA', 'The recording format is not supported.', 400, 'source_mime_check');
      }

      const openai = new OpenAI({ apiKey: openaiApiKey });
      const sourceFile = await toFile(sourceBuffer, `walkthrough_${correlationId}.${extension}`, { type: sourceMime });
      const transcription = await openai.audio.transcriptions.create({
        file: sourceFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word']
      }, {
        timeout: PROVIDER_TIMEOUT_MS
      });

      return res.status(200).json(
        normaliseSourceTranscript(sourceAssetId, duration, transcription, correlationId)
      );
    }

    // 8. Validate declared Content-Length
    const contentLengthHeader = req.headers['content-length'];
    if (contentLengthHeader) {
      const parsedLength = parseInt(contentLengthHeader, 10);
      if (isNaN(parsedLength) || parsedLength < 0) {
        throw new TranscribeError('INVALID_REQUEST', 'Invalid Content-Length header', 400, 'content_length_validation');
      }
      if (parsedLength > MAX_REQUEST_BYTES) {
        throw new TranscribeError('FILE_TOO_LARGE', 'The uploaded recording is too large.', 413, 'content_length_check');
      }
    }

    // 9. Parse bounded multipart stream
    const { guideId, file: fileData } = await parseMultipart(req, correlationId);

    // 10. Validate guide identifier
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guideId || typeof guideId !== 'string' || !uuidRegex.test(guideId) || guideId.trim() === '') {
      throw new TranscribeError('INVALID_REQUEST', 'Invalid guide identifier format', 400, 'guide_id_validation');
    }

    // 11. Validate exact MIME type and file
    const mime = fileData.mimeType.toLowerCase();
    if (!ALLOWED_MIMES.includes(mime)) {
      throw new TranscribeError('UNSUPPORTED_MEDIA', 'Unsupported media type: WAV or WebM required', 400, 'mime_check');
    }

    const mimeConfig = mimeConfiguration[mime];
    if (!mimeConfig) {
      throw new TranscribeError('UNSUPPORTED_MEDIA', 'Unsupported media type: WAV or WebM required', 400, 'mime_config_check');
    }

    // Choose file extension and generate internal filename
    const safeFilename = `walkthrough_${correlationId}.${mimeConfig.extension}`;

    // 12. Validate guide edit permission
    const { data: hasEditAccess, error: accessErr } = await userSupabase.rpc('can_edit_video_editor_guide', {
      p_guide_id: guideId
    });

    if (accessErr || !hasEditAccess) {
      throw new TranscribeError('PERMISSION_DENIED', 'Permission denied: User cannot edit this guide', 403, 'permission_check');
    }

    // 13. Check and record durable quota
    const { data: quotaResult, error: quotaErr } = await userSupabase.rpc('check_and_record_transcription_rate_limit', {
      p_guide_id: guideId,
      p_request_id: correlationId
    });

    if (quotaErr || !quotaResult) {
      throw new TranscribeError('INTERNAL_ERROR', 'Quota service is currently unavailable', 500, 'quota_service_call');
    }

    if (!quotaResult.allowed) {
      const errorMsg = `Rate limit exceeded. Please try again in ${quotaResult.retry_after_seconds} seconds.`;
      throw new TranscribeError('RATE_LIMITED', errorMsg, 429, 'quota_limit_check');
    }

    // 14. Call OpenAI Whisper-1 API
    const openai = new OpenAI({ apiKey: openaiApiKey });
    const file = await toFile(fileData.buffer, safeFilename, { type: fileData.mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word']
    }, {
      timeout: PROVIDER_TIMEOUT_MS
    });

    // 15. Return safe result
    return res.status(200).json(transcription);
  } catch (error) {
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected internal error occurred.';
    let status = 500;
    let stage = 'unknown';

    if (error instanceof TranscribeError) {
      code = error.code;
      message = error.message;
      status = error.status;
      stage = error.stage;
    } else if (error.name === 'RequestTimeoutError' || error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
      code = 'PROVIDER_TIMEOUT';
      message = 'The transcription request timed out. Please try again.';
      status = 504;
      stage = 'provider_timeout';
    } else if (error.status) {
      status = error.status;
      stage = 'provider_response';
      if (status === 429) {
        code = 'PROVIDER_RATE_LIMITED';
        message = 'Provider rate limit exceeded. Please try again later.';
      } else {
        code = 'PROVIDER_UNAVAILABLE';
        message = 'The transcription provider is temporarily unavailable.';
      }
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      code = 'PROVIDER_UNAVAILABLE';
      message = 'The transcription provider is temporarily unavailable.';
      status = 503;
      stage = 'provider_network';
    }

    // Safe logging: no access token, openAI keys, supabase keys, multipart body, audio content, raw provider bodies, or signed URLs.
    console.error(
      `[TranscribeError] RequestID: ${correlationId} | Code: ${code} | Status: ${status} | Stage: ${stage}`
    );

    return res.status(status).json({
      error: {
        code,
        message,
        requestId: correlationId
      }
    });
  }
}
