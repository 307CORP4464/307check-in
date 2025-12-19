import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";

/* ---------- Dock List ---------- */
const docks = [
  ...Array.from({ length: 7 }, (_, i) => i + 1),
  ...Array.from({ length: 21 }, (_, i) => i + 15),
  ...Array.from({ length: 11 }, (_, i) => i + 49),
  ...Array.from({ length: 7 }, (_, i) => i + 64),
];

export default function App() {
  /* ---------- Auth ---------- */
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ---------- Login ---------- */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  /* ---------- Dock State ---------- */
  const [dockStatus, setDockStatus] = useState({});

  /* ---------- Admin Create CSR ---------- */
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createMsg, setCreateMsg] = useState("");

  /* ---------- Initial Load + Auth ---------- */
  useEffect(() => {
    const loadSession = async () => {
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

    loadSession();

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

  /* ---------- Load Docks for CSR ---------- */
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

  // ---------- REALTIME DOCK UPDATES ----------
const channelRef = useRef(null);

useEffect(() => {
  if (!session) return;

  channelRef.current = supabase
    .channel("realtime-docks")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "docks",
      },
      (payload) => {
        const { dock_number, status } = payload.new || {};
        if (!dock_number) return;

        setDockStatus((prev) => ({
          ...prev,
          [dock_number]: status,
        }));
      }
    )
    .subscribe();

  return () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
  };
}, [session]);

  /* ---------- Login ---------- */
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

  /* ---------- Admin Create CSR ---------- */
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

  /* ---------- SAFE Dock Status Change ---------- */
  const cycleStatus = async (dock) => {
    const order = ["available", "assigned", "loading"];
    const current = dockStatus[dock] || "available";
    const next = order[(order.indexOf(current) + 1) % order.length];

    // AVAILABLE → ASSIGNED must be atomic
    if (current === "available") {
      const { data } = await supabase.rpc("claim_dock", {
        p_dock: dock,
        p_status: next,
      });

      if (!data) {
        alert("❌ Dock already claimed by another CSR");
        return;
      }
    } else {
      await supabase
        .from("docks")
        .update({ status: next })
        .eq("dock_number", dock);

      await supabase.from("dock_history").insert({
        dock_number: dock,
        status: next,
      });
    }

    setDockStatus((prev) => ({ ...prev, [dock]: next }));
  };

  const colorFor = (status) => {
    if (status === "available") return "#22c55e";
    if (status === "assigned") return "#eab308";
    return "#ef4444";
  };

  /* ---------- UI ---------- */
  if (loading) return <p style={{ padding: 40 }}>Loading…</p>;

  /* ---------- LOGIN ---------- */
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

  /* ---------- ADMIN ---------- */
  if (role === "admin") {
    return (
      <div style={{ padding: 40 }}>
        <h1>CSR Dashboard (Admin)</h1>
        <button onClick={handleLogout}>Log out</button>

        <h2 style={{ marginTop: 20 }}>Create CSR User</h2>

        <form onSubmit={handleCreateCSR}>
          <input
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            style={{ padding: 8, marginBottom: 10 }}
          />
          <input
            placeholder="Temp Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            style={{ padding: 8, marginBottom: 10 }}
          />
          <button>Create CSR</button>
        </form>

        {createMsg && <p>{createMsg}</p>}
      </div>
    );
  }

  /* ---------- CSR ---------- */
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
              <div style={{ fontSize: 12 }}>{dockStatus[dock]}</div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 20 }}>
          Click a dock to cycle: Available → Assigned → Loading
        </p>
      </div>
    );
  }

  return <p>Access denied</p>;
}
