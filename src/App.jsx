console.log("ENV CHECK", {
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_ANON_KEY?.slice(0, 10),
});
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabase";

/* -------------------- PAGES -------------------- */

function Loading() {
  return <p style={{ padding: 40 }}>Loading app...</p>;
}

function Login({ onLogin }) {
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
    else onLogin();
  };

  return (
    <div style={{ padding: 40, maxWidth: 400, margin: "0 auto" }}>
      <h1>307 Check-In</h1>
      <h2>Login</h2>

      <form onSubmit={handleLogin}>
        <input
          type="email"
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

function DriverCheckIn() {
  return (
    <div style={{ padding: 40 }}>
      <h1>Driver Check-In</h1>
      <p>Driver form will load here.</p>
    </div>
  );
}

function CSRDashboard() {
  return (
    <div style={{ padding: 40 }}>
      <h1>CSR Dashboard</h1>
      <p>CSR queue and docks load here.</p>
    </div>
  );
}

/* -------------------- APP -------------------- */

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) setSession(data.session);
      } catch (err) {
        console.error("Auth error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) return <Loading />;

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            session ? <Navigate to="/csr-dashboard" /> : <Login onLogin={() => {}} />
          }
        />

        <Route path="/check-in" element={<DriverCheckIn />} />

        <Route
          path="/csr-dashboard"
          element={
            session ? <CSRDashboard /> : <Navigate to="/" />
          }
        />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
