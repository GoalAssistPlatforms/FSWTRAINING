const DEFAULT_THUMBNAIL_WIDTH = 320;

let pdfRendererPromise;

const getPdfRenderer = async () => {
  if (!pdfRendererPromise) {
    pdfRendererPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ]).then(([pdfjsLib, workerModule]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjsLib;
    });
  }

  return pdfRendererPromise;
};

export const loadPdfForThumbnail = async url => {
  const pdfjsLib = await getPdfRenderer();
  return pdfjsLib.getDocument(url).promise;
};

export const renderDocumentThumbnail = async (thumbnail, {
  loadPdf = loadPdfForThumbnail,
  pixelRatio = window.devicePixelRatio || 1
} = {}) => {
  if (!thumbnail || thumbnail.dataset.thumbnailState) return;

  const url = thumbnail.dataset.pdfThumbnailUrl;
  const canvas = thumbnail.querySelector('.guide-document-thumbnail-canvas');
  if (!url || !canvas) {
    if (thumbnail) thumbnail.dataset.thumbnailState = 'failed';
    return;
  }

  thumbnail.dataset.thumbnailState = 'loading';
  let pdf;

  try {
    pdf = await loadPdf(url);
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = thumbnail.clientWidth || DEFAULT_THUMBNAIL_WIDTH;
    const cssScale = availableWidth / baseViewport.width;
    const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });

    canvas.width = Math.max(1, Math.floor(renderViewport.width));
    canvas.height = Math.max(1, Math.floor(renderViewport.height));
    canvas.style.aspectRatio = `${renderViewport.width} / ${renderViewport.height}`;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas rendering is unavailable');

    await page.render({ canvasContext: context, viewport: renderViewport }).promise;
    thumbnail.dataset.thumbnailState = 'ready';
  } catch (error) {
    thumbnail.dataset.thumbnailState = 'failed';
    console.warn('Unable to render document thumbnail', error);
  } finally {
    await pdf?.destroy?.();
  }
};

export const initDocumentThumbnails = (root, options = {}) => {
  if (!root) return () => {};

  const thumbnails = Array.from(root.querySelectorAll('[data-pdf-thumbnail-url]'))
    .filter(thumbnail => !thumbnail.dataset.thumbnailState);
  if (thumbnails.length === 0) return () => {};

  const render = thumbnail => renderDocumentThumbnail(thumbnail, options);

  if (typeof IntersectionObserver !== 'function') {
    thumbnails.forEach(render);
    return () => {};
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      render(entry.target);
    });
  }, { rootMargin: '180px 0px' });

  thumbnails.forEach(thumbnail => observer.observe(thumbnail));
  return () => observer.disconnect();
};
