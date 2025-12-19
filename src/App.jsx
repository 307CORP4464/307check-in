import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export default function App() {
  const [session, setSession] = useState(null);

  // Keep user logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>307 Check-In</h1>
      <p>Deployment successful 🎉</p>

      {session ? (
        <div>
          <p>
            Logged in as <strong>{session.user.email}</strong>
          </p>
        </div>
      ) : (
        <p>Not logged in</p>
      )}
    </div>
  );
}
