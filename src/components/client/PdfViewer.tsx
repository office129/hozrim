"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const SWIPE_THRESHOLD = 50;
// Matches Tailwind's md breakpoint, used everywhere else in the app to
// switch between mobile and desktop layouts.
const DESKTOP_QUERY = "(min-width: 768px)";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

// rootMargin only expands the observer's own root — it does NOT expand
// any scrollable ancestor sitting between the target and that root. The
// app's whole content area scrolls inside its own overflow-y div (the
// phone-shell layout in ClientShell), not the bare document, so a null
// root (the default) clips against that inner container's actual,
// unexpanded bounds and pages just past it never intersect no matter how
// large rootMargin is. Finding that real scroll container and passing it
// as root fixes it.
function findScrollParent(el: HTMLElement | null): Element | null {
  let node = el?.parentElement ?? null;
  while (node) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

// Renders its page only once scrolled near the viewport, so a long
// document doesn't pay to draw every page's canvas up front — the
// placeholder height (a standard portrait-page aspect ratio) keeps the
// scrollbar from jumping around as pages mount in.
function LazyPage({ pageNumber, width }: { pageNumber: number; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: findScrollParent(el), rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={visible ? undefined : { minHeight: width * 1.414 }}>
      {visible && <Page pageNumber={pageNumber} width={width} renderTextLayer={false} renderAnnotationLayer={false} />}
    </div>
  );
}

// Mobile browsers don't reliably render PDFs placed in an <iframe> —
// desktop Chrome/Firefox/Edge have a built-in PDF.js-based viewer that
// renders inline, but mobile browsers/webviews mostly show a generic
// "open externally" placeholder instead. Rendering with react-pdf (pdf.js
// running against a <canvas>) sidesteps that entirely, since it's our own
// JS drawing pixels rather than relying on the browser's native embed
// handling.
//
// Mobile: one page at a time (buttons + swipe) — easier to read at phone
// width, and avoids rendering many canvases on a weaker device.
// Desktop: a normal continuous scroll through every page, matching how a
// document reads naturally with a mouse/trackpad and more screen space.
export function PdfViewer({ url, className }: { url: string; className?: string }) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const isDesktop = useIsDesktop();

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

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const deltaX = endX - touchStartX.current;
    touchStartX.current = null;
    // RTL paging convention: swiping left-to-right (finger moves right)
    // advances, right-to-left goes back — matching how a Hebrew document
    // is naturally paged.
    if (deltaX >= SWIPE_THRESHOLD) setPage((p) => Math.min(numPages, p + 1));
    else if (deltaX <= -SWIPE_THRESHOLD) setPage((p) => Math.max(1, p - 1));
  }

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
        {width && isDesktop && (
          <>
            <div className="flex items-center justify-center gap-2 mb-2">
              <button
                onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
                disabled={zoom <= MIN_ZOOM}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border-strong text-ink disabled:opacity-40 cursor-pointer"
              >
                −
              </button>
              <div className="text-xs text-muted w-11 text-center">{Math.round(zoom * 100)}%</div>
              <button
                onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
                disabled={zoom >= MAX_ZOOM}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border-strong text-ink disabled:opacity-40 cursor-pointer"
              >
                +
              </button>
            </div>
            <div
              className="flex flex-col items-center gap-2 overflow-auto rounded-[10px] border border-border bg-card p-2"
              style={{ maxHeight: 600 }}
            >
              {Array.from({ length: numPages }, (_, i) => (
                <LazyPage key={i + 1} pageNumber={i + 1} width={(width - 16) * zoom} />
              ))}
            </div>
          </>
        )}
        {width && !isDesktop && (
          <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <Page pageNumber={page} width={width} renderTextLayer={false} renderAnnotationLayer={false} />
          </div>
        )}
      </Document>
      {!isDesktop && numPages > 1 && (
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
