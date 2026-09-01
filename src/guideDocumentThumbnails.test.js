// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { initDocumentThumbnails, renderDocumentThumbnail } from './guideDocumentThumbnails.js';

const createThumbnail = () => {
  document.body.innerHTML = `
    <div data-pdf-thumbnail-url="https://example.com/guide.pdf">
      <canvas class="guide-document-thumbnail-canvas"></canvas>
    </div>
  `;

  const thumbnail = document.querySelector('[data-pdf-thumbnail-url]');
  Object.defineProperty(thumbnail, 'clientWidth', { value: 200 });
  return thumbnail;
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('document thumbnails', () => {
  it('renders the first PDF page into the card canvas', async () => {
    const thumbnail = createThumbnail();
    const canvas = thumbnail.querySelector('canvas');
    const canvasContext = {};
    canvas.getContext = vi.fn(() => canvasContext);

    const render = vi.fn(() => ({ promise: Promise.resolve() }));
    const getViewport = vi.fn(({ scale }) => ({ width: 500 * scale, height: 700 * scale }));
    const getPage = vi.fn(async pageNumber => ({ getViewport, render }));
    const destroy = vi.fn(async () => {});
    const loadPdf = vi.fn(async () => ({ getPage, destroy }));

    await renderDocumentThumbnail(thumbnail, { loadPdf, pixelRatio: 2 });

    expect(loadPdf).toHaveBeenCalledWith('https://example.com/guide.pdf');
    expect(getPage).toHaveBeenCalledWith(1);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ canvasContext }));
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(560);
    expect(thumbnail.dataset.thumbnailState).toBe('ready');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('keeps the PDF fallback icon when preview rendering fails', async () => {
    const thumbnail = createThumbnail();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await renderDocumentThumbnail(thumbnail, {
      loadPdf: vi.fn(async () => { throw new Error('Preview unavailable'); })
    });

    expect(thumbnail.dataset.thumbnailState).toBe('failed');
    expect(warning).toHaveBeenCalledOnce();
  });

  it('renders immediately when observer support is unavailable', async () => {
    const thumbnail = createThumbnail();
    const canvas = thumbnail.querySelector('canvas');
    canvas.getContext = vi.fn(() => ({}));

    const loadPdf = vi.fn(async () => ({
      getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 500 * scale, height: 700 * scale }),
        render: () => ({ promise: Promise.resolve() })
      }),
      destroy: async () => {}
    }));

    const cleanup = initDocumentThumbnails(document.body, { loadPdf, pixelRatio: 1 });
    await vi.waitFor(() => expect(thumbnail.dataset.thumbnailState).toBe('ready'));

    expect(loadPdf).toHaveBeenCalledOnce();
    expect(cleanup).toBeTypeOf('function');
  });
});
