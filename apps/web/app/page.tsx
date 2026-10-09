import { auth } from "@/auth";
import { db } from "@/lib/db";
import { WorkspaceClient } from "./workspace-client";
import { CommandRunner, HeroPreview, LiveFeed, PaletteDemo, RevealRoot } from "./landing-client";

export const dynamic = "force-dynamic";

const TICKER = [
  "ROLE-GOVERNED",
  "REALTIME BY DEFAULT",
  "EVERY PRIVILEGED ACTION IS A COMMAND",
  "PERMISSION CHECKED SERVER-SIDE",
  "APPEND-ONLY AUDIT TRAIL",
  "KEYBOARD-FIRST",
];

function Landing() {
  return (
    <div className="bx-landing">
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <RevealRoot>
        <div className="bx-ticker" aria-hidden>
          <div className="bx-ticker-track">
            {[0, 1].map((k) => (
              <span key={k} style={{ display: "inline-flex" }}>
                {TICKER.map((t) => (
                  <span key={t}>/// {t}</span>
                ))}
              </span>
            ))}
          </div>
        </div>

        <nav className="bx-nav">
          <a className="bx-logo" href="/">
            <span className="bx-logo-mark">◈</span> INFRA<span style={{ color: "var(--muted)" }}>CHAT</span>
          </a>
          <div className="bx-nav-links">
            <a href="#commands">COMMANDS</a>
            <a href="#realtime">REALTIME</a>
            <a href="#palette">PALETTE</a>
            <a href="#authority">AUTHORITY</a>
            <a href="#audit">AUDIT</a>
          </div>
          <div className="bx-nav-right">
            <span className="bx-mono" style={{ fontSize: 11, color: "var(--faint)" }}>v2.0 // BUILD 4821</span>
            <a className="bx-btn ghostb" href="/login">Sign in</a>
            <a className="bx-btn solid" href="/register">Create account →</a>
          </div>
        </nav>

        <header className="bx-hero">
          <div className="rv">
            <div className="bx-kicker"><i />ROLE-GOVERNED · REALTIME · AUDITED</div>
            <h1 className="bx-display">
              TALK LIKE
              <br />
              <span className="outline">A TEAM.</span>
              <br />
              OPERATE LIKE
              <br />
              <span className="lime">INFRA</span><span className="hot">.</span>
            </h1>
            <p className="bx-lede">
              InfraChat is the channel where your team talks <b>and</b> operates. Every
              privileged action runs as a <code>/command</code> — permission-checked
              server-side, executed instantly, and sealed into an <b>append-only audit trail</b>.
              Discord-grade density. Raycast-grade speed. GitHub-grade receipts.
            </p>
            <div className="bx-hero-cta">
              <a className="bx-btn solid" href="/register">Create account →</a>
              <a className="bx-btn" href="#commands">See it execute ↓</a>
            </div>
            <div className="bx-stats">
              <div className="bx-stat"><div className="v">12ms</div><div className="l">MEDIAN FANOUT</div></div>
              <div className="bx-stat"><div className="v">100%</div><div className="l">ACTIONS AUDITED</div></div>
              <div className="bx-stat"><div className="v">⌘K</div><div className="l">FULLY KEYBOARD-DRIVEN</div></div>
              <div className="bx-stat"><div className="v">03</div><div className="l">ROLES · REAL TEETH</div></div>
            </div>
            <p className="bx-hero-note">first user becomes <b>SUPERADMIN</b> · no credit card · no demo call · self-hostable</p>
          </div>
          <div className="rv" style={{ transitionDelay: "120ms" }}>
            <HeroPreview />
          </div>
        </header>

        <div className="bx-spec rv">
          <div className="bx-spec-row">
            <div className="bx-spec-cell"><div className="k">TRANSPORT</div><div className="v">WS <em>● live</em></div></div>
            <div className="bx-spec-cell"><div className="k">PERMISSIONS</div><div className="v">SERVER-CHECKED</div></div>
            <div className="bx-spec-cell"><div className="k">AUDIT</div><div className="v">APPEND-<em>ONLY</em></div></div>
            <div className="bx-spec-cell"><div className="k">ROOMS</div><div className="v">PUBLIC / PRIVATE / <em>BROADCAST</em></div></div>
            <div className="bx-spec-cell"><div className="k">INPUT</div><div className="v"><em>/</em> + ⌘K FIRST</div></div>
          </div>
        </div>

        <section className="bx-sec" id="commands">
          <div className="bx-sec-head rv">
            <div className="bx-secnum">01</div>
            <h2>Type with intent.<br /><span className="lime">Watch it enforce.</span></h2>
          </div>
          <p className="bx-sec-sub rv">Press <code>/</code> anywhere. Autocomplete only suggests what your role can run — then the server verifies role, target hierarchy and cooldowns <b>before</b> anything executes. This terminal is live: it cycles real command shapes.</p>
          <div className="bx-2col" style={{ marginTop: 26 }}>
            <div className="bx-copy rv">
              <h3>/// WHY COMMANDS, NOT BUTTONS</h3>
              <p>Buttons can be faked. <b>Commands are adjudicated.</b> Every invocation carries actor, target, room and timestamp through one choke point — so moderation can&apos;t drift from interface to interface.</p>
              <div className="bx-steps">
                <div className="bx-step"><span className="sn">A</span><span><b>PERMISSION FILTERED</b><br />The composer never offers what the server would refuse.</span></div>
                <div className="bx-step"><span className="sn">B</span><span><b>SERVER ADJUDICATED</b><br />Role, hierarchy, cooldowns — checked atomically at execution.</span></div>
                <div className="bx-step"><span className="sn">C</span><span><b>SEALED AS EVIDENCE</b><br />Actor → target → room → timestamp. Expandable forever.</span></div>
              </div>
            </div>
            <div className="rv" style={{ transitionDelay: "120ms" }}><CommandRunner /></div>
          </div>
        </section>

        <section className="bx-sec" id="realtime">
          <div className="bx-sec-head rv">
            <div className="bx-secnum">02</div>
            <h2>Rooms that feel<br /><span className="lime">alive.</span></h2>
          </div>
          <p className="bx-sec-sub rv">Public, private and broadcast channels with presence, typing indicators and unread states — the Discord density your team already knows, wired to the same realtime fabric as commands. Feed below is simulating a live room.</p>
          <div className="bx-2col" style={{ marginTop: 26 }}>
            <div className="rv"><LiveFeed /></div>
            <div className="bx-copy rv" style={{ transitionDelay: "120ms" }}>
              <h3>/// THE FABRIC</h3>
              <p>One socket per client. Room channels, DM channels, presence channels — <b>unread badges accumulate in the background</b> and clear the instant you open the room.</p>
              <div className="bx-steps">
                <div className="bx-step"><span className="sn">◉</span><span><b>PRESENCE</b><br />Who&apos;s online, per room and globally. No polling.</span></div>
                <div className="bx-step"><span className="sn">≋</span><span><b>TYPING SIGNALS</b><br />Throttled, per-room, attributed to the human.</span></div>
                <div className="bx-step"><span className="sn">▣</span><span><b>BROADCAST ROOMS</b><br />Announcements only the privileged can write. Everyone reads.</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="bx-sec" id="palette">
          <div className="bx-sec-head rv">
            <div className="bx-secnum">03</div>
            <h2>Command palette.<br /><span className="lime">Raycast reflexes.</span></h2>
          </div>
          <p className="bx-sec-sub rv">Hit <code>⌘K</code> and drive the whole workspace without touching the mouse — rooms, people, privileged actions, audit. Try it: this demo is fully interactive, filter with <code>/</code>, <code>#</code>, <code>@</code>.</p>
          <div className="bx-2col" style={{ marginTop: 26 }}>
            <div className="bx-copy rv">
              <h3>/// KEYBOARD CONTRACT</h3>
              <p><b>Every pointer action has a key path.</b> Palette, slash-complete, shortcuts overlay — operating the workspace mouse-free isn&apos;t a feature, it&apos;s the default posture.</p>
              <div className="bx-steps">
                <div className="bx-step"><span className="sn">⌘K</span><span><b>LAUNCHER</b><br />Rooms, people, actions, navigation. Detail pane included.</span></div>
                <div className="bx-step"><span className="sn">/</span><span><b>SLASH-COMPLETE</b><br />Inline command completion, permission-filtered per role.</span></div>
                <div className="bx-step"><span className="sn">?</span><span><b>SHORTCUTS</b><br />Discoverable keymap. Nothing hidden behind hover.</span></div>
              </div>
            </div>
            <div className="rv" style={{ transitionDelay: "120ms" }}><PaletteDemo /></div>
          </div>
        </section>

        <section className="bx-sec" id="authority">
          <div className="bx-sec-head rv">
            <div className="bx-secnum">04</div>
            <h2>Authority with<br /><span className="lime">teeth.</span></h2>
          </div>
          <p className="bx-sec-sub rv">Three roles. The UI never offers an action the server would refuse — and the matrix below is the actual enforcement shape, not marketing copy.</p>
          <div className="bx-bento" style={{ marginTop: 26 }}>
            <div className="bx-cell bx-c4 rv"><div className="idx">RT /// 01</div><h3>Broadcast rooms</h3><p>Leadership-grade channels where only the privileged write. Announcements pin to the top with attribution.</p><div className="foot">STATE → <b>PINNED 1/3 · #PRODUCTION</b></div></div>
            <div className="bx-cell bx-c4 rv" style={{ transitionDelay: "80ms" }}><div className="idx">RBAC /// 02</div><h3>Roles that matter</h3><p>Member, Moderator, SuperAdmin. Hierarchy is enforced on every target — you can&apos;t touch your equals, let alone your betters.</p><div className="foot">DEFAULT → <b>MEMBER · PROMOTE VIA /ROLE</b></div></div>
            <div className="bx-cell bx-c4 rv solid" style={{ transitionDelay: "160ms" }}><div className="idx">DM /// 03</div><h3>Direct threads</h3><p>One-to-one messaging on the same realtime fabric — history, attachments, parity with rooms. Nothing second-class.</p><div className="foot">FABRIC → <b>SAME SOCKET · SAME SPEED</b></div></div>
            <div className="bx-cell bx-c6 rv"><div className="idx">PERMISSION MATRIX /// LIVE SHAPE</div>
              <div className="bx-matrix" style={{ marginTop: 14 }}>
                <table>
                  <thead><tr><th>ACTION</th><th>MEMBER</th><th>MODERATOR</th><th>SUPERADMIN</th></tr></thead>
                  <tbody>
                    <tr><td>/mute · /warn</td><td><span className="bx-no">— denied</span></td><td><span className="bx-yes">ALLOW</span></td><td><span className="bx-yes">ALLOW</span></td></tr>
                    <tr><td>/kick · /ban</td><td><span className="bx-no">— denied</span></td><td><span className="bx-no">— kick only</span></td><td><span className="bx-yes">ALLOW</span></td></tr>
                    <tr><td>/announce · /role</td><td><span className="bx-no">— denied</span></td><td><span className="bx-no">— denied</span></td><td><span className="bx-yes">ALLOW</span></td></tr>
                    <tr><td>broadcast write</td><td><span className="bx-no">— read-only</span></td><td><span className="bx-yes">ALLOW</span></td><td><span className="bx-yes">ALLOW</span></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bx-cell bx-c6 rv hot" style={{ transitionDelay: "100ms" }}><div className="idx">MODERATION /// ZERO DRIFT</div><h3>Evicted instantly. Logged permanently.</h3><p>Kicks and bans propagate over the personal channel in milliseconds — the target&apos;s room list updates before they can blink, and the evidence is already sealed.</p><div className="foot" style={{ borderColor: "rgba(255,255,255,0.4)", color: "#fff" }}>PROPAGATION → <b style={{ color: "#fff" }}>PUSH · &lt;100MS</b></div></div>
          </div>
        </section>

        <section className="bx-sec" id="audit">
          <div className="bx-sec-head rv">
            <div className="bx-secnum">05</div>
            <h2>An audit log you<br /><span className="lime">can defend.</span></h2>
          </div>
          <p className="bx-sec-sub rv">Append-only, filterable, expandable to raw event detail — GitHub-grade credibility for every privileged act. Nothing disappears. Ever.</p>
          <div className="bx-audit rv" style={{ marginTop: 26 }}>
            <div className="bx-audit-row"><span>20:42:11</span><span className="ev">USER_MUTED</span><span>neha → rahul · #production · 10m</span><span className="hash">a3f9c201</span></div>
            <div className="bx-audit-row"><span>20:38:02</span><span className="ev">ANNOUNCEMENT_SET</span><span>neha · #production · deploy freeze</span><span className="hash">b71d4402</span></div>
            <div className="bx-audit-row"><span>20:31:47</span><span className="ev">USER_BANNED</span><span>system → spam_99 · flooding</span><span className="hash">c90e771a</span></div>
            <div className="bx-audit-row"><span>20:22:19</span><span className="ev">ROLE_CHANGED</span><span>arjun → neha · MEMBER → ADMIN</span><span className="hash">d4aa09f3</span></div>
            <div className="bx-audit-row"><span>20:15:33</span><span className="ev">ROOM_CREATED</span><span>arjun · #production · broadcast</span><span className="hash">e77b31c8</span></div>
          </div>
        </section>

        <section className="bx-close rv">
          <div className="bx-close-inner">
            <div className="bx-mono" style={{ fontWeight: 800, letterSpacing: "0.16em", fontSize: 12, marginBottom: 16 }}>/// FINAL TRANSMISSION</div>
            <h2>Run the team<br />like infrastructure.</h2>
            <p>FIRST USER BECOMES SUPERADMIN · NO CREDIT CARD · NO DEMO CALL</p>
            <div className="bx-close-cta">
              <a className="bx-btn dark" href="/register">Create account →</a>
              <a className="bx-btn line" href="/login">Sign in</a>
            </div>
          </div>
        </section>
        <footer className="bx-footer">
          <div className="bx-footer-inner">
            <span><b style={{ color: "var(--accent)" }}>◈</b> INFRACHAT v2.0</span>
            <span>ROOMS / COMMANDS / AUDIT</span>
            <span className="r">BUILT FOR TEAMS THAT OPERATE ● ALL SYSTEMS NOMINAL</span>
          </div>
        </footer>
      </RevealRoot>
    </div>
  );
}

export default async function Home() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return <Landing />;

  const [rooms, users, me] = await Promise.all([
    db.room.findMany({
      where: { OR: [{ isPrivate: false }, { members: { some: { userId } } }] },
      include: {
        _count: { select: { members: true } },
        announcementBy: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.user.findMany({
      where: { isBanned: false },
      select: { id: true, username: true, role: true },
      orderBy: { username: "asc" },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true },
    }),
  ]);

  return <WorkspaceClient initialRooms={rooms} users={users} me={me!} />;
}
