"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { OAuthButtons } from "../oauth-buttons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setError(res.error === "CredentialsSignin" ? "Invalid email or password." : res.error);
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ic-auth-wrap">
      <div className="ic-auth-card">
        <div className="ic-brand" style={{ marginBottom: 18 }}><span className="ic-brand-mark">◈</span> INFRA<span style={{ color: "var(--muted)", fontWeight: 600 }}>CHAT</span></div>
        <h2>Sign in</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "2px 0 18px" }}>Real-time communication with authority built in.</p>
        <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
          <input className="ic-input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required suppressHydrationWarning autoComplete="email" />
          <input className="ic-input" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required suppressHydrationWarning autoComplete="current-password" />
          <button className="ic-btn primary" style={{ width: "100%", marginTop: 4 }} type="submit" disabled={busy} suppressHydrationWarning>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {error && <p className="ic-error" style={{ marginTop: 12 }}>{error}</p>}
        <OAuthButtons />
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 16 }}>
          No account? <a href="/register" style={{ color: "var(--accent)" }}>Register</a>
        </p>
      </div>
    </div>
  );
}
