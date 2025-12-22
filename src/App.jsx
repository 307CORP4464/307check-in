import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabase";

/* ------------------------
   SIMPLE PAGE COMPONENTS
-------------------------*/

function Loading() {
  return <p style={{ padding: 40 }}>Loading app…</p>;
}

function ErrorPage({ message }) {
  return (
    <div style={{ padding: 40 }}>
      <h2>Error</h2>
      <pre>{message}</pre>
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
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
    <div style={{ padding: 40, maxWidth: 400 }}>
      <h1>307 Check-In</h1>
      <form onSubmit={submit}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", marginBottom: 10, padding: 8 }}
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
      <p>Driver form will live here.</p>
    </div>
  );
}

function CSRDashboard() {
  return (
    <div style={{ padding: 40 }}>
      <h1>CSR Dashboard</h1>
      <button onClick={() => supabase.auth.signOut()}>Log out</button>
    </div>
  );
}

function AdminDashboard() {
  return (
    <div style={{ padding: 40 }}>
      <h1>Admin Dashboard</h1>
      <button onClick={() => supabase.auth.signOut()}>Log out</button>
    </div>
  );
}

/* ------------------------
   MAIN APP
-------------------------*/

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [error, setError] = useState(null);

  // Initial auth load
  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        setSession(data.session);

        if (data.session) {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", data.session.user.id)
            .single();

          if (profileError) throw profileError;

          setRole(profile.role);
        }
      } catch (err) {
        console.error("AUTH ERROR:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    load();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setRole(null);

        if (!session) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        setRole(profile?.role ?? null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorPage message={error} />;

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/check-in" element={<DriverCheckIn />} />

        {/* Root */}
        <Route
          path="/"
          element={
            !session ? (
              <Login onLogin={() => location.reload()} />
            ) : role === "admin" ? (
              <Navigate to="/admin" />
            ) : role === "csr" ? (
              <Navigate to="/csr-dashboard" />
            ) : (
              <p>Access denied</p>
            )
          }
        />

        {/* CSR */}
        <Route
          path="/csr-dashboard"
          element={
            !session ? (
              <Navigate to="/" />
            ) : role === "csr" || role === "admin" ? (
              <CSRDashboard />
            ) : (
              <p>Access denied</p>
            )
          }
        />

        {/* Admin */}
        <Route
          path="/admin"
          element={
            !session ? (
              <Navigate to="/" />
            ) : role === "admin" ? (
              <AdminDashboard />
            ) : (
              <p>Access denied</p>
            )
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
