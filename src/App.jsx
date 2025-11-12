// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Viewer from "./components/Viewer";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Catch-all route: any pathname is forwarded to Viewer */}
        <Route path="/*" element={<Viewer />} />
      </Routes>
    </BrowserRouter>
  );
}
