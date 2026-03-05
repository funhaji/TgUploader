"use client";

import { useState } from "react";
import AdminLogin from "./components/Login";
import AdminDashboard from "./components/Dashboard";

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  return loggedIn ? (
    <AdminDashboard />
  ) : (
    <AdminLogin onLogin={() => setLoggedIn(true)} />
  );
}
