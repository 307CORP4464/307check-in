import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

/* ---------------- CONSTANTS ---------------- */

const TRAILER_LENGTHS = ["48", "53", "Box"];

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

export default function App() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  /* -------- LOGIN -------- */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  /* -------- DRIVER CHECK-IN -------- */
  const [pickupNumber, setPickupNumber] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [trailerLength, setTrailerLength] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [submitMsg, setSubmitMsg] = useState("");

  /* ---------------- AUTH ---------------- */

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

  /* ---------------- DRIVER SUBMIT ---------------- */

  const handleDriverSubmit = async (e) => {
    e.preventDefault();
    setSubmitMsg("");

    const { error } = await supabase.from("driver_checkins").insert({
      pickup_number: pickupNumber,
      carrier_name: carrierName,
      trailer_number: trailerNumber,
      trailer_length: trailerLength,
      delivery_city: deliveryCity,
      delivery_state: deliveryState,
      driver_name: driverName,
      driver_phone: driverPhone,
      status: "waiting",
    });

    if (error) {
      setSubmitMsg(error.message);
    } else {
      setSubmitMsg("✅ Check-in successful");
      setPickupNumber("");
      setCarrierName("");
      setTrailerNumber("");
      setTrailerLength("");
      setDeliveryCity("");
      setDeliveryState("");
      setDriverName("");
      setDriverPhone("");
    }
  };

  /* ---------------- UI ---------------- */

  if (loading) return <p style={{ padding: 40 }}>Loading…</p>;

  // LOGIN
  if (!session && window.location.pathname !== "/check-in") {
    return (
      <div style={{ padding: 40, maxWidth: 400, margin: "0 auto" }}>
        <h1>307 Check-In</h1>
        <h2>Login</h2>

        <form onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) setError(error.message);
        }}>
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

  /* ---------------- DRIVER CHECK-IN PAGE ---------------- */

  if (window.location.pathname === "/check-in") {
    return (
      <div style={{ padding: 40, maxWidth: 500, margin: "0 auto" }}>
        <h1>Driver Check-In</h1>

        <form onSubmit={handleDriverSubmit}>
          <input placeholder="Pick Up Number" value={pickupNumber} onChange={(e) => setPickupNumber(e.target.value)} required />
          <input placeholder="Carrier Name" value={carrierName} onChange={(e) => setCarrierName(e.target.value)} required />
          <input placeholder="Trailer Number" value={trailerNumber} onChange={(e) => setTrailerNumber(e.target.value)} required />

          <select value={trailerLength} onChange={(e) => setTrailerLength(e.target.value)} required>
            <option value="">Trailer Length</option>
            {TRAILER_LENGTHS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <input placeholder="Delivery City" value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} required />

          <select value={deliveryState} onChange={(e) => setDeliveryState(e.target.value)} required>
            <option value="">Delivery State</option>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <input placeholder="Driver Name" value={driverName} onChange={(e) => setDriverName(e.target.value)} required />
          <input placeholder="Driver Phone" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} required />

          <button style={{ marginTop: 10 }}>Submit Check-In</button>
        </form>

        {submitMsg && <p>{submitMsg}</p>}
      </div>
    );
  }

  return <p>Access denied</p>;
}
