import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import DriverCheckIn from "./DriverCheckIn";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route path="/check-in" element={<DriverCheckIn />} />
      <Route path="/*" element={<App />} />
    </Routes>
  </BrowserRouter>
);
