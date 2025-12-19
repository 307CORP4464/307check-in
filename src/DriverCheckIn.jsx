import { useState } from "react";
import { supabase } from "./lib/supabase";

/* ---------- PICKUP FORMATS ---------- */
const pickupFormats = {
  "Tate & Lyle": {
    regex: /^(2\d{6}|8\d{7}|44\d{8})$/,
    hint:
      "• 7 digits starting with 2\n• 8 digits starting with 8\n• OR 10 digits starting with 44",
  },
  Primient: {
    regex: /^(4\d{6}|8\d{7})$/,
    hint: "• 7 digits starting with 4\n• OR 8 digits starting with 8",
  },
  ADM: {
    regex: /^\d{6}$/,
    hint: "• 6 digits",
  },
  "Solutions Direct": {
    regex: /^TLNA-SO-00\d{6}$/,
    hint: "• Format: TLNA-SO-00XXXXXX",
  },
};

export default function DriverCheckIn() {
  const [customer, setCustomer] = useState("");
  const [pickup, setPickup] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [trailerLength, setTrailerLength] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [driverName, setDriverName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const isValidPickup =
    customer &&
    pickupFormats[customer] &&
    pickupFormats[customer].regex.test(pickup);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");

    if (
      !customer ||
      !pickup ||
      !carrier ||
      !trailerNumber ||
      !trailerLength ||
      !city ||
      !state ||
      !driverName ||
      !phone
    ) {
      setMsg("❌ Please fill out all required fields.");
      return;
    }

    if (!isValidPickup) {
      setMsg("❌ Invalid pickup number format.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("driver_checkins").insert({
      customer,
      pickup_number: pickup,
      carrier_name: carrier,
      trailer_number: trailerNumber,
      trailer_length: Number(trailerLength),
      delivery_city: city,
      delivery_state: state,
      driver_name: driverName,
      driver_phone: phone,
      status: "waiting",
    });

    if (error) {
      setMsg(error.message);
    } else {
      setMsg("✅ Check-in successful. Please wait for dock assignment.");
      setCustomer("");
      setPickup("");
      setCarrier("");
      setTrailerNumber("");
      setTrailerLength("");
      setCity("");
      setState("");
      setDriverName("");
      setPhone("");
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: 40, maxWidth: 500, margin: "0 auto" }}>
      <h1>Driver Check-In</h1>

      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        {/* CUSTOMER */}
        <select
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          required
        >
          <option value="">Select Customer</option>
          {Object.keys(pickupFormats).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>

        {/* PICKUP NUMBER */}
        <div>
          <input
            placeholder="Pickup Number *"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            required
          />
          {customer && (
            <pre
              style={{
                fontSize: 12,
                color: isValidPickup ? "#555" : "#dc2626",
                whiteSpace: "pre-wrap",
                marginTop: 4,
              }}
            >
              {pickupFormats[customer].hint}
            </pre>
          )}
        </div>

        {/* CARRIER */}
        <input
          placeholder="Carrier Name *"
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          required
        />

        {/* TRAILER NUMBER */}
        <input
          placeholder="Trailer Number *"
          value={trailerNumber}
          onChange={(e) => setTrailerNumber(e.target.value)}
          required
        />

        {/* TRAILER LENGTH */}
        <select
          value={trailerLength}
          onChange={(e) => setTrailerLength(e.target.value)}
          required
        >
          <option value="">Trailer Length *</option>
          <option value="20">20'</option>
          <option value="40">40'</option>
        </select>

        {/* DELIVERY */}
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

        {/* DRIVER */}
        <input
          placeholder="Driver Name *"
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          required
        />
        <input
          placeholder="Driver Phone Number *"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />

        <button disabled={loading}>
          {loading ? "Submitting…" : "Check In"}
        </button>
      </form>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
