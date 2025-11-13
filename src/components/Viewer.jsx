// src/components/Viewer.jsx
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import "./styles/Viewer.css";

/* buildPdfUrlFromPath - same smart rules as before */
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

  useEffect(() => {
    const rawPath = decodeURIComponent(location.pathname.slice(1));
    const built = buildPdfUrlFromPath(rawPath);
    setError(null);
    setPdfUrl(built || null);
  }, [location.pathname]);

  useEffect(() => {
    if (!pdfUrl) return;
    setLoading(true);
    setError(null);

    const scriptId = "adobe-viewer-script";
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

        adobeDCView.previewFile(
          { content: { location: { url: pdfUrl } }, metaData: { fileName: pdfUrl.split("/").pop() } },
          { embedMode: "SIZED_CONTAINER", showDownloadPDF: false, showPrintPDF: false, dockPageControls: true }
        );

        // poll for loaded viewer element
        const start = Date.now();
        const timeoutMs = 20000;
        const poll = () => {
          const containerEl = document.getElementById(divId);
          if (!containerEl) {
            setError("Viewer container unavailable.");
            setLoading(false);
            return;
          }
          const iframe = containerEl.querySelector("iframe");
          const docRole = containerEl.querySelector("[role='document']");
          const adobeClass = containerEl.querySelector(".adobe-dc-view");
          if (iframe || docRole || adobeClass) {
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

    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
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

      {/* Preloader overlay */}
      <div className={`viewer-preloader ${loading ? "visible" : "hidden"}`}>
        <div className="spinner" role="status" aria-label="Loading">
          <svg viewBox="0 0 50 50" className="spinner-svg"><circle cx="25" cy="25" r="20" /></svg>
        </div>
        <div className="preloader-text">{error ? "Failed to load PDF" : loadedOnce ? "Rendering..." : "Loading PDF..."}</div>
        {error && <div className="preloader-error">{error}</div>}
      </div>

      {/* Adobe viewer container */}
      <div id="adobe-pdf-view" className="viewer-container" />

      {/* small footer */}
      <div className="viewer-footer">
        {pdfUrl && <span>Powered by Adobe PDF Embed API</span>}
      </div>
    </div>
  );
}
