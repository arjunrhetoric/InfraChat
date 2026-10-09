"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { OAuthButtons } from "../oauth-buttons";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const text = await res.text();
      let data: { message?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        setError(data.message ?? `Registration failed (HTTP ${res.status}).`);
        return;
      }
      const login = await signIn("credentials", { email, password, redirect: false });
      if (login?.error) {
        router.push("/login");
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
        <h2>Create account</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "2px 0 18px" }}>First user becomes SuperAdmin automatically.</p>
        <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
          <input className="ic-input" placeholder="Username (3–30 chars)" value={username} onChange={(e) => setUsername(e.target.value)} required suppressHydrationWarning autoComplete="username" />
          <input className="ic-input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required suppressHydrationWarning autoComplete="email" />
          <input className="ic-input" placeholder="Password (min 6)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required suppressHydrationWarning autoComplete="new-password" />
          <button className="ic-btn primary" style={{ width: "100%", marginTop: 4 }} type="submit" disabled={busy} suppressHydrationWarning>
            {busy ? "Creating…" : "Register"}
          </button>
        </form>
        {error && <p className="ic-error" style={{ marginTop: 12 }}>{error}</p>}
        <OAuthButtons />
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 16 }}>
          Have an account? <a href="/login" style={{ color: "var(--accent)" }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
