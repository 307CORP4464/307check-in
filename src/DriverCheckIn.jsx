import { useState } from "react";
import { supabase } from "./lib/supabase";

export default function DriverCheckIn() {
  const [form, setForm] = useState({
    driver_name: "",
    company: "",
    pickup_number: "",
    trailer: "",
    trailer_length: "",
    phone: "",
    city: "",
    state: "",
  });

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const update = (key, value) =>
    setForm({ ...form, [key]: value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    const { error } = await supabase
      .from("driver_checkins")
      .insert({
        ...form,
        trailer_length: Number(form.trailer_length),
      });

    if (error) {
      setError(error.message);
    } else {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h1>✅ Checked In Successfully</h1>
        <p>Please wait for dock assignment.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, maxWidth: 450, margin: "0 auto" }}>
      <h1>Driver Check-In</h1>

      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="Driver Name"
          value={form.driver_name}
          onChange={(e) => update("driver_name", e.target.value)}
          required
        />

        <input
          placeholder="Company"
          value={form.company}
          onChange={(e) => update("company", e.target.value)}
          required
        />

        <input
          placeholder="Pickup Number"
          value={form.pickup_number}
          onChange={(e) => update("pickup_number", e.target.value)}
          required
        />

        <input
          placeholder="Trailer #"
          value={form.trailer}
          onChange={(e) => update("trailer", e.target.value)}
          required
        />

        <input
          type="number"
          placeholder="Trailer Length (ft)"
          value={form.trailer_length}
          onChange={(e) => update("trailer_length", e.target.value)}
          required
        />

        <input
          placeholder="Phone Number"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
          required
        />

        <input
          placeholder="City of Delivery"
          value={form.city}
          onChange={(e) => update("city", e.target.value)}
          required
        />

        <input
          placeholder="State of Delivery"
          value={form.state}
          onChange={(e) => update("state", e.target.value.toUpperCase())}
          maxLength={2}
          required
        />

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button style={{ marginTop: 10 }}>
          Check In
        </button>
      </form>
    </div>
  );
}
