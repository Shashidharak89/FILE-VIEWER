// src/components/Viewer.jsx
import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import "./styles/Viewer.css";

/* buildPdfUrlFromPath - smart rules:
   - full http(s) URL -> use directly (ensure .pdf)
   - github.com/.../blob/... -> convert to raw.githubusercontent.com
   - domain-like first segment -> prepend https://
   - fallback -> http(s)://<host>:3000/<path>.pdf
*/
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
  const adobeScriptId = useRef("adobe-viewer-script");

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

  // Load Adobe SDK and render
  useEffect(() => {
    if (!pdfUrl) return;
    setLoading(true);
    setError(null);

    const divId = "adobe-pdf-view";

    const renderAdobe = () => {
      if (!window.AdobeDC) {
        setTimeout(renderAdobe, 250);
        return;
      }

      const container = document.getElementById(divId);
      if (!container) {
        setError("Viewer container not found.");
        setLoading(false);
        return;
      }
      container.innerHTML = "";

      try {
        const adobeDCView = new window.AdobeDC.View({
          clientId: import.meta.env.VITE_ADOBE_CLIENT_ID,
          divId,
        });

        // Use IN_LINE for continuous vertical pages (best for scrolling)
        // On larger screens we still use IN_LINE so continuous behavior is consistent.
        adobeDCView.previewFile(
          {
            content: { location: { url: pdfUrl } },
            metaData: { fileName: pdfUrl.split("/").pop() },
          },
          {
            embedMode: "IN_LINE", // IN_LINE enables DOM injection for continuous scroll
            showDownloadPDF: false,
            showPrintPDF: false,
            showAnnotationTools: false,
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

          // prefer inline view
          const inlineView = containerEl.querySelector(".adobe-dc-view");
          const iframe = containerEl.querySelector("iframe");

          if (inlineView) {
            // add helper class used by CSS
            inlineView.classList.add("adobe-inline-injected");
            // ensure inline view takes full width
            inlineView.style.width = "100%";
            inlineView.style.boxSizing = "border-box";
            // done
            setLoading(false);
            setLoadedOnce(true);
            return;
          }

          // fallback: if we get an iframe, try to allow vertical flow (best effort)
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

    // Inject Adobe script only once
    if (!document.getElementById(adobeScriptId.current)) {
      const s = document.createElement("script");
      s.id = adobeScriptId.current;
      s.src = "https://acrobatservices.adobe.com/view-sdk/viewer.js";
      s.async = true;
      s.onload = renderAdobe;
      s.onerror = () => {
        setError("Failed to load Adobe viewer script.");
        setLoading(false);
      };
      document.body.appendChild(s);
    } else {
      renderAdobe();
    }

    // cleanup on unmount / route change
    return () => {
      const container = document.getElementById(divId);
      if (container) container.innerHTML = "";
    };
  }, [pdfUrl]);

  return (
    <div className="viewer-root">
      <div className="viewer-topbar">
        {pdfUrl ? (
          <>
            <a
              className="viewer-btn"
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              title="Open PDF in new tab (download)"
            >
              <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path fill="currentColor" d="M5 20h14v-2H5v2zM13 3h-2v8H8l4 4 4-4h-3V3z" />
              </svg>
              Download
            </a>
            <div className="viewer-url" title={pdfUrl}>
              {pdfUrl.length > 90 ? pdfUrl.slice(0, 90) + "…" : pdfUrl}
            </div>
          </>
        ) : (
          <div className="viewer-hint">
            No PDF specified — usage: <code>/raw.githubusercontent.com/USER/REPO/.../file.pdf</code> or{" "}
            <code>/xyz</code>
          </div>
        )}
      </div>

      {/* Preloader overlay */}
      <div className={`viewer-preloader ${loading ? "visible" : "hidden"}`}>
        <div className="spinner" role="status" aria-label="Loading">
          <svg viewBox="0 0 50 50" className="spinner-svg">
            <circle cx="25" cy="25" r="20" />
          </svg>
        </div>
        <div className="preloader-text">{error ? "Failed to load PDF" : loadedOnce ? "Rendering..." : "Loading PDF..."}</div>
        {error && <div className="preloader-error">{error}</div>}
      </div>

      {/* Adobe viewer container */}
      <div id="adobe-pdf-view" className={`viewer-container ${isMobilePortrait ? "mobile-portrait" : ""}`} />

      {/* small footer */}
      <div className="viewer-footer">{pdfUrl && <span>Powered by Adobe PDF Embed API</span>}</div>
    </div>
  );
}
