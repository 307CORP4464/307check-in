import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export default function App() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Auth + role load
  useEffect(() => {
    const loadSessionAndRole = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);

      if (data.session) {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.session.user.id)
          .single();

        if (!error) {
          setRole(profile.role);
        }
      }

      setLoading(false);
    };

    loadSessionAndRole();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setRole(null);

        if (session) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", session.user.id)
            .single();

          setRole(profile?.role ?? null);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) setError(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
  };

  if (loading) {
    return <p style={{ padding: 40 }}>Loading...</p>;
  }

  // NOT LOGGED IN
  if (!session) {
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

          <button type="submit" style={{ width: "100%", padding: 10 }}>
            Login
          </button>
        </form>
      </div>
    );
  }

  // ADMIN VIEW
  if (role === "admin") {
    return (
      <div style={{ padding: 40 }}>
        <h1>CSR Dashboard</h1>
        <p>
          Logged in as <strong>{session.user.email}</strong> (Admin)
        </p>

        <button onClick={handleLogout}>Log out</button>

        <hr style={{ margin: "20px 0" }} />

        <p>✅ Admin access confirmed</p>
        <p>Next: user management, dock control</p>
      </div>
    );
  }

  // CSR VIEW
  if (role === "csr") {
    return (
      <div style={{ padding: 40 }}>
        <h1>CSR Dashboard</h1>
        <p>
          Logged in as <strong>{session.user.email}</strong>
        </p>

        <button onClick={handleLogout}>Log out</button>

        <hr style={{ margin: "20px 0" }} />

        <p>🚚 CSR workspace loading...</p>
      </div>
    );
  }

  // NO ROLE FOUND
  return (
    <div style={{ padding: 40 }}>
      <p>Access denied: no role assigned.</p>
      <button onClick={handleLogout}>Log out</button>
    </div>
  );
}
