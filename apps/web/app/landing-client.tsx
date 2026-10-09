"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

/* Scroll reveal: adds .in when visible. Stagger via style transitionDelay. */
export function useRevealRoot() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.classList.add("js");
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll(".rv");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

const CMDS = [
  { cmd: "/mute @rahul 10m", checks: ["permission verified — MODERATOR", "target resolved — @rahul (member)", "cooldown ok · no prior mute in 60s"], done: "USER_MUTED · evt a3f9c201 → audit" },
  { cmd: "/announce #production deploy at 21:00 UTC", checks: ["permission verified — ADMIN", "room resolved — #production (broadcast)", "pin slot free · 1/3 used"], done: "ANNOUNCEMENT_SET · evt b71d4402 → audit" },
  { cmd: "/ban @spam_99 --reason flooding", checks: ["permission verified — SUPERADMIN", "hierarchy ok — target role MEMBER", "sessions revoked · 2 tokens"], done: "USER_BANNED · evt c90e771a → audit" },
];

export function CommandRunner() {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState(0); // 0 typing, 1 checks, 2 done
  const [run, setRun] = useState(0);
  const c = CMDS[idx];
  useEffect(() => {
    setTyped(0);
    setPhase(0);
    const t1 = setInterval(() => {
      setTyped((t) => {
        if (t >= c.cmd.length) {
          clearInterval(t1);
          setTimeout(() => setPhase(1), 350);
          return t;
        }
        return t + 1;
      });
    }, 34);
    return () => clearInterval(t1);
  }, [idx, run, c.cmd.length]);
  useEffect(() => {
    if (phase !== 1) return;
    const t = setTimeout(() => setPhase(2), 900 + c.checks.length * 380);
    return () => clearTimeout(t);
  }, [phase, c.checks.length]);
  useEffect(() => {
    if (phase !== 2) return;
    const t = setTimeout(() => {
      setIdx((i) => (i + 1) % CMDS.length);
      setRun((r) => r + 1);
    }, 2600);
    return () => clearTimeout(t);
  }, [phase]);
  return (
    <div className="bx-term" aria-live="polite">
      <div className="bx-term-bar">
        <span className="bx-term-dots"><i /><i /><i /></span>
        <span className="bx-mono">infrachat — command bus · live</span>
        <span className="bx-live"><i />EXEC</span>
      </div>
      <div className="bx-term-body">
        <div className="bx-term-tabs">
          {CMDS.map((x, i) => (
            <button key={x.cmd} className={i === idx ? "on" : ""} suppressHydrationWarning onClick={() => { setIdx(i); setRun((r) => r + 1); }}>
              {String(i + 1).padStart(2, "0")} · {x.cmd.split(" ")[0]}
            </button>
          ))}
        </div>
        <div className="bx-term-line prompt">
          <span className="p">#production</span> {c.cmd.slice(0, typed)}
          <span className="caret" />
        </div>
        {phase >= 1 && (
          <div className="bx-term-checks">
            {c.checks.map((ch, i) => (
              <CheckRow key={ch} text={ch} index={i} visible={phase >= 1} />
            ))}
          </div>
        )}
        {phase >= 2 && <div className="bx-term-done">✓ {c.done}</div>}
      </div>
    </div>
  );
}

function CheckRow({ text, index, visible }: { text: string; index: number; visible: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setShow(true), 250 + index * 380);
    return () => clearTimeout(t);
  }, [visible, index]);
  if (!show) return null;
  return <div className="bx-term-check"><b>✓</b> {text}</div>;
}

const FEED = [
  { u: "arjun", r: "MOD", t: "canary is green — promoting to prod in 5", time: "20:41" },
  { u: "neha", r: "ADMIN", t: "holding deploys until incident #482 closes", time: "20:42" },
  { u: "rohan", r: "", t: "error rate flat at 0.02% — rollout at 100%", time: "20:43" },
  { u: "ops-bot", r: "SYS", t: "audit checkpoint sealed · 1,204 events · merkle ok", time: "20:44" },
  { u: "rahul", r: "", t: "watching dashboards from the edge pop", time: "20:45" },
];

export function LiveFeed() {
  const [n, setN] = useState(3);
  const [typing, setTyping] = useState("neha");
  useEffect(() => {
    const t = setInterval(() => {
      setN((v) => (v >= FEED.length + 6 ? 3 : v + 1));
    }, 2200);
    const t2 = setInterval(() => {
      setTyping((v) => (v === "neha" ? "rohan" : v === "rohan" ? "arjun" : "neha"));
    }, 3600);
    return () => { clearInterval(t); clearInterval(t2); };
  }, []);
  const rows = useMemo(() => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(FEED[i % FEED.length]);
    return out;
  }, [n]);
  return (
    <div className="bx-feed">
      <div className="bx-feed-head">
        <span className="bx-hash">#</span> production
        <span className="bx-tag">BROADCAST</span>
        <span className="bx-feed-count bx-mono">{24 + (n % 3)} online</span>
      </div>
      <div className="bx-feed-list">
        {rows.slice(-5).map((m, i) => (
          <div className="bx-feed-row" key={`${m.u}-${i}`} style={{ animationDelay: `${i * 60}ms` }}>
            <span className={`bx-av a${(m.u.length + i) % 4}`}>{m.u.slice(0, 2).toUpperCase()}</span>
            <div>
              <div className="bx-feed-meta"><strong>{m.u}</strong>{m.r && <span className="bx-mini">{m.r}</span>}<span className="bx-mono t">{m.time}</span></div>
              <div className="bx-feed-text">{m.t}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="bx-feed-typing"><span className="dots"><i /><i /><i /></span>{typing} is typing…</div>
    </div>
  );
}

const PALETTE_ITEMS = [
  { k: "/", label: "/mute @user <mins>", sub: "moderation · MOD+", cat: "COMMAND" },
  { k: "/", label: "/ban @user --reason", sub: "moderation · SUPERADMIN", cat: "COMMAND" },
  { k: "/", label: "/announce #room <text>", sub: "broadcast · ADMIN+", cat: "COMMAND" },
  { k: "#", label: "# production", sub: "room · 24 members · broadcast", cat: "ROOM" },
  { k: "#", label: "# engineering", sub: "room · 41 members · public", cat: "ROOM" },
  { k: "@", label: "@ neha", sub: "person · ADMIN · online", cat: "PERSON" },
  { k: "@", label: "@ rohan", sub: "person · MEMBER · online", cat: "PERSON" },
  { k: "»", label: "Open audit log", sub: "jump · LOG", cat: "GO TO" },
];

export function PaletteDemo() {
  const [q, setQ] = useState("/");
  const [sel, setSel] = useState(0);
  const items = PALETTE_ITEMS.filter((p) => (p.label + p.sub).toLowerCase().includes(q.toLowerCase()));
  useEffect(() => setSel(0), [q]);
  return (
    <div className="bx-pal">
      <div className="bx-pal-input"><span>⌘K</span><input value={q} suppressHydrationWarning onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, items.length - 1)); if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0)); }} placeholder="Type a command, room, or person…" aria-label="Command palette demo" /></div>
      <div className="bx-pal-list">
        {items.length === 0 && <div className="bx-pal-empty bx-mono">no matches — try “/”, “#”, “@”</div>}
        {items.map((p, i) => (
          <button key={p.label} className={`bx-pal-item${i === sel ? " sel" : ""}`} suppressHydrationWarning onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}>
            <span className="bx-pal-k">{p.k}</span>
            <span className="bx-pal-main"><span className="l">{p.label}</span><span className="s bx-mono">{p.sub}</span></span>
            <span className="bx-pal-cat">{p.cat}</span>
          </button>
        ))}
      </div>
      <div className="bx-pal-foot bx-mono"><span><b>↑↓</b> move</span><span><b>↵</b> run</span><span><b>esc</b> dismiss</span><span className="r">{items.length} results · permission-filtered</span></div>
    </div>
  );
}

export function RevealRoot({ children }: { children: ReactNode }) {
  const ref = useRevealRoot();
  return <div ref={ref}>{children}</div>;
}

export function HeroPreview() {
  return (
    <div className="bx-window" aria-label="InfraChat application preview">
      <div className="bx-window-bar">
        <span className="bx-wdots"><i /><i /><i /></span>
        <span className="bx-mono">infrachat — #production · a3f9c201</span>
        <span className="bx-live"><i />LIVE</span>
      </div>
      <div className="bx-window-grid">
        <div className="bx-wside">
          <div className="bx-wlabel">ROOMS</div>
          {["general", "engineering", "production", "alerts"].map((r) => (
            <div key={r} className={`bx-wchan${r === "production" ? " on" : ""}`}><span>#</span> {r}{r === "alerts" && <em>3</em>}</div>
          ))}
          <div className="bx-wlabel" style={{ marginTop: 14 }}>DIRECT</div>
          {[["arjun", 1], ["neha", 1], ["rahul", 0]].map(([u, on]) => (
            <div key={u as string} className="bx-wchan"><span className={`bx-dot${on ? " on" : ""}`} /> {u}</div>
          ))}
          <div className="bx-wsys bx-mono">ws · connected<br />shard eu-2 · 12ms</div>
        </div>
        <div className="bx-wmain">
          <div className="bx-wchanhead"><span className="bx-hash">#</span> production <span className="bx-tag">BROADCAST</span><span className="bx-mono r">24 members · pinned 1/3</span></div>
          <div className="bx-wmsg">
            <span className="bx-av a0">AR</span>
            <div><div className="bx-feed-meta"><strong>arjun</strong><span className="bx-mini">MOD</span><span className="bx-mono t">20:41</span></div>
            <div className="bx-feed-text">Deploy is green on canary. Promoting to prod in 5.</div></div>
          </div>
          <div className="bx-wmsg cmd">
            <span className="bx-av a1">NE</span>
            <div><div className="bx-feed-meta"><strong>neha</strong><span className="bx-mini hot">ADMIN</span><span className="bx-mono t">20:42</span></div>
            <div className="bx-wcmd">/mute @rahul 10m</div>
            <div className="bx-wsys-ok bx-mono">✓ permission verified — MODERATOR<br />✓ muted 10 min · evt → audit</div></div>
          </div>
          <div className="bx-wmsg">
            <span className="bx-av a2">RO</span>
            <div><div className="bx-feed-meta"><strong>rohan</strong><span className="bx-mono t">20:43</span></div>
            <div className="bx-feed-text">Rollout at 100%. Error rate flat — nice.</div></div>
          </div>
          <div className="bx-wcomposer">Message #production… <span>/</span></div>
        </div>
        <div className="bx-wrail">
          <div className="bx-wlabel">MEMBERS · 24</div>
          {["arjun · MOD", "neha · ADMIN", "rohan", "rahul · MUTED"].map((m) => (
            <div key={m} className="bx-wchan small">{m}</div>
          ))}
          <div className="bx-waudit bx-mono"><span>AUDIT · LIVE</span>20:42 USER_MUTED<br />neha → rahul<br />#production</div>
        </div>
      </div>
    </div>
  );
}
