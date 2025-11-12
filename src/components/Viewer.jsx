// src/components/Viewer.jsx
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import "./styles/Viewer.css";

/**
 * Build a usable PDF URL from the route path.
 *
 * Rules:
 * - If path starts with http:// or https:// -> use as-is.
 * - If path looks like a hostname (first segment contains a dot) -> prepend https://
 * - If path contains "github.com" and "/blob/" -> convert to raw.githubusercontent.com
 * - Otherwise -> assume the PDF is hosted at the same hostname but port 3000:
 *     https://<current-hostname>:3000/<path>
 * - If final path doesn't end with .pdf, append .pdf
 */
function buildPdfUrlFromPath(pathFromUrl) {
  if (!pathFromUrl) return null;
  let p = pathFromUrl.trim();

  // If user provided a leading slash accidentally (shouldn't happen since we cut it),
  // remove it for normalization.
  if (p.startsWith("/")) p = p.slice(1);

  // Decode URI components (so spaces %20 etc become actual chars)
  try {
    p = decodeURIComponent(p);
  } catch (e) {
    // ignore decode errors and use original
  }

  // If path already looks like a full URL:
  if (/^https?:\/\//i.test(p)) {
    // ensure .pdf extension
    return p.match(/\.pdf$/i) ? p : `${p}.pdf`;
  }

  // If GitHub "blob" URL (html page), convert to raw domain:
  // e.g. github.com/USER/REPO/blob/main/path/to/file.pdf
  // -> raw.githubusercontent.com/USER/REPO/main/path/to/file.pdf
  if (/github\.com/i.test(p)) {
    // if it contains '/blob/' perform conversion
    if (p.includes("/blob/")) {
      // Example: github.com/user/repo/blob/main/dir/file.pdf
      const beforeBlob = p.split("/blob/")[0]; // github.com/user/repo
      const afterBlob = p.split("/blob/")[1]; // main/dir/file.pdf
      const parts = beforeBlob.split("/");
      // parts = ['github.com','user','repo', ...]
      // Build raw path
      if (parts.length >= 3) {
        const user = parts[1];
        const repo = parts[2];
        const rawPath = `${user}/${repo}/${afterBlob}`;
        const url = `https://raw.githubusercontent.com/${rawPath}`;
        return url.match(/\.pdf$/i) ? url : `${url}.pdf`;
      }
    }

    // If user gave a GitHub URL but not 'blob', try to coerce to raw by simple replace
    // (best-effort)
    const replaced = p.replace(/^github\.com/i, "raw.githubusercontent.com").replace("/blob/", "/");
    const githubRawCandidate = replaced.startsWith("raw.githubusercontent.com")
      ? `https://${replaced}`
      : `https://${replaced}`;
    return githubRawCandidate.match(/\.pdf$/i) ? githubRawCandidate : `${githubRawCandidate}.pdf`;
  }

  // If first segment looks like a domain (contains a dot), treat as domain path and prepend https://
  const firstSegment = p.split("/")[0];
  if (firstSegment.includes(".") && !firstSegment.includes(":")) {
    // e.g. raw.githubusercontent.com/user/repo/...
    const url = `https://${p}`;
    return url.match(/\.pdf$/i) ? url : `${url}.pdf`;
  }

  // Lastly, fallback to using same host (use protocol + hostname) but port 3000
  // e.g. http(s)://<host>:3000/<path>.pdf
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

  useEffect(() => {
    const rawPath = decodeURIComponent(location.pathname.slice(1)); // remove leading '/'
    const built = buildPdfUrlFromPath(rawPath);

    setError(null);
    setPdfUrl(built || null);
  }, [location.pathname]);

  useEffect(() => {
    if (!pdfUrl) return;

    const scriptId = "adobe-viewer-script";
    const renderAdobe = () => {
      if (!window.AdobeDC) {
        setTimeout(renderAdobe, 250);
        return;
      }

      const divId = "adobe-pdf-view";
      const container = document.getElementById(divId);
      if (!container) {
        setError("Viewer container not found.");
        return;
      }
      container.innerHTML = "";

      try {
        const adobeDCView = new window.AdobeDC.View({
          clientId: import.meta.env.VITE_ADOBE_CLIENT_ID,
          divId,
        });

        adobeDCView.previewFile(
          {
            content: { location: { url: pdfUrl } },
            metaData: { fileName: pdfUrl.split("/").pop() },
          },
          {
            embedMode: "SIZED_CONTAINER",
            showDownloadPDF: false,
            showPrintPDF: false,
            dockPageControls: true,
          }
        );
      } catch (err) {
        setError("Failed to initialize Adobe viewer. " + (err && err.message));
      }
    };

    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = "https://acrobatservices.adobe.com/view-sdk/viewer.js";
      s.async = true;
      s.onload = renderAdobe;
      s.onerror = () => setError("Failed to load Adobe viewer script.");
      document.body.appendChild(s);
    } else {
      renderAdobe();
    }

    return () => {
      const container = document.getElementById("adobe-pdf-view");
      if (container) container.innerHTML = "";
    };
  }, [pdfUrl]);

  return (
    <div style={{ width: "100%", height: "100vh", background: "#0f1720" }}>
      <div id="adobe-pdf-view" style={{ width: "100%", height: "100%" }} />
      {!pdfUrl && (
        <div style={{ padding: 16, color: "#fff" }}>
          No PDF path provided. Example:
          <div style={{ marginTop: 8, color: "#9aa4b2" }}>
            <code>/raw.githubusercontent.com/Shashidharak89/.../Abstract_Data_Types.pdf</code>
            <br />
            or
            <br />
            <code>/github.com/Shashidharak89/Study_Materials_Collection/blob/main/.../Abstract_Data_Types.pdf</code>
            <br />
            or
            <br />
            <code>/xyz</code> (will load <code>http://&lt;your-host&gt;:3000/xyz.pdf</code>)
          </div>
        </div>
      )}

      {pdfUrl && (
        <div style={{ position: "absolute", left: 8, top: 8, color: "#9aa4b2", fontSize: 12 }}>
          Loading: <span style={{ color: "#fff" }}>{pdfUrl}</span>
        </div>
      )}

      {error && (
        <div style={{ position: "absolute", right: 8, top: 8, background: "#3b0b0b", color: "#fff", padding: 8, borderRadius: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}
