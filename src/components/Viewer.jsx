import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import "./styles/Viewer.css";

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
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [adobeApis, setAdobeApis] = useState(null);  // store APIs object to use navigation
  const adobeScriptId = useRef("adobe-viewer-script");
  const adobeReadyListenerRef = useRef(null);

  // Build PDF url from current route
  useEffect(() => {
    const rawPath = decodeURIComponent(location.pathname.slice(1));
    const built = buildPdfUrlFromPath(rawPath);
    setError(null);
    setPdfUrl(built || null);
    setAdobeApis(null);
  }, [location.pathname]);

  // Render and init Adobe viewer
  useEffect(() => {
    if (!pdfUrl) return;

    setLoading(true);
    setError(null);

    const divId = "adobe-pdf-view";

    const renderAdobe = () => {
      if (!window.AdobeDC) {
        // wait a bit if the SDK isn’t loaded yet
        setTimeout(renderAdobe, 250);
        return;
      }

      const container = document.getElementById(divId);
      if (!container) {
        setError("Viewer container not found.");
        setLoading(false);
        return;
      }

      container.innerHTML = ""; // clear previous

      try {
        const adobeDCView = new window.AdobeDC.View({
          clientId: import.meta.env.VITE_ADOBE_CLIENT_ID,
          divId,
        });

        const previewPromise = adobeDCView.previewFile(
          {
            content: { location: { url: pdfUrl } },
            metaData: { fileName: pdfUrl.split("/").pop() },
          },
          {
            embedMode: "IN_LINE",
            showDownloadPDF: false,
            showPrintPDF: false,
            defaultViewMode: "FIT_WIDTH"
          }
        );

        previewPromise.then(adobeViewer => {
          adobeViewer.getAPIs().then(apis => {
            setAdobeApis(apis);
          }).catch(err => {
            console.warn("Failed to get Adobe APIs", err);
          });
        }).catch(err => {
          console.error("previewFile failed:", err);
          setError("Failed to load PDF: " + (err && err.message));
        });

        // Poll until something appears (optional)
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

          if (inlineView || iframe) {
            setLoading(false);
            setLoadedOnce(true);
            return;
          }
          if (Date.now() - start > timeoutMs) {
            setLoading(false);
            setError("Timed out loading the PDF.");
            return;
          }
          setTimeout(poll, 300);
        };
        setTimeout(poll, 300);

      } catch (err) {
        console.error("Adobe viewer init failed:", err);
        setError("Failed to initialize Adobe viewer: " + (err && err.message));
        setLoading(false);
      }
    };

    const attachScriptAndRender = () => {
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
          document.addEventListener("adobe_dc_view_sdk.ready", onReady, { once: true });
          renderAdobe();
        };
        s.onerror = () => {
          setError("Failed to load Adobe viewer script.");
          setLoading(false);
        };
        document.body.appendChild(s);
      } else {
        document.addEventListener("adobe_dc_view_sdk.ready", onReady, { once: true });
        renderAdobe();
      }
    };

    attachScriptAndRender();

    return () => {
      const container = document.getElementById(divId);
      if (container) container.innerHTML = "";
      if (adobeReadyListenerRef.current) {
        try { document.removeEventListener("adobe_dc_view_sdk.ready", adobeReadyListenerRef.current); }
        catch(e) {}
        adobeReadyListenerRef.current = null;
      }
    };
  }, [pdfUrl]);

  const onNext = () => {
    if (adobeApis) {
      adobeApis.getCurrentPage()
        .then(current => {
          const next = current + 1;
          return adobeApis.gotoLocation(next, 0, 0);
        })
        .catch(err => {
          console.warn("Failed to go to next page", err);
        });
    }
  };

  const onPrev = () => {
    if (adobeApis) {
      adobeApis.getCurrentPage()
        .then(current => {
          const prev = Math.max(1, current - 1);
          return adobeApis.gotoLocation(prev, 0, 0);
        })
        .catch(err => {
          console.warn("Failed to go to previous page", err);
        });
    }
  };

  return (
    <div className="viewer-root">
      <div className="viewer-topbar">
        {pdfUrl ? (
          <>
            <button className="viewer-btn" onClick={onPrev} disabled={!adobeApis}>Prev</button>
            <button className="viewer-btn" onClick={onNext} disabled={!adobeApis}>Next</button>
            <div className="viewer-url" title={pdfUrl}>
              {pdfUrl.length > 90 ? pdfUrl.slice(0,90) + "…" : pdfUrl}
            </div>
          </>
        ) : (
          <div className="viewer-hint">
            No PDF specified — pass the PDF link in URL path
          </div>
        )}
      </div>

      <div className={`viewer-preloader ${loading ? "visible" : "hidden"}`}>
        {loading && <div>Loading PDF…</div>}
        {error && <div className="preloader-error">{error}</div>}
      </div>

      <div id="adobe-pdf-view" className="viewer-container" />

      <div className="viewer-footer">
        {pdfUrl && <span>Powered by Adobe PDF Embed API</span>}
      </div>
    </div>
  );
}
