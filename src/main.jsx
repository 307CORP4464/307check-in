import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import App from "./App";
import Login from "./Login";
import DriverCheckIn from "./DriverCheckIn";
import CSRDashboard from "./CSRDashboard";
import AdminDashboard from "./AdminDashboard";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/check-in" element={<DriverCheckIn />} />

      {/* Protected */}
      <Route path="/" element={<App />}>
        <Route path="csr-dashboard" element={<CSRDashboard />} />
        <Route path="admin" element={<AdminDashboard />} />
      </Route>
    </Routes>
  </BrowserRouter>
);
