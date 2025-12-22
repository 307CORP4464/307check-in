import { useEffect, useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabase";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);

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

        setRole(profile?.role || null);
      }

      setLoading(false);
    };

    init();

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) setRole(null);
    });
  }, []);

  if (loading) return <p style={{ padding: 40 }}>Loading…</p>;

  // Not logged in → redirect to login page (root)
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but no role
  if (!role) {
    return <p style={{ padding: 40 }}>Access denied</p>;
  }

  // Auth OK → render nested routes
  return <Outlet />;
}
