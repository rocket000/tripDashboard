export async function openPdf(blob, isActive, onLoading) {
  const pdfjs = await import('./pdfjs/pdf.mjs');
  const data = await blob.arrayBuffer();
  if (!isActive()) return null;

  const assets = new URL('./pdfjs/', import.meta.url);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.mjs', assets).href;
  const loadingTask = pdfjs.getDocument({
    data,
    cMapUrl: new URL('cmaps/', assets).href,
    iccUrl: new URL('iccs/', assets).href,
    standardFontDataUrl: new URL('standard_fonts/', assets).href,
    wasmUrl: new URL('wasm/', assets).href,
    disableFontFace: true,
  });
  onLoading(loadingTask);
  return loadingTask.promise;
}

export async function renderPage(document, pageNumber, width, isActive, onRendering) {
  const page = await document.getPage(pageNumber);
  if (!isActive()) return null;

  const base = page.getViewport({ scale: 1 });
  const density = Math.min(window.devicePixelRatio || 1, 2);
  const scale = Math.min(width * density / base.width, 2400 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Page ${pageNumber}`);

  const task = page.render({ canvas, viewport });
  onRendering(task);
  await task.promise;
  return canvas;
}
