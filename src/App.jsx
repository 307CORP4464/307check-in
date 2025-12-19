import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

// Build dock list
const docks = [
  ...Array.from({ length: 7 }, (_, i) => i + 1),
  ...Array.from({ length: 21 }, (_, i) => i + 15),
  ...Array.from({ length: 11 }, (_, i) => i + 49),
  ...Array.from({ length: 7 }, (_, i) => i + 64),
];

export default function App() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // docks
  const [dockStatus, setDockStatus] = useState({});
  const [claimedBy, setClaimedBy] = useState({});

  // INITIAL LOAD
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);

      if (data.session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.session.user.id)
          .single();

        setRole(profile?.role ?? null);
      }

      setLoading(false);
    };

    init();

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

  // LOAD DOCKS FOR CSR
  useEffect(() => {
    if (role !== "csr") return;

    const loadDocks = async () => {
      const { data } = await supabase
        .from("docks")
        .select("dock_number, status, claimed_by");

      const statusMap = {};
      const claimMap = {};

      data?.forEach((d) => {
        statusMap[d.dock_number] = d.status;
        claimMap[d.dock_number] = d.claimed_by;
      });

      setDockStatus(statusMap);
      setClaimedBy(claimMap);
    };

    loadDocks();
  }, [role]);

  // LOGIN
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

  // CYCLE DOCK STATUS + HISTORY
  const cycleStatus = async (dock) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) return;

    // lock enforcement
    if (claimedBy[dock] && claimedBy[dock] !== session.user.id) {
      alert("Dock already claimed by another CSR");
      return;
    }

    const order = ["available", "assigned", "loading"];
    const current = dockStatus[dock] || "available";
    const next = order[(order.indexOf(current) + 1) % order.length];

    // optimistic UI
    setDockStatus((prev) => ({ ...prev, [dock]: next }));
    setClaimedBy((prev) => ({ ...prev, [dock]: session.user.id }));

    // update docks table
    const { error: dockError } = await supabase
      .from("docks")
      .upsert({
        dock_number: dock,
        status: next,
        claimed_by: session.user.id,
      });

    if (dockError) {
      console.error(dockError);
      return;
    }

    // insert history
    const { error: historyError } = await supabase
      .from("dock_history")
      .insert({
        dock_number: dock,
        status: next,
        csr_id: session.user.id,
      });

    if (historyError) {
      console.error(historyError);
    }
  };

  const colorFor = (status) => {
    if (status === "available") return "#22c55e";
    if (status === "assigned") return "#eab308";
    return "#ef4444";
  };

  // LOADING
  if (loading) return <p style={{ padding: 40 }}>Loading…</p>;

  // LOGIN SCREEN
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

          <button style={{ width: "100%", padding: 10 }}>Login</button>
        </form>
      </div>
    );
  }

  // ADMIN
  if (role === "admin") {
    return (
      <div style={{ padding: 40 }}>
        <h1>Admin Dashboard</h1>
        <button onClick={handleLogout}>Log out</button>
        <p>Admins view reports & history in Supabase</p>
      </div>
    );
  }

  // CSR DASHBOARD
  if (role === "csr") {
    return (
      <div style={{ padding: 40 }}>
        <h1>CSR Dock Dashboard</h1>
        <button onClick={handleLogout}>Log out</button>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
            gap: 12,
            marginTop: 20,
          }}
        >
          {docks.map((dock) => (
            <div
              key={dock}
              onClick={() => cycleStatus(dock)}
              style={{
                padding: 16,
                borderRadius: 8,
                textAlign: "center",
                cursor: "pointer",
                background: colorFor(dockStatus[dock]),
                color: "white",
                fontWeight: "bold",
              }}
            >
              Dock {dock}
              <div style={{ fontSize: 12 }}>
                {dockStatus[dock] || "available"}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <p>Checking permissions…</p>;
}
