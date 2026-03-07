import { useState } from "react";

const phases = [
  {
    id: "phase1",
    label: "Phase 1",
    title: "Launch with Supabase",
    subtitle: "0 → 20 users · Days to ship",
    color: "#00C896",
    icon: "🚀",
    duration: "Month 1–3",
    stack: "Stack B (Supabase + Figma Make)",
    services: [
      { name: "Figma Make", role: "Generate React frontend code", host: "Vercel (free)" },
      { name: "Supabase Auth", role: "Google OAuth — 1-click setup", host: "Supabase (free)" },
      { name: "Supabase PostgreSQL", role: "Database (500MB free)", host: "Supabase (free)" },
      { name: "Supabase Storage", role: "Files, early videos", host: "Supabase (free)" },
      { name: "Supabase Edge Fns", role: "Stripe webhook handler", host: "Supabase (free)" },
      { name: "Stripe", role: "Payments", host: "2.9% + 30¢" },
    ],
    cost: "~$0/mo",
    todo: [
      "Design screens in Figma",
      "Export React code via Figma Make",
      "Connect Supabase Auth (Google OAuth)",
      "Build DB schema in Supabase Studio",
      "Add Stripe for payments",
      "Deploy to Vercel",
      "Register Telegram Mini App",
    ],
    doNow: [
      "Write clean component structure in React — don't couple to Supabase SDK deeply",
      "Keep all Supabase calls in a /services/ folder only — not scattered in components",
      "Name your DB tables clearly — they'll migrate as-is to Railway",
      "Use standard SQL — avoid Supabase-specific functions where possible",
    ],
  },
  {
    id: "phase2",
    label: "Phase 2",
    title: "Parallel Migration",
    subtitle: "20 → 200 users · Build Go backend",
    color: "#FFB800",
    icon: "⚙️",
    duration: "Month 3–6",
    stack: "Both running simultaneously",
    services: [
      { name: "React frontend", role: "Same code, swap API calls", host: "Vercel (free)" },
      { name: "Go + Gin API", role: "New backend, built alongside", host: "Railway ($5/mo)" },
      { name: "PostgreSQL", role: "Export from Supabase → Railway", host: "Railway (included)" },
      { name: "Supabase Auth", role: "Still running during transition", host: "Supabase (free)" },
      { name: "Backblaze B2", role: "Move videos here from Supabase", host: "$0.006/GB" },
      { name: "Stripe", role: "Same — no change needed", host: "2.9% + 30¢" },
    ],
    cost: "~$5/mo",
    todo: [
      "Build Go backend endpoints one by one",
      "Export PostgreSQL from Supabase (pg_dump)",
      "Import into Railway PostgreSQL",
      "Move /services/ calls from Supabase SDK → your Go API",
      "Migrate files from Supabase Storage → Backblaze B2",
      "Switch auth from Supabase Auth → custom JWT (Go)",
      "Test thoroughly before turning off Supabase",
    ],
    doNow: [
      "Migrate route by route — not all at once",
      "Keep Supabase running as fallback during migration",
      "Use feature flags to switch between Supabase and Go API per endpoint",
      "Migrate users gradually — not all at once",
    ],
  },
  {
    id: "phase3",
    label: "Phase 3",
    title: "Full Stack A",
    subtitle: "200 → thousands of users",
    color: "#7B61FF",
    icon: "⚡",
    duration: "Month 6+",
    stack: "Stack A (Go + Railway + Backblaze)",
    services: [
      { name: "React frontend", role: "Same code from Phase 1", host: "Vercel (free)" },
      { name: "Go + Gin API", role: "Full backend, all routes", host: "Railway ($5/mo)" },
      { name: "PostgreSQL", role: "5GB, exportable anytime", host: "Railway (included)" },
      { name: "Custom JWT Auth", role: "Google OAuth, 30d sessions", host: "Go backend" },
      { name: "Backblaze B2 + CF", role: "Cheap video/file storage", host: "$0.006/GB" },
      { name: "Stripe", role: "Same — no change needed", host: "2.9% + 30¢" },
    ],
    cost: "~$5/mo",
    todo: [
      "Supabase fully turned off",
      "All auth via Go JWT",
      "All data in Railway PostgreSQL",
      "All files in Backblaze B2",
      "Add React Native for iOS/Android (same Go API)",
      "Add cron-based daily notification service",
      "Add admin panel for publishing content",
    ],
    doNow: [
      "Monitor Railway usage — scale up plan only when needed",
      "Add Redis for caching if traffic grows",
      "Add read replicas if DB becomes bottleneck",
      "Consider CDN for frontend if global traffic grows",
    ],
  },
];

const migrationSteps = [
  {
    title: "1. Export PostgreSQL from Supabase",
    color: "#00C896",
    code: `# One command — exports your entire database
pg_dump \\
  postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres \\
  > my_app_backup.sql`,
    note: "All your users, progress, content — everything in one file",
  },
  {
    title: "2. Import into Railway PostgreSQL",
    color: "#7B61FF",
    code: `# Import into Railway — same command, different URL
psql \\
  postgresql://postgres:[password]@[railway-host]:5432/railway \\
  < my_app_backup.sql`,
    note: "Tables, data, indexes — all preserved exactly",
  },
  {
    title: "3. Swap API calls in /services/ folder",
    color: "#FFB800",
    code: `// Before (Supabase SDK)
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId);

// After (your Go API — same result)
const data = await fetch('/api/user/me', {
  headers: { Authorization: \`Bearer \${jwt}\` }
}).then(r => r.json());`,
    note: "Only your /services/ folder changes — components stay untouched",
  },
  {
    title: "4. Migrate files to Backblaze B2",
    color: "#FF6B6B",
    code: `# Download from Supabase Storage
supabase storage cp supabase://bucket/videos ./videos

# Upload to Backblaze B2
b2 upload-file my-bucket ./videos videos/`,
    note: "Video URLs update in DB once migrated",
  },
  {
    title: "5. Switch auth from Supabase → Go JWT",
    color: "#00D4FF",
    code: `// Before: Supabase session
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// After: your JWT (stored same way)
const token = localStorage.getItem('jwt_token');
// JWT validated by Go middleware on every request`,
    note: "Users re-login once during the switch — transparent to them",
  },
];

const risks = [
  { risk: "Supabase SDK deeply embedded in components", mitigation: "Keep all SDK calls in /services/ only from day 1", severity: "high" },
  { risk: "Supabase-specific SQL functions used", mitigation: "Use standard PostgreSQL functions only", severity: "medium" },
  { risk: "Auth token format differences", mitigation: "Migrate users gradually, brief re-login required", severity: "low" },
  { risk: "File URL changes after storage migration", mitigation: "Update URLs in DB in one SQL UPDATE", severity: "low" },
  { risk: "Downtime during migration", mitigation: "Run both stacks in parallel, switch traffic gradually", severity: "medium" },
];

export default function MigrationPlan() {
  const [activeTab, setActiveTab] = useState("phases");
  const [activePhase, setActivePhase] = useState("phase1");
  const [expandedStep, setExpandedStep] = useState(null);

  const phase = phases.find(p => p.id === activePhase);

  return (
    <div style={{
      background: "#08080E",
      minHeight: "100vh",
      fontFamily: "'DM Mono','Courier New',monospace",
      color: "#E0E0E0",
      padding: "28px 20px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@500;600;700&display=swap');
        .tab-btn { cursor: pointer; transition: all 0.15s; }
        .row-h:hover { background: rgba(255,255,255,0.03); }
        pre { margin: 0; white-space: pre-wrap; }
        .step-card { cursor: pointer; transition: all 0.15s; }
        .step-card:hover { background: rgba(255,255,255,0.04) !important; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 22 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: "#555", marginBottom: 8 }}>MIGRATION ROADMAP</div>
        <div style={{ fontSize: 24, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: "#fff" }}>
          Stack B → Stack A
        </div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
          Start with Supabase · Migrate to Go + Railway when ready · Zero data loss
        </div>
      </div>

      {/* Timeline strip */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 28, gap: 0 }}>
        {phases.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div
              onClick={() => { setActivePhase(p.id); setActiveTab("phases"); }}
              style={{
                flex: 1, padding: "12px 14px",
                background: activePhase === p.id ? `${p.color}18` : "rgba(255,255,255,0.02)",
                border: `1px solid ${activePhase === p.id ? p.color + "50" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 8, cursor: "pointer", transition: "all 0.2s",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: p.color, letterSpacing: 2 }}>{p.label}</span>
                <span style={{ fontSize: 10, color: "#444" }}>{p.duration}</span>
              </div>
              <div style={{ fontSize: 12, color: "#fff", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>{p.title}</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{p.subtitle}</div>
              <div style={{ marginTop: 8, fontSize: 13, color: p.color, fontWeight: 600 }}>{p.cost}</div>
            </div>
            {i < phases.length - 1 && (
              <div style={{ padding: "0 8px", color: "#333", fontSize: 18 }}>→</div>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 22 }}>
        {["phases", "how to migrate", "risks"].map(tab => (
          <button key={tab} className="tab-btn"
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? "rgba(255,255,255,0.07)" : "transparent",
              border: `1px solid ${activeTab === tab ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.07)"}`,
              color: activeTab === tab ? "#fff" : "#555",
              padding: "6px 14px", borderRadius: 6,
              fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
            }}>
            {tab}
          </button>
        ))}
      </div>

      {/* PHASES TAB */}
      {activeTab === "phases" && phase && (
        <div>
          {/* Phase header */}
          <div style={{
            background: `${phase.color}0F`,
            border: `1px solid ${phase.color}30`,
            borderRadius: 10, padding: "18px 20px", marginBottom: 18,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{phase.icon}</div>
              <div style={{ fontSize: 18, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: "#fff" }}>
                {phase.title}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>{phase.stack}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, color: phase.color, fontWeight: 700 }}>{phase.cost}</div>
              <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>per month</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>{phase.duration}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Services */}
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#555", marginBottom: 10 }}>── SERVICES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {phase.services.map(s => (
                  <div key={s.name} className="row-h" style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "9px 12px", borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.02)",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#fff" }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>{s.role}</div>
                    </div>
                    <div style={{ fontSize: 10, color: phase.color, textAlign: "right", whiteSpace: "nowrap", marginLeft: 10 }}>
                      {s.host}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Checklist */}
              <div>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "#555", marginBottom: 10 }}>── WHAT TO BUILD</div>
                {phase.todo.map((t, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#888", padding: "4px 0", display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: phase.color, marginTop: 1 }}>□</span>{t}
                  </div>
                ))}
              </div>

              {/* Smart tips */}
              <div style={{
                background: "rgba(255,184,0,0.06)",
                border: "1px solid rgba(255,184,0,0.2)",
                borderRadius: 8, padding: 14,
              }}>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "#FFB800", marginBottom: 10 }}>── DO THIS NOW (for easy migration later)</div>
                {phase.doNow.map((t, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#999", padding: "4px 0", display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.5 }}>
                    <span style={{ color: "#FFB800", flexShrink: 0 }}>→</span>{t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HOW TO MIGRATE TAB */}
      {activeTab === "how to migrate" && (
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 20, lineHeight: 1.7 }}>
            Migration happens <span style={{ color: "#FFB800" }}>service by service</span> — not all at once.
            Both stacks run in parallel during transition. Users experience zero downtime.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {migrationSteps.map((step, i) => (
              <div key={i}
                className="step-card"
                onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                style={{
                  border: `1px solid ${expandedStep === i ? step.color + "40" : "rgba(255,255,255,0.08)"}`,
                  background: expandedStep === i ? `${step.color}08` : "rgba(255,255,255,0.02)",
                  borderRadius: 10, overflow: "hidden",
                }}>
                <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: `${step.color}20`, border: `1px solid ${step.color}40`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: step.color, flexShrink: 0,
                    }}>{i + 1}</div>
                    <span style={{ fontSize: 13, color: "#ddd", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>
                      {step.title}
                    </span>
                  </div>
                  <span style={{ color: "#444" }}>{expandedStep === i ? "▲" : "▼"}</span>
                </div>
                {expandedStep === i && (
                  <div style={{ padding: "0 18px 16px" }}>
                    <div style={{
                      background: "#0D0D18",
                      border: `1px solid ${step.color}20`,
                      borderRadius: 8, padding: 14, marginBottom: 10,
                    }}>
                      <pre style={{ fontSize: 11, color: "#aaa", lineHeight: 1.8 }}>{step.code}</pre>
                    </div>
                    <div style={{
                      fontSize: 11, color: "#777",
                      borderLeft: `2px solid ${step.color}50`,
                      paddingLeft: 10,
                    }}>
                      💡 {step.note}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 20,
            background: "rgba(0,200,150,0.05)",
            border: "1px solid rgba(0,200,150,0.2)",
            borderRadius: 10, padding: 16,
          }}>
            <div style={{ fontSize: 11, color: "#00C896", marginBottom: 8, letterSpacing: 2 }}>── THE GOLDEN RULE</div>
            <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.8, fontFamily: "'Space Grotesk',sans-serif" }}>
              Keep all Supabase calls in a <span style={{ color: "#00C896" }}>/services/</span> folder from day 1.
              When migrating, you only touch that folder — not a single component changes.
              This is the single most important thing to do in Phase 1.
            </div>
          </div>
        </div>
      )}

      {/* RISKS TAB */}
      {activeTab === "risks" && (
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 18, lineHeight: 1.7 }}>
            All risks are manageable if you follow the Phase 1 guidelines. Most are avoided entirely
            by keeping Supabase SDK calls isolated in one folder.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {risks.map((r, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 1fr auto",
                gap: 14, alignItems: "center",
                padding: "14px 16px",
                border: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 10,
              }}>
                <div>
                  <div style={{ fontSize: 12, color: "#ccc", marginBottom: 4 }}>{r.risk}</div>
                </div>
                <div style={{ fontSize: 11, color: "#777" }}>
                  <span style={{ color: "#00C896" }}>Fix: </span>{r.mitigation}
                </div>
                <div style={{
                  fontSize: 10, padding: "3px 10px", borderRadius: 20,
                  background: r.severity === "high" ? "rgba(255,107,107,0.15)" : r.severity === "medium" ? "rgba(255,184,0,0.15)" : "rgba(0,200,150,0.15)",
                  color: r.severity === "high" ? "#FF6B6B" : r.severity === "medium" ? "#FFB800" : "#00C896",
                  border: `1px solid ${r.severity === "high" ? "#FF6B6B40" : r.severity === "medium" ? "#FFB80040" : "#00C89640"}`,
                  whiteSpace: "nowrap",
                }}>
                  {r.severity} risk
                </div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 18,
            background: "rgba(123,97,255,0.06)",
            border: "1px solid rgba(123,97,255,0.2)",
            borderRadius: 10, padding: 16,
          }}>
            <div style={{ fontSize: 11, color: "#7B61FF", marginBottom: 8, letterSpacing: 2 }}>── OVERALL VERDICT</div>
            <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.8 }}>
              Migration is <span style={{ color: "#00C896" }}>low risk</span> if you isolate Supabase from the start.
              The database migration is a single command. The hardest part is swapping auth tokens —
              which only requires users to log in once. Most teams complete this migration in <span style={{ color: "#7B61FF" }}>1–2 weekends.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
