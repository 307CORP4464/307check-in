import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

/* ---------- LOGIN ---------- */
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) setError(error.message);
  };

  return (
    <div style={{ padding: 40, maxWidth: 400, margin: "auto" }}>
      <h2>CSR Login</h2>

      <form onSubmit={handleLogin}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        {error && <p style={{ color: "red" }}>{error}</p>}
        <button style={{ width: "100%", padding: 10 }}>Login</button>
      </form>
    </div>
  );
}

/* ---------- CSR DASHBOARD ---------- */
function CSRDashboard() {
  return (
    <div style={{ padding: 40 }}>
      <h1>CSR Dashboard</h1>
      <p>If you see this, routing is FIXED.</p>
    </div>
  );
}

/* ---------- DRIVER CHECK-IN ---------- */
function DriverCheckIn() {
  return (
    <div style={{ padding: 40 }}>
      <h1>Driver Check-In</h1>
      <p>If you see this, routing is FIXED.</p>
    </div>
  );
}

/* ---------- APP ---------- */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <p style={{ padding: 40 }}>Loading app…</p>;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/csr" element={session ? <CSRDashboard /> : <Navigate to="/" />} />
        <Route path="/check-in" element={<DriverCheckIn />} />
      </Routes>
    </HashRouter>
  );
}
