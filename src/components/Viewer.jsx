// src/components/Viewer.jsx
import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import "./styles/Viewer.css";

export default function Viewer() {
  const location = useLocation();

  // Derive the PDF path from browser location:
  // - remove leading slash
  // - if no extension, append .pdf
  // Examples:
  //  /xyz               -> http://localhost:3000/xyz.pdf
  //  /abc/def           -> http://localhost:3000/abc/def.pdf
  //  /some.pdf          -> http://localhost:3000/some.pdf
  const pathFromUrl = decodeURIComponent(location.pathname.slice(1)); // remove leading '/'
  const pdfPath = pathFromUrl ? (pathFromUrl.endsWith(".pdf") ? pathFromUrl : `${pathFromUrl}.pdf`) : "";
  // Build the target URL hosted at port 3000 (you said e.g. localhost:3000/xyz.pdf).
  // If you want a different host/port, change window.location.hostname/3000 appropriately.
  const pdfUrl =
    pdfPath.length > 0
      ? `${window.location.protocol}//${window.location.hostname}:3000/${pdfPath}`
      : null;

  useEffect(() => {
    if (!pdfUrl) return;

    // inject adobe script once, then render
    const scriptId = "adobe-viewer-script";
    const renderAdobeViewer = () => {
      if (!window.AdobeDC) {
        setTimeout(renderAdobeViewer, 250);
        return;
      }

      const divId = "adobe-pdf-view";
      // clear any previous viewer markup (safeguard for route changes)
      const container = document.getElementById(divId);
      if (container) container.innerHTML = "";

      const adobeDCView = new window.AdobeDC.View({
        clientId: import.meta.env.VITE_ADOBE_CLIENT_ID,
        divId,
      });

      adobeDCView.previewFile(
        {
          content: { location: { url: pdfUrl } },
          metaData: { fileName: pdfPath.split("/").pop() },
        },
        {
          embedMode: "SIZED_CONTAINER", // better inside app layout; use FULL_WINDOW if you prefer
          showDownloadPDF: false,
          showPrintPDF: false,
          dockPageControls: true,
        }
      );
    };

    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = "https://acrobatservices.adobe.com/view-sdk/viewer.js";
      s.async = true;
      s.onload = renderAdobeViewer;
      document.body.appendChild(s);
    } else {
      renderAdobeViewer();
    }

    // no cleanup needed for the Adobe script; but remove viewer content on unmount/route change
    return () => {
      const container = document.getElementById("adobe-pdf-view");
      if (container) container.innerHTML = "";
    };
  }, [pdfUrl, pdfPath]);

  return (
    <div
      id="adobe-pdf-view"
      style={{
        width: "100%",
        height: "100vh",
        margin: 0,
        padding: 0,
        background: "#0f1720",
      }}
    >
      {!pdfUrl && (
        <div style={{ color: "#fff", padding: 20 }}>
          No PDF specified in the URL. Example usage: <code>/xyz</code> will load{" "}
          <code>http://localhost:3000/xyz.pdf</code>
        </div>
      )}
    </div>
  );
}
