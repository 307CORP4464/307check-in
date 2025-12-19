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

  // Login
  const [email, setEmail] = useState("");  // Correctly initialized email
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Dock status (CSR)
  const [dockStatus, setDockStatus] = useState({});
  const [driverQueue, setDriverQueue] = useState([]);

  // Admin create CSR
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createMsg, setCreateMsg] = useState("");

  // Driver check-in fields
  const [pickupNumber, setPickupNumber] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [trailerLength, setTrailerLength] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");

  // INITIAL LOAD + AUTH STATE
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

  // 🔴 IMPORTANT FIX: LOAD DOCKS WHEN CSR ROLE IS SET
  useEffect(() => {
    if (role !== "csr") return;

    const loadDocks = async () => {
      const { data, error } = await supabase
        .from("docks")
        .select("dock_number, status");

      if (!error && data) {
        const mapped = {};
        data.forEach((d) => {
          mapped[d.dock_number] = d.status;
        });
        setDockStatus(mapped);
      }
    };

    loadDocks();

    const loadDriverQueue = async () => {
      const { data, error } = await supabase
        .from("driver_checkins")
        .select("*")
        .eq("status", "waiting")
        .order("created_at", { ascending: true });

      if (!error && data) {
        setDriverQueue(data);
      }
    };

    loadDriverQueue();
  }, [role]);

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

    const { data: { session } } = await supabase.auth.getSession();

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

    // update UI immediately
    setDockStatus({ ...dockStatus, [dock]: next });

    // persist to Supabase
    await supabase.from("docks").upsert({
      dock_number: dock,
      status: next,
    });
  };

  const colorFor = (status) => {
    if (status === "available") return "#22c55e";
    if (status === "assigned") return "#eab308";
    return "#ef4444";
  };

  const handleDriverCheckIn = async (e) => {
    e.preventDefault();
    // Pick-up number validation
    if (!pickupNumber || !/^[A-Za-z0-9]+$/.test(pickupNumber)) {
      setError("Invalid Pickup Number. Please enter a valid pick-up number.");
      return;
    }

    const { data: { user } } = await supabase.auth.getSession();

    const { error } = await supabase
      .from("driver_checkins")
      .insert([
        {
          pickup_number: pickupNumber,
          carrier_name: carrierName,
          trailer_number: trailerNumber,
          trailer_length: trailerLength,
          city: city,
          state: state,
          driver_name: driverName,
          driver_phone: driverPhone,
          csr_id: user.id,
          status: "waiting", // Set to waiting initially
          appointment_time: new Date().toISOString(),
        },
      ]);

    if (error) {
      console.log("Error during driver check-in:", error.message);
    } else {
      console.log("Driver check-in successful!");
      // Clear the form fields after submission
      setPickupNumber("");
      setCarrierName("");
      setTrailerNumber("");
      setTrailerLength("");
      setCity("");
      setState("");
      setDriverName("");
      setDriverPhone("");
      setError(""); // Clear error message
    }
  };

  if (loading) return <p style={{ padding: 40 }}>Loading...</p>;

  // LOGIN
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

  // CSR
  if (role === "csr") {
    return (
      <div style={{ padding: 40 }}>
        <h1>CSR Dashboard</h1>
        <button onClick={handleLogout}>Log out</button>

        <h2 style={{ marginTop: 20 }}>Driver Check-In</h2>

        <form onSubmit={handleDriverCheckIn}>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <input
            type="text"
            placeholder="Pickup Number"
            value={pickupNumber}
            onChange={(e) => setPickupNumber(e.target.value)}
            required
            style={{ padding: 8, marginBottom: 10 }}
          />
          <input
            type="text"
            placeholder="Carrier Name"
            value={carrierName}
            onChange={(e) => setCarrierName(e.target.value)}
            required
            style={{ padding: 8, marginBottom: 10 }}
          />
          <input
            type="text"
            placeholder="Trailer Number"
            value={trailerNumber}
            onChange={(e) => setTrailerNumber(e.target.value)}
            required
            style={{ padding: 8, marginBottom: 10 }}
          />
          <select
            value={trailerLength}
            onChange={(e) => setTrailerLength(e.target.value)}
            required
            style={{ padding: 8, marginBottom: 10 }}
          >
            <option value="">Select Trailer Length</option>
            <option value="48">48</option>
            <option value="53">53</option>
            <option value="box">Box</option>
          </select>
          <input
            type="text"
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            style={{ padding: 8, marginBottom: 10 }}
          />
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            required
            style={{ padding: 8, marginBottom: 10 }}
          >
            <option value="">Select State</option>
            <option value="CA">CA</option>
            <option value="TX">TX</option>
            <option value="NY">NY</option>
          </select>
          <input
            type="text"
            placeholder="Driver Name"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            required
            style={{ padding: 8, marginBottom: 10 }}
          />
          <input
            type="text"
            placeholder="Driver Phone"
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
            required
            style={{ padding: 8, marginBottom: 10 }}
          />
          <button>Check-In Driver</button>
        </form>

        <h2 style={{ marginTop: 20 }}>Driver Queue</h2>
        <table style={{ width: "100%", marginTop: 20 }}>
          <thead>
            <tr>
              <th>Pickup Number</th>
              <th>Carrier Name</th>
              <th>Trailer Number</th>
              <th>Driver Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {driverQueue.map((driver) => (
              <tr key={driver.id}>
                <td>{driver.pickup_number}</td>
                <td>{driver.carrier_name}</td>
                <td>{driver.trailer_number}</td>
                <td>{driver.driver_name}</td>
                <td>{driver.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <p>Access denied</p>;
}
