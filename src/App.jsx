import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { supabase } from "./lib/supabase";

/* ----------------------------------
   AUTH HOOK
---------------------------------- */
function useAuth() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);

      if (data.session) {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.session.user.id)
          .single();

        if (!error) setRole(profile?.role ?? null);
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

  return { session, role, loading };
}

/* ----------------------------------
   LOGIN PAGE
---------------------------------- */
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
    <div style={{ padding: 40, maxWidth: 400, margin: "0 auto" }}>
      <h1>307 Check-In</h1>
      <h2>CSR Login</h2>

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

        <button style={{ width: "100%", padding: 10 }}>
          Login
        </button>
      </form>
    </div>
  );
}

/* ----------------------------------
   PROTECTED CSR ROUTE
---------------------------------- */
function CSRRoute({ children }) {
  const { session, role, loading } = useAuth();

  if (loading) return <p style={{ padding: 40 }}>Loading…</p>;

  if (!session) return <Navigate to="/" replace />;

  if (role !== "csr" && role !== "admin")
    return <p style={{ padding: 40 }}>Access denied</p>;

  return children;
}

/* ----------------------------------
   CSR DASHBOARD
---------------------------------- */
function CSRDashboard() {
  const [drivers, setDrivers] = useState([]);
  const [appointmentTime, setAppointmentTime] = useState("");

  useEffect(() => {
    const loadDrivers = async () => {
      const { data } = await supabase
        .from("driver_checkins")
        .select("*")
        .eq("status", "waiting")
        .order("created_at");

      setDrivers(data || []);
    };

    loadDrivers();
  }, []);

  const assignDock = async (driverId, dockNumber) => {
    await supabase
      .from("driver_checkins")
      .update({
        status: "assigned",
        dock_number: dockNumber,
        appointment_time: appointmentTime,
      })
      .eq("id", driverId);

    setDrivers(drivers.filter((d) => d.id !== driverId));
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>CSR Dashboard</h1>

      <label>Appointment Time:</label>
      <input
        type="time"
        value={appointmentTime}
        onChange={(e) => setAppointmentTime(e.target.value)}
        style={{ marginLeft: 10 }}
      />

      <h2 style={{ marginTop: 30 }}>Waiting Drivers</h2>

      {drivers.length === 0 && <p>No drivers waiting</p>}

      {drivers.map((d) => (
        <div
          key={d.id}
          style={{
            border: "1px solid #ccc",
            padding: 10,
            marginBottom: 10,
          }}
        >
          <strong>{d.driver_name}</strong> — {d.pickup_number}
          <br />
          {d.carrier_name} | {d.trailer_length} ft
          <br />

          <button onClick={() => assignDock(d.id, 1)}>
            Assign Dock 1
          </button>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------
   DRIVER CHECK-IN (PUBLIC)
---------------------------------- */
function DriverCheckIn() {
  const [form, setForm] = useState({
    pickup_number: "",
    carrier_name: "",
    trailer_number: "",
    trailer_length: "53",
    city: "",
    state: "",
    driver_name: "",
    driver_phone: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!/^[A-Z0-9]{5,}$/.test(form.pickup_number)) {
      alert("Invalid pickup number");
      return;
    }

    await supabase.from("driver_checkins").insert({
      ...form,
      status: "waiting",
    });

    alert("Checked in successfully");
    setForm({
      pickup_number: "",
      carrier_name: "",
      trailer_number: "",
      trailer_length: "53",
      city: "",
      state: "",
      driver_name: "",
      driver_phone: "",
    });
  };

  return (
    <div style={{ padding: 40, maxWidth: 500, margin: "0 auto" }}>
      <h1>Driver Check-In</h1>

      <form onSubmit={handleSubmit}>
        {Object.entries(form).map(([key, value]) => (
          <input
            key={key}
            placeholder={key.replace("_", " ")}
            value={value}
            onChange={(e) =>
              setForm({ ...form, [key]: e.target.value })
            }
            required
            style={{ width: "100%", padding: 8, marginBottom: 10 }}
          />
        ))}

        <button style={{ width: "100%", padding: 10 }}>
          Check In
        </button>
      </form>
    </div>
  );
}

/* ----------------------------------
   APP ROOT
---------------------------------- */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/csr"
          element={
            <CSRRoute>
              <CSRDashboard />
            </CSRRoute>
          }
        />
        <Route path="/check-in" element={<DriverCheckIn />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
