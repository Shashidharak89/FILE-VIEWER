import React, { useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import "./styles/Viewer.css";

const Viewer = () => {
  const viewerDivRef = useRef(null);
  const { "*": pdfPath } = useParams(); 
  // e.g. if route is /somefolder/xyz.pdf then pdfPath = "somefolder/xyz.pdf"
  const query = new URLSearchParams(useLocation().search);
  const pdfUrlFromQuery = query.get("pdf") || null;

  // Determine PDF URL: prefer URL param if given, else pdfPath
  const pdfURL = pdfUrlFromQuery || (pdfPath ? `/${pdfPath}` : null);

  useEffect(() => {
    if (!pdfURL) {
      console.warn("No PDF URL provided for Viewer");
      return;
    }

    const loadEmbed = async () => {
      await new Promise(resolve => {
        if (window.AdobeDC && window.AdobeDC.View) {
          resolve();
        } else {
          document.addEventListener("adobe_dc_view_sdk.ready", () => resolve(), { once: true });
        }
      });

      const clientId = import.meta.env.VITE_ADOBE_CLIENT_ID;
      if (!clientId) {
        console.error("VITE_ADOBE_CLIENT_ID environment variable is not set");
        return;
      }

      const adobeDCView = new window.AdobeDC.View({
        clientId,
        divId: viewerDivRef.current.id,
      });

      adobeDCView.previewFile(
        {
          content: { location: { url: pdfURL } },
          metaData: { fileName: pdfURL.split("/").pop() },
        },
        {
          embedMode: "IN_LINE",
          defaultViewMode: "FIT_WIDTH",
          showDownloadPDF: false,
          showPrintPDF: false,
        }
      );
    };

    loadEmbed();

    // Optional: cleanup if needed
    return () => {
      // If the API provides a disposal method, call it here
    };
  }, [pdfURL]);

  return (
    <div className="viewer-container">
      <div id="adobe-dc-view" ref={viewerDivRef} className="viewer-div"></div>
    </div>
  );
};

export default Viewer;
