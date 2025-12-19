import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

/* ------------------ DOCK LIST ------------------ */
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

  // CSR dock state
  const [dockStatus, setDockStatus] = useState({});

  // admin create CSR
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createMsg, setCreateMsg] = useState("");

  // admin history
  const [dockHistory, setDockHistory] = useState([]);

  /* ------------------ AUTH LOAD ------------------ */
  useEffect(() => {
    const load = async () => {
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

    load();

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

  /* ------------------ LOAD DOCKS (CSR) ------------------ */
  useEffect(() => {
    if (role !== "csr") return;

    const loadDocks = async () => {
      const { data } = await supabase
        .from("docks")
        .select("dock_number, status");

      const mapped = {};
      data?.forEach((d) => {
        mapped[d.dock_number] = d.status;
      });

      setDockStatus(mapped);
    };

    loadDocks();
  }, [role]);

  /* ------------------ LOAD HISTORY (ADMIN) ------------------ */
  useEffect(() => {
    if (role !== "admin") return;

    const loadHistory = async () => {
      const { data } = await supabase
        .from("dock_history")
        .select(`
          id,
          dock_number,
          status,
          created_at,
          profiles ( email )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      setDockHistory(data || []);
    };

    loadHistory();
  }, [role]);

  /* ------------------ REALTIME: DOCKS ------------------ */
  useEffect(() => {
    if (role !== "csr") return;

    const channel = supabase
      .channel("realtime-docks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "docks" },
        (payload) => {
          const row = payload.new;
          setDockStatus((prev) => ({
            ...prev,
            [row.dock_number]: row.status,
          }));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [role]);

  /* ------------------ REALTIME: HISTORY ------------------ */
  useEffect(() => {
    if (role !== "admin") return;

    const channel = supabase
      .channel("realtime-history")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dock_history" },
        (payload) => {
          setDockHistory((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [role]);

  /* ------------------ ACTIONS ------------------ */
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

  const handleCreateCSR = async (e) => {
    e.preventDefault();
    setCreateMsg("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-service`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: "csr",
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      setCreateMsg(data.error || "Failed to create user");
    } else {
      setCreateMsg("✅ CSR user created");
      setNewEmail("");
      setNewPassword("");
    }
  };

  const cycleStatus = async (dock) => {
    const order = ["available", "assigned", "loading"];
    const current = dockStatus[dock] || "available";
    const next = order[(order.indexOf(current) + 1) % order.length];

    setDockStatus((prev) => ({ ...prev, [dock]: next }));

    await supabase.from("docks").upsert({
      dock_number: dock,
      status: next,
    });

    await supabase.from("dock_history").insert({
      dock_number: dock,
      status: next,
    });
  };

  const colorFor = (status) => {
    if (status === "available") return "#22c55e";
    if (status === "assigned") return "#eab308";
    return "#ef4444";
  };

  /* ------------------ UI ------------------ */
  if (loading) return <p style={{ padding: 40 }}>Loading...</p>;

  if (!session) {
    return (
      <div style={{ padding: 40, maxWidth: 400, margin: "0 auto" }}>
        <h1>307 Check-In</h1>
        <form onSubmit={handleLogin}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button>Login</button>
        </form>
      </div>
    );
  }

  if (role === "admin") {
    return (
      <div style={{ padding: 40 }}>
        <h1>Admin Dashboard</h1>
        <button onClick={handleLogout}>Logout</button>

        <h2>Create CSR</h2>
        <form onSubmit={handleCreateCSR}>
          <input placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
          <input placeholder="Temp Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          <button>Create</button>
        </form>
        <p>{createMsg}</p>

        <h2>Dock History</h2>
        <ul>
          {dockHistory.map((h) => (
            <li key={h.id}>
              Dock {h.dock_number} → {h.status} ({new Date(h.created_at).toLocaleTimeString()})
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (role === "csr") {
    return (
      <div style={{ padding: 40 }}>
        <h1>CSR Dock Dashboard</h1>
        <button onClick={handleLogout}>Logout</button>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 12 }}>
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
              <div style={{ fontSize: 12 }}>{dockStatus[dock]}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <p>Access denied</p>;
}
