"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// Mobile browsers don't reliably render PDFs placed in an <iframe> —
// desktop Chrome/Firefox/Edge have a built-in PDF.js-based viewer that
// renders inline, but mobile browsers/webviews mostly show a generic
// "open externally" placeholder instead. Rendering with react-pdf (pdf.js
// running against a <canvas>) sidesteps that entirely, since it's our own
// JS drawing pixels rather than relying on the browser's native embed
// handling. Only the current page is rendered (not the whole document) so
// a long, multi-page summary doesn't have to render 80 canvases at once.
export function PdfViewer({ url, className }: { url: string; className?: string }) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={className}>
      <Document
        file={url}
        onLoadSuccess={({ numPages: n }) => {
          setNumPages(n);
          setPage(1);
        }}
        loading={<div className="text-xs text-muted text-center py-6">טוען מסמך…</div>}
        error={<div className="text-xs text-danger text-center py-6">לא ניתן לטעון את המסמך</div>}
      >
        {width && <Page pageNumber={page} width={width} renderTextLayer={false} renderAnnotationLayer={false} />}
      </Document>
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-2.5 py-1 rounded-lg border border-border-strong text-xs text-ink disabled:opacity-40 cursor-pointer"
          >
            ‹ הקודם
          </button>
          <div className="text-xs text-muted">
            עמוד {page} מתוך {numPages}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
            className="px-2.5 py-1 rounded-lg border border-border-strong text-xs text-ink disabled:opacity-40 cursor-pointer"
          >
            הבא ›
          </button>
        </div>
      )}
    </div>
  );
}
