// src/components/Viewer.jsx
import React, { useEffect } from "react";

export default function Viewer() {
  const pdfUrl =
    "https://raw.githubusercontent.com/Shashidharak89/Study_Materials_Collection/main/MCA-NMAMIT/1st-Sem/Data-Structures-And-Algorithms/Unite%20I/Chapter%201/Abstract_Data_Types.pdf";

  useEffect(() => {
    // dynamically inject the Adobe script if not already loaded
    const scriptId = "adobe-dc-view";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://acrobatservices.adobe.com/view-sdk/viewer.js";
      script.onload = renderAdobeViewer;
      document.body.appendChild(script);
    } else {
      renderAdobeViewer();
    }

    function renderAdobeViewer() {
      if (!window.AdobeDC) {
        // script may not yet be ready, retry
        setTimeout(renderAdobeViewer, 300);
        return;
      }

      const adobeDCView = new window.AdobeDC.View({
        clientId: import.meta.env.VITE_ADOBE_CLIENT_ID,
        divId: "adobe-pdf-view",
      });

      adobeDCView.previewFile(
        {
          content: {
            location: { url: pdfUrl },
          },
          metaData: {
            fileName: "Abstract_Data_Types.pdf",
          },
        },
        {
          embedMode: "FULL_WINDOW", // options: FULL_WINDOW, SIZED_CONTAINER, LIGHT_BOX, IN_LINE
          showDownloadPDF: false, // disable download
          showPrintPDF: false, // disable print
          dockPageControls: true,
        }
      );
    }
  }, []);

  return (
    <div
      id="adobe-pdf-view"
      style={{ width: "100%", height: "100vh", margin: 0, padding: 0 }}
    ></div>
  );
}
