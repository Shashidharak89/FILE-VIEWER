// src/components/Viewer.jsx
import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import "./styles/Viewer.css";

/* buildPdfUrlFromPath - unchanged smart rules */
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);

  // controls visibility — always visible by default
  const [controlsVisible, setControlsVisible] = useState(true);

  const adobeScriptId = useRef("adobe-viewer-script");
  const adobeReadyListenerRef = useRef(null);

  // Build PDF url from current route
  useEffect(() => {
    const rawPath = decodeURIComponent(location.pathname.slice(1));
    const built = buildPdfUrlFromPath(rawPath);
    setError(null);
    setPdfUrl(built || null);
  }, [location.pathname]);

  // Detect mobile portrait to change embed mode
  useEffect(() => {
    function checkMobilePortrait() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsMobilePortrait(w <= 768 && h >= w);
    }
    checkMobilePortrait();
    window.addEventListener("resize", checkMobilePortrait);
    window.addEventListener("orientationchange", checkMobilePortrait);
    return () => {
      window.removeEventListener("resize", checkMobilePortrait);
      window.removeEventListener("orientationchange", checkMobilePortrait);
    };
  }, []);

  // Show controls (keeps them visible; no hide timer)
  const showControls = () => {
    setControlsVisible(true);
  };

  // listen for pointer to ensure controls reappear if someone hides them via CSS or other means
  useEffect(() => {
    const onPointer = () => showControls();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, []);

  // helper: get inline page elements injected by Adobe
  const getAdobePages = () => {
    const container = document.getElementById("adobe-pdf-view");
    if (!container) return [];
    const inlineView = container.querySelector(".adobe-dc-view");
    if (inlineView) {
      const pages = inlineView.querySelectorAll(".page, .documentPage, .Page");
      return Array.from(pages);
    }
    const pages2 = container.querySelectorAll(".page, .documentPage, .Page");
    return Array.from(pages2);
  };

  // scroll helpers: find current visible page index and scroll to target
  const topbarHeight = 72; // adjust if your topbar height differs
  function findCurrentPageIndex(pageEls) {
    for (let i = 0; i < pageEls.length; i++) {
      const el = pageEls[i];
      const rect = el.getBoundingClientRect();
      // consider current if top is within top 60% of viewport
      if (rect.top >= 0 && rect.top < window.innerHeight * 0.6) return i;
    }
    // fallback: if none found, choose first fully visible or 0
    for (let i = 0; i < pageEls.length; i++) {
      const rect = pageEls[i].getBoundingClientRect();
      if (rect.bottom > 0) return i;
    }
    return 0;
  }

  function scrollToPageIndex(idx) {
    const pages = getAdobePages();
    if (!pages || pages.length === 0) {
      // if no inline pages, try scrolling to iframe container (best effort)
      const iframe = document.querySelector("#adobe-pdf-view iframe");
      if (iframe) {
        const rect = iframe.getBoundingClientRect();
        const absoluteTop = window.scrollY + rect.top - topbarHeight - 8;
        window.scrollTo({ top: absoluteTop, behavior: "smooth" });
      }
      return;
    }
    const target = pages[idx];
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const absoluteTop = window.scrollY + rect.top - topbarHeight - 8;
    window.scrollTo({ top: absoluteTop, behavior: "smooth" });
  }

  function onNext() {
    const pages = getAdobePages();
    if (!pages || pages.length === 0) return;
    const current = findCurrentPageIndex(pages);
    const next = Math.min(pages.length - 1, current + 1);
    scrollToPageIndex(next);
    showControls(); // keep controls visible after pressing
  }
  function onPrev() {
    const pages = getAdobePages();
    if (!pages || pages.length === 0) return;
    const current = findCurrentPageIndex(pages);
    const prev = Math.max(0, current - 1);
    scrollToPageIndex(prev);
    showControls();
  }

  // render adobe viewer whenever pdfUrl or isMobilePortrait changes
  useEffect(() => {
    if (!pdfUrl) return;
    setLoading(true);
    setError(null);

    const divId = "adobe-pdf-view";

    const renderAdobe = () => {
      // Adobe SDK may not have loaded yet; wait and retry a bit if not present
      if (!window.AdobeDC) {
        // try again shortly
        setTimeout(renderAdobe, 250);
        return;
      }

      const container = document.getElementById(divId);
      if (!container) {
        setError("Viewer container not found.");
        setLoading(false);
        return;
      }

      // clear previous content (if any)
      container.innerHTML = "";

      try {
        const adobeDCView = new window.AdobeDC.View({
          clientId: import.meta.env.VITE_ADOBE_CLIENT_ID,
          divId,
        });

        // Prefer IN_LINE (continuous) so vertical scrolling works well.
        const embedMode = "IN_LINE";

        adobeDCView.previewFile(
          {
            content: { location: { url: pdfUrl } },
            metaData: { fileName: pdfUrl.split("/").pop() },
          },
          {
            embedMode,
            showDownloadPDF: false,
            showPrintPDF: false,
            dockPageControls: true,
          }
        );

        // Poll for injected inline DOM and apply small styling hints
        const start = Date.now();
        const timeoutMs = 20000;
        const poll = () => {
          const containerEl = document.getElementById(divId);
          if (!containerEl) {
            setError("Viewer container unavailable.");
            setLoading(false);
            return;
          }

          const inlineView = containerEl.querySelector(".adobe-dc-view");
          const iframe = containerEl.querySelector("iframe");

          if (inlineView) {
            inlineView.classList.add("adobe-inline-injected");
            inlineView.style.width = "100%";
            inlineView.style.boxSizing = "border-box";
            setLoading(false);
            setLoadedOnce(true);
            return;
          }

          if (iframe) {
            iframe.style.width = "100%";
            iframe.style.maxWidth = "100%";
            iframe.style.border = "0";
            iframe.style.height = "auto";
            setLoading(false);
            setLoadedOnce(true);
            return;
          }

          if (Date.now() - start > timeoutMs) {
            setLoading(false);
            setError("Timed out loading the PDF. Check the URL and CORS policy.");
            return;
          }
          setTimeout(poll, 300);
        };

        setTimeout(poll, 300);
      } catch (err) {
        setError("Failed to initialize Adobe viewer: " + (err && err.message));
        setLoading(false);
      }
    };

    // Ensure script is loaded and hook into adobe_dc_view_sdk.ready if available
    const attachScriptAndRender = () => {
      // If the global ready event exists later, we'll register a listener — keep track so we can cleanup.
      const onReady = () => {
        renderAdobe();
      };
      adobeReadyListenerRef.current = onReady;

      if (!document.getElementById(adobeScriptId.current)) {
        const s = document.createElement("script");
        s.id = adobeScriptId.current;
        s.src = "https://acrobatservices.adobe.com/view-sdk/viewer.js";
        s.async = true;
        s.onload = () => {
          // Adobe sample uses adobe_dc_view_sdk.ready event; register and also call render as fallback
          if (typeof document !== "undefined") {
            document.addEventListener("adobe_dc_view_sdk.ready", onReady, { once: true });
          }
          // call render in case SDK is ready immediately
          renderAdobe();
        };
        s.onerror = () => {
          setError("Failed to load Adobe viewer script.");
          setLoading(false);
        };
        document.body.appendChild(s);
      } else {
        // script already present — register ready listener (if needed) and call render
        if (typeof document !== "undefined") {
          document.addEventListener("adobe_dc_view_sdk.ready", onReady, { once: true });
        }
        renderAdobe();
      }
    };

    attachScriptAndRender();

    // cleanup
    return () => {
      const container = document.getElementById(divId);
      if (container) container.innerHTML = "";
      // remove adobe ready listener if still present
      if (adobeReadyListenerRef.current && typeof document !== "undefined") {
        try {
          document.removeEventListener("adobe_dc_view_sdk.ready", adobeReadyListenerRef.current);
        } catch (e) {
          // ignore
        }
        adobeReadyListenerRef.current = null;
      }
    };
  }, [pdfUrl, isMobilePortrait]);

  return (
    <div className="viewer-root">
      <div className="viewer-topbar">
        {pdfUrl ? (
          <>
            <a className="viewer-btn" href={pdfUrl} target="_blank" rel="noreferrer" title="Open PDF in new tab (download)">
              <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M5 20h14v-2H5v2zM13 3h-2v8H8l4 4 4-4h-3V3z"/></svg>
              Download
            </a>
            <div className="viewer-url" title={pdfUrl}>{pdfUrl.length > 90 ? pdfUrl.slice(0, 90) + "…" : pdfUrl}</div>
          </>
        ) : (
          <div className="viewer-hint">No PDF specified — usage: <code>/raw.githubusercontent.com/USER/REPO/.../file.pdf</code> or <code>/xyz</code></div>
        )}
      </div>

      {/* Floating Prev/Next controls (always visible) */}
      <div className={`viewer-floating-controls ${controlsVisible ? "visible" : "hidden"}`} aria-hidden={!controlsVisible}>
        <button className="float-btn prev-btn" onClick={onPrev} aria-label="Previous page">‹</button>
        <button className="float-btn next-btn" onClick={onNext} aria-label="Next page">›</button>
      </div>

      {/* Preloader overlay */}
      <div className={`viewer-preloader ${loading ? "visible" : "hidden"}`}>
        <div className="spinner" role="status" aria-label="Loading">
          <svg viewBox="0 0 50 50" className="spinner-svg"><circle cx="25" cy="25" r="20" /></svg>
        </div>
        <div className="preloader-text">{error ? "Failed to load PDF" : loadedOnce ? "Rendering..." : "Loading PDF..."}</div>
        {error && <div className="preloader-error">{error}</div>}
      </div>

      {/* Adobe viewer container */}
      <div id="adobe-pdf-view" className={`viewer-container ${isMobilePortrait ? "mobile-portrait" : ""}`} />

      {/* small footer */}
      <div className="viewer-footer">
        {pdfUrl && <span>Powered by Adobe PDF Embed API</span>}
      </div>
    </div>
  );
}
