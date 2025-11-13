import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import "./styles/Viewer.css";

function buildPdfUrlFromPath(pathFromUrl) {
  if (!pathFromUrl) return null;
  let p = pathFromUrl.trim();
  if (p.startsWith("/")) p = p.slice(1);
  try { p = decodeURIComponent(p); } catch {}
  if (/^https?:\/\//i.test(p)) {
    return p.match(/\.pdf$/i) ? p : `${p}.pdf`;
  }

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
  const port = window.location.port || "3000";
  const fallbackUrl = `${protocol}//${hostname}:${port}/${p}`;
  return fallbackUrl.match(/\.pdf$/i) ? fallbackUrl : `${fallbackUrl}.pdf`;
}

export default function Viewer() {
  const location = useLocation();
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

    const scriptId = "adobe-viewer-sdk-script";
    const divId = "adobe-pdf-view";

    const loadViewer = () => {
      if (!window.AdobeDC) {
        setTimeout(loadViewer, 250);
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
        const adobeView = new window.AdobeDC.View({
          clientId: import.meta.env.VITE_ADOBE_CLIENT_ID,
          divId: divId,
        });

        adobeView.previewFile(
          {
            content: { location: { url: pdfUrl } },
            metaData: { fileName: pdfUrl.split("/").pop() },
          },
          {
            embedMode: "IN_LINE",                // stacked vertical pages mode
            defaultViewMode: "FIT_WIDTH",        // fit width for responsive
            showDownloadPDF: false,
            showPrintPDF: false,
          }
        );

        // simple poll to remove loader when viewer loads
        const start = Date.now();
        const timeoutMs = 15000;
        const poll = () => {
          const el = document.getElementById(divId);
          if (el && (el.querySelector(".adobe-dc-view") || el.querySelector("iframe"))) {
            setLoading(false);
            return;
          }
          if (Date.now() - start > timeoutMs) {
            setLoading(false);
            setError("Timed out loading PDF.");
            return;
          }
          setTimeout(poll, 300);
        };
        poll();

      } catch (err) {
        setLoading(false);
        setError("Failed to initialize viewer: " + (err && err.message));
      }
    };

    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = "https://acrobatservices.adobe.com/view-sdk/viewer.js";
      s.async = true;
      s.onload = () => loadViewer();
      s.onerror = () => {
        setLoading(false);
        setError("Failed to load Adobe viewer script.");
      };
      document.body.appendChild(s);
    } else {
      loadViewer();
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
          <a className="viewer-btn" href={pdfUrl} target="_blank" rel="noreferrer">
            Download
          </a>
        ) : (
          <div className="viewer-hint">No PDF specified in URL path</div>
        )}
      </div>

      <div className={`viewer-preloader ${loading ? "visible" : "hidden"}`}>
        {loading && <div className="spinner" role="status" aria-label="Loading..."></div>}
        {error && <div className="preloader-error">{error}</div>}
      </div>

      <div id="adobe-pdf-view" className="viewer-container" />

      <div className="viewer-footer">
        {pdfUrl && <span>Powered by Adobe PDF Embed API</span>}
      </div>
    </div>
  );
}
