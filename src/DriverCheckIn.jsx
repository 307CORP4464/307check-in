import { useState } from "react";
import { supabase } from "./lib/supabase";

export default function DriverCheckIn() {
  const [pickup, setPickup] = useState("");
  const [trailer, setTrailer] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    if (!pickup || !phone || !city || !state) {
      setMsg("Please fill out all required fields.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("driver_checkins").insert({
      pickup_number: pickup,
      trailer_length: Number(trailer),
      phone,
      city,
      state,
      status: "waiting",
    });

    if (error) {
      setMsg(error.message);
    } else {
      setMsg("✅ You’re checked in! Please wait.");
      setPickup("");
      setTrailer("");
      setPhone("");
      setCity("");
      setState("");
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: 40, maxWidth: 500, margin: "0 auto" }}>
      <h1>Driver Check-In</h1>

      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="Pickup Number *"
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
          required
        />

        <input
          placeholder="Trailer Length (ft) *"
          type="number"
          value={trailer}
          onChange={(e) => setTrailer(e.target.value)}
          required
        />

        <input
          placeholder="Phone Number *"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />

        <input
          placeholder="Delivery City *"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required
        />

        <input
          placeholder="Delivery State *"
          value={state}
          onChange={(e) => setState(e.target.value)}
          required
        />

        <button disabled={loading} style={{ padding: 10 }}>
          {loading ? "Submitting…" : "Check In"}
        </button>
      </form>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
