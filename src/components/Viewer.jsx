import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import "./styles/Viewer.css";

export default function Viewer() {
  const viewerDivRef = useRef(null);
  const location = useLocation();

  // derive PDF URL from path (assuming something like /xyz.pdf)
  const path = decodeURIComponent(location.pathname.slice(1));
  const pdfUrl = path ? path : null;

  useEffect(() => {
    if (!pdfUrl) return;

    const clientId = import.meta.env.VITE_ADOBE_CLIENT_ID;
    if (!clientId) {
      console.error("Missing Adobe PDF Embed API client ID");
      return;
    }

    const loadViewer = () => {
      const adobeDCView = new window.AdobeDC.View({
        clientId: clientId,
        divId: viewerDivRef.current.id
      });

      adobeDCView.previewFile(
        {
          content: { location: { url: pdfUrl } },
          metaData: { fileName: pdfUrl.split("/").pop() }
        },
        {
          embedMode: "IN_LINE",
          defaultViewMode: "FIT_WIDTH",
          showDownloadPDF: false,
          showPrintPDF: false
        }
      );
    };

    if (window.AdobeDC && window.AdobeDC.View) {
      loadViewer();
    } else {
      document.addEventListener("adobe_dc_view_sdk.ready", loadViewer, { once: true });
    }
  }, [pdfUrl]);

  return (
    <div className="viewer-container">
      <div id="adobe-dc-view" ref={viewerDivRef} className="viewer-div"></div>
    </div>
  );
}
