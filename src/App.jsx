import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

/* ---------- DOCK LIST ---------- */
const docks = [
  ...Array.from({ length: 7 }, (_, i) => i + 1),
  ...Array.from({ length: 21 }, (_, i) => i + 15),
  ...Array.from({ length: 11 }, (_, i) => i + 49),
  ...Array.from({ length: 7 }, (_, i) => i + 64),
];

export default function App() {
  const isDriverCheckin = window.location.pathname === "/check-in";

  /* ---------- DRIVER CHECK-IN PAGE ---------- */
  if (isDriverCheckin) {
    return <DriverCheckIn />;
  }

  return <InternalApp />;
}

/* ========================================================= */
/* ================== DRIVER CHECK-IN ====================== */
/* ========================================================= */

function DriverCheckIn() {
  const [pickup, setPickup] = useState("");
  const [trailer, setTrailer] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    if (!pickup || !phone) {
      setMsg("Pickup number and phone are required.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("driver_checkins").insert({
      pickup_number: pickup,
      trailer_length: trailer,
      phone,
      city,
      state,
      status: "waiting",
    });

    if (error) {
      setMsg(error.message);
    } else {
      setMsg("✅ Check-in successful. Please wait for a dock assignment.");
      setPickup("");
      setTrailer("");
      setPhone("");
      setCity("");
      setState("");
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: 40, maxWidth: 420, margin: "auto" }}>
      <h1>Driver Check-In</h1>

      <form onSubmit={submit}>
        <input
          placeholder="Pickup Number"
          value={pickup}
          onChange={e => setPickup(e.target.value)}
          required
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <input
          placeholder="Trailer Length (ft)"
          type="number"
          value={trailer}
          onChange={e => setTrailer(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <input
          placeholder="Phone Number"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          required
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <input
          placeholder="City of Delivery"
          value={city}
          onChange={e => setCity(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <input
          placeholder="State"
          value={state}
          onChange={e => setState(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <button disabled={loading} style={{ width: "100%", padding: 10 }}>
          {loading ? "Submitting…" : "Check In"}
        </button>
      </form>

      {msg && <p style={{ marginTop: 15 }}>{msg}</p>}
    </div>
  );
}

/* ========================================================= */
/* ================= INTERNAL APP (CSR) ==================== */
/* ========================================================= */

function InternalApp() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [drivers, setDrivers] = useState([]);
  const [dockStatus, setDockStatus] = useState({});

  /* ---------- AUTH ---------- */
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
      async (_e, session) => {
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

  /* ---------- LOAD CSR DATA ---------- */
  useEffect(() => {
    if (role !== "csr") return;

    const loadData = async () => {
      const { data: driverData } = await supabase
        .from("driver_checkins")
        .select("*")
        .eq("status", "waiting")
        .order("created_at");

      setDrivers(driverData || []);

      const { data: dockData } = await supabase
        .from("docks")
        .select("dock_number, status");

      const mapped = {};
      dockData?.forEach(d => (mapped[d.dock_number] = d.status));
      setDockStatus(mapped);
    };

    loadData();
  }, [role]);

  const login = async e => {
    e.preventDefault();
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setError(error.message);
  };

  const assignDriver = async (driverId, dock) => {
    const { error } = await supabase.rpc("assign_driver_to_dock", {
      p_driver_id: driverId,
      p_dock_number: dock,
    });

    if (!error) {
      setDrivers(drivers.filter(d => d.id !== driverId));
      setDockStatus({ ...dockStatus, [dock]: "assigned" });
    } else {
      alert(error.message);
    }
  };

  if (loading) return <p style={{ padding: 40 }}>Loading…</p>;

  if (!session) {
    return (
      <div style={{ padding: 40, maxWidth: 400, margin: "auto" }}>
        <h1>307 Check-In</h1>
        <form onSubmit={login}>
          <input
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginBottom: 10 }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginBottom: 10 }}
          />
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button style={{ width: "100%", padding: 10 }}>Login</button>
        </form>
      </div>
    );
  }

  if (role !== "csr") return <p>Access denied</p>;

  return (
    <div style={{ padding: 40 }}>
      <h1>CSR Dashboard</h1>

      <h2>Waiting Drivers</h2>

      {drivers.map(driver => (
        <div key={driver.id} style={{ border: "1px solid #ddd", padding: 12 }}>
          <strong>Pickup:</strong> {driver.pickup_number}<br />
          <strong>Trailer:</strong> {driver.trailer_length} ft<br />
          <strong>Phone:</strong> {driver.phone}<br />
          <strong>Destination:</strong> {driver.city}, {driver.state}

          <div style={{ marginTop: 10 }}>
            {docks.map(dock => (
              <button
                key={dock}
                disabled={dockStatus[dock] !== "available"}
                onClick={() => assignDriver(driver.id, dock)}
                style={{
                  marginRight: 6,
                  marginBottom: 6,
                  background:
                    dockStatus[dock] === "available" ? "#22c55e" : "#aaa",
                  color: "white",
                  border: "none",
                  padding: "6px 10px",
                }}
              >
                Dock {dock}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
