// src/components/Viewer.jsx
import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "./styles/Viewer.css";

// Use worker served from public
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

/* Build a usable PDF URL from the route path */
function buildPdfUrlFromPath(pathFromUrl) {
  if (!pathFromUrl) return null;
  let p = pathFromUrl.trim();
  if (p.startsWith("/")) p = p.slice(1);
  try { p = decodeURIComponent(p); } catch {}
  if (/^https?:\/\//i.test(p)) return p.match(/\.pdf$/i) ? p : `${p}.pdf`;

  if (/github\.com/i.test(p)) {
    if (p.includes("/blob/")) {
      const beforeBlob = p.split("/blob/")[0];
      const afterBlob = p.split("/blob/")[1];
      const parts = beforeBlob.split("/");
      if (parts.length >= 3) {
        const user = parts[1], repo = parts[2];
        const rawPath = `${user}/${repo}/${afterBlob}`;
        const url = `https://raw.githubusercontent.com/${rawPath}`;
        return url.match(/\.pdf$/i) ? url : `${url}.pdf`;
      }
    }
    const replaced = p.replace(/^github\.com/i, "raw.githubusercontent.com").replace("/blob/", "/");
    const candidate = replaced.startsWith("raw.githubusercontent.com") ? `https://${replaced}` : `https://${replaced}`;
    return candidate.match(/\.pdf$/i) ? candidate : `${candidate}.pdf`;
  }

  const firstSegment = p.split("/")[0];
  if (firstSegment.includes(".") && !firstSegment.includes(":")) {
    const url = `https://${p}`;
    return url.match(/\.pdf$/i) ? url : `${url}.pdf`;
  }

  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = 3000;
  const fallbackUrl = `${protocol}//${hostname}:${port}/${p}`;
  return fallbackUrl.match(/\.pdf$/i) ? fallbackUrl : `${fallbackUrl}.pdf`;
}

export default function Viewer() {
  const location = useLocation();
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // refs for page wrappers for scrolling
  const pageRefs = useRef([]);
  // track last known visible page (for UI)
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // build pdf url from route
  useEffect(() => {
    const rawPath = decodeURIComponent(location.pathname.slice(1));
    const built = buildPdfUrlFromPath(rawPath);
    setError(null);
    setPdfUrl(built || null);
    setNumPages(null);
    setCurrentPageIndex(0);
    pageRefs.current = [];
  }, [location.pathname]);

  function onDocumentLoadSuccess(doc) {
    setNumPages(doc.numPages);
    setLoading(false);
    // initialize refs
    pageRefs.current = Array.from({ length: doc.numPages }, () => React.createRef());
  }

  useEffect(() => {
    if (pdfUrl) {
      setLoading(true);
    }
  }, [pdfUrl]);

  // Scroll to page index (0-based) with smooth behavior
  const scrollToPageIndex = (idx) => {
    if (!pageRefs.current || pageRefs.current.length === 0) return;
    const ref = pageRefs.current[idx];
    if (!ref || !ref.current) return;
    // offset so topbar doesn't cover the page
    const topbar = document.querySelector(".viewer-topbar");
    const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 72;
    const rect = ref.current.getBoundingClientRect();
    const absoluteTop = window.scrollY + rect.top - topbarHeight - 12;
    window.scrollTo({ top: absoluteTop, behavior: "smooth" });
    setCurrentPageIndex(idx);
  };

  // Prev / Next handlers
  const goPrev = () => {
    if (!numPages) return;
    const idx = Math.max(0, currentPageIndex - 1);
    scrollToPageIndex(idx);
  };
  const goNext = () => {
    if (!numPages) return;
    const idx = Math.min(numPages - 1, currentPageIndex + 1);
    scrollToPageIndex(idx);
  };

  // Observe scrolling to update currentPageIndex (best-effort)
  useEffect(() => {
    const observerOptions = { root: null, rootMargin: "0px", threshold: 0.45 };
    const observer = new IntersectionObserver((entries) => {
      // choose the entry with largest intersection ratio above threshold
      let best = null;
      for (const e of entries) {
        if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
      }
      if (best && best.isIntersecting) {
        const idx = Number(best.target.getAttribute("data-page-index"));
        setCurrentPageIndex(idx);
      }
    }, observerOptions);

    pageRefs.current.forEach((r, i) => {
      if (r && r.current) observer.observe(r.current);
    });

    return () => observer.disconnect();
  }, [numPages]);

  // simple retry / error handling if fetch fails
  const onDocumentLoadError = (err) => {
    console.error("PDF load error:", err);
    setError("Failed to load PDF. Check URL / CORS.");
    setLoading(false);
  };

  return (
    <div className="viewer-root pdfjs-viewer">
      <div className="viewer-topbar">
        <div className="viewer-top-left">
          <a className="viewer-btn" href={pdfUrl || "#"} target="_blank" rel="noreferrer" title="Open PDF in new tab">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M5 20h14v-2H5v2zM13 3h-2v8H8l4 4 4-4h-3V3z"/></svg>
            Open
          </a>
        </div>

        <div className="viewer-top-center">
          {numPages ? (
            <div className="page-indicator">
              Page {currentPageIndex + 1} / {numPages}
            </div>
          ) : (
            <div className="page-indicator">Loading…</div>
          )}
        </div>

        <div className="viewer-top-right">
          <a className="viewer-url" href={pdfUrl} target="_blank" rel="noreferrer" title={pdfUrl}>
            {pdfUrl ? (pdfUrl.length > 80 ? pdfUrl.slice(0,80) + "…" : pdfUrl) : "No PDF"}
          </a>
        </div>
      </div>

      {/* Floating Prev/Next always available */}
      <div className="pdf-nav-float">
        <button className="pdf-nav-btn prev" onClick={goPrev} aria-label="Previous page">‹</button>
        <button className="pdf-nav-btn next" onClick={goNext} aria-label="Next page">›</button>
      </div>

      {/* Loading / Error */}
      {loading && <div className="pdf-loading big">Loading PDF…</div>}
      {error && <div className="pdf-error">{error}</div>}

      {/* Document */}
      <main className="pdf-container">
        {pdfUrl && (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            renderMode="canvas"
            loading={<div className="pdf-loading">Loading document…</div>}
          >
            {Array.from(new Array(numPages || 0), (v, index) => (
              <div
                key={`page_wrapper_${index}`}
                ref={(el) => {
                  if (!pageRefs.current[index]) pageRefs.current[index] = { current: el };
                  else pageRefs.current[index].current = el;
                }}
                data-page-index={index}
                className="pdf-page-wrapper"
              >
                <Page
                  pageNumber={index + 1}
                  width={Math.min(window.innerWidth * 0.95, 1100)}
                  loading={<div className="pdf-loading small">Rendering page {index + 1}…</div>}
                />
              </div>
            ))}
          </Document>
        )}
      </main>
    </div>
  );
}
