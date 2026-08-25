import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Terminal, LayoutDashboard, Users, Radar, ListChecks, ShieldCheck,
  Cpu, FileText, Settings, Power, Search, ChevronRight, Eye, PenTool,
  Rocket, AlertTriangle, CheckCircle2, XCircle, Clock, MapPin, Activity,
  TrendingUp, Zap, Lock, ArrowUpRight, Play,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  MATRIX OPERATOR CONSOLE - interactive prototype (mock data)
 *  Maps to the V1 workflow in Docs 19-29.
 * ------------------------------------------------------------------ */

const CSS = `
:root{
  --void:#04070a; --void2:#060c0e;
  --panel:rgba(6,18,12,0.66); --panel2:rgba(7,20,14,0.9);
  --line:rgba(0,255,102,0.16); --line2:rgba(0,255,102,0.4);
  --grn:#00ff66; --grn-soft:#8effbe; --grn-body:#b9ffd6;
  --grn-dim:#37b673; --grn-ghost:rgba(140,255,190,0.45);
  --amber:#ffc233; --red:#ff3b57; --cyan:#39e6ff;
  --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,"Courier New",monospace;
}
*{box-sizing:border-box}
.mx-root{position:fixed;inset:0;background:var(--void);color:var(--grn-body);
  font-family:var(--mono);font-size:13px;line-height:1.5;overflow:hidden;
  -webkit-font-smoothing:antialiased;letter-spacing:.01em}
.mx-rain{position:absolute;inset:0;opacity:.22;pointer-events:none;z-index:0}
.mx-scan{position:absolute;inset:0;pointer-events:none;z-index:1;
  background:repeating-linear-gradient(0deg,rgba(0,0,0,0) 0px,rgba(0,0,0,0) 2px,rgba(0,20,8,0.25) 3px,rgba(0,0,0,0) 4px);
  mix-blend-mode:overlay}
.mx-vig{position:absolute;inset:0;pointer-events:none;z-index:1;
  background:radial-gradient(120% 100% at 50% 0%,transparent 55%,rgba(0,0,0,.75) 100%)}
.mx-shell{position:relative;z-index:2;display:flex;height:100%;width:100%}

/* labels + type */
.ey{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--grn-dim)}
.glow{text-shadow:0 0 6px rgba(0,255,102,.55),0 0 2px rgba(0,255,102,.9)}
.h1{font-size:19px;font-weight:600;color:var(--grn);letter-spacing:.06em;text-transform:uppercase}
.dim{color:var(--grn-dim)} .ghost{color:var(--grn-ghost)} .soft{color:var(--grn-soft)}
.big{font-size:40px;font-weight:600;color:var(--grn);letter-spacing:.02em;line-height:1}

/* rail */
.rail{width:212px;flex:0 0 212px;border-right:1px solid var(--line);
  background:linear-gradient(180deg,rgba(4,10,7,.9),rgba(4,7,8,.7));
  display:flex;flex-direction:column;backdrop-filter:blur(3px);z-index:3}
.brand{padding:16px 16px 14px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center}
.brand b{color:var(--grn);font-size:13px;letter-spacing:.14em}
.navwrap{padding:10px 8px;overflow-y:auto;flex:1}
.nav{display:flex;align-items:center;gap:11px;width:100%;padding:9px 11px;margin:1px 0;
  border:1px solid transparent;border-radius:2px;color:var(--grn-dim);cursor:pointer;
  background:none;font-family:inherit;font-size:12px;letter-spacing:.08em;text-transform:uppercase;
  text-align:left;transition:all .14s}
.nav:hover{color:var(--grn-soft);border-color:var(--line);background:rgba(0,255,102,.04)}
.nav.on{color:var(--void);background:var(--grn);border-color:var(--grn);font-weight:600;
  box-shadow:0 0 16px rgba(0,255,102,.35)}
.nav .ct{margin-left:auto;font-size:10px;opacity:.7}
.nav:focus-visible{outline:2px solid var(--cyan);outline-offset:1px}
.railfoot{padding:12px 14px;border-top:1px solid var(--line);font-size:10px;color:var(--grn-ghost)}
.led{width:7px;height:7px;border-radius:50%;display:inline-block;box-shadow:0 0 8px currentColor}

/* main */
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.topbar{height:50px;flex:0 0 50px;border-bottom:1px solid var(--line);display:flex;align-items:center;
  gap:14px;padding:0 18px;background:rgba(4,9,6,.6)}
.cmd{flex:1;display:flex;align-items:center;gap:9px;height:32px;padding:0 12px;
  border:1px solid var(--line);border-radius:2px;color:var(--grn-dim);background:rgba(0,0,0,.35);max-width:520px}
.cmd input{flex:1;background:none;border:none;outline:none;color:var(--grn-soft);font-family:inherit;font-size:12px}
.stat{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--grn-dim)}
.view{flex:1;overflow-y:auto;padding:22px 26px 60px}
.vhead{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px;gap:16px;flex-wrap:wrap}

/* panels */
.panel{position:relative;border:1px solid var(--line);background:var(--panel);border-radius:2px;padding:16px}
.panel:before,.panel:after{content:"";position:absolute;width:9px;height:9px;border-color:var(--line2)}
.panel:before{top:-1px;left:-1px;border-top:1px solid;border-left:1px solid}
.panel:after{bottom:-1px;right:-1px;border-bottom:1px solid;border-right:1px solid}
.grid{display:grid;gap:14px}
.ptitle{display:flex;align-items:center;gap:8px;margin-bottom:14px}
.ptitle b{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--grn-soft)}

/* stat cards */
.kpi{display:flex;flex-direction:column;gap:6px}
.kpi .n{font-size:30px;font-weight:600;color:var(--grn);line-height:1}
.kpi .l{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--grn-dim)}
.kpi .d{font-size:10px;color:var(--grn-ghost)}

/* rows / lists */
.row{display:flex;align-items:center;gap:12px;padding:11px 12px;border:1px solid var(--line);
  border-radius:2px;background:rgba(0,0,0,.28);cursor:pointer;transition:all .13s;margin-bottom:8px}
.row:hover{border-color:var(--line2);background:rgba(0,255,102,.05);transform:translateX(2px)}
.row:focus-visible{outline:2px solid var(--cyan);outline-offset:1px}
.chip{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;padding:3px 7px;border-radius:2px;
  border:1px solid currentColor;white-space:nowrap}
.tag{font-size:10px;padding:2px 7px;border-radius:2px;background:rgba(0,255,102,.08);
  border:1px solid var(--line);color:var(--grn-dim);white-space:nowrap}

.btn{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border:1px solid var(--grn);
  color:var(--grn);background:rgba(0,255,102,.06);border-radius:2px;cursor:pointer;font-family:inherit;
  font-size:11px;letter-spacing:.1em;text-transform:uppercase;transition:all .14s}
.btn:hover{background:var(--grn);color:var(--void);box-shadow:0 0 16px rgba(0,255,102,.4)}
.btn.ghost{border-color:var(--line);color:var(--grn-dim)}
.btn.ghost:hover{background:rgba(0,255,102,.08);color:var(--grn-soft);box-shadow:none}
.btn.red{border-color:var(--red);color:var(--red);background:rgba(255,59,87,.06)}
.btn.red:hover{background:var(--red);color:#fff;box-shadow:0 0 16px rgba(255,59,87,.4)}
.btn:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}

/* gauge */
.gauge{position:relative;width:118px;height:118px}
.gauge svg{transform:rotate(-90deg)}
.gauge .gc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.gauge .gv{font-size:28px;font-weight:600;line-height:1}
.gauge .gl{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--grn-dim);margin-top:3px}
.gauge .gw{font-size:9px;color:var(--grn-ghost)}

.bar{height:5px;border-radius:3px;background:rgba(0,255,102,.12);overflow:hidden}
.bar>i{display:block;height:100%;border-radius:3px;box-shadow:0 0 8px currentColor;background:currentColor}

/* boot */
.boot{position:fixed;inset:0;z-index:50;background:var(--void);display:flex;
  align-items:center;justify-content:center;flex-direction:column;font-family:var(--mono)}
.bootbox{width:min(640px,88vw)}
.bootln{color:var(--grn-soft);font-size:13px;margin:3px 0;white-space:pre-wrap}
.bootln .ok{color:var(--grn);font-weight:600}
.cursor{display:inline-block;width:8px;height:15px;background:var(--grn);
  box-shadow:0 0 8px var(--grn);animation:bl 1s steps(1) infinite;vertical-align:-2px}
@keyframes bl{50%{opacity:0}}
.jack{margin-top:26px;animation:fin .5s ease both}
@keyframes fin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.pulse{animation:pl 1.6s ease-in-out infinite}
@keyframes pl{0%,100%{opacity:.5}50%{opacity:1}}
.flick{animation:fk 4s steps(1) infinite}
@keyframes fk{0%,97%,100%{opacity:1}98%{opacity:.7}99%{opacity:.9}}

.two{display:grid;grid-template-columns:1.6fr 1fr;gap:14px}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.four{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:1080px){.two,.three,.four{grid-template-columns:1fr 1fr}}
@media(max-width:720px){
  .rail{position:absolute;left:0;top:0;bottom:0;transform:translateX(-100%);transition:transform .2s}
  .rail.open{transform:none}
  .two,.three,.four{grid-template-columns:1fr}
  .view{padding:16px}
}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-thumb{background:rgba(0,255,102,.22);border-radius:4px}
::-webkit-scrollbar-track{background:transparent}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

/* ---------- digital rain ---------- */
function Rain() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = c.getContext("2d");
    let w, h, cols, drops, raf, font = 15;
    const glyph = "abcdefghijklmnopqrstuvwxyz0123456789<>[]/\\|=+*".split("");
    const resize = () => {
      w = c.width = c.offsetWidth; h = c.height = c.offsetHeight;
      cols = Math.floor(w / font); drops = Array(cols).fill(0).map(() => Math.random() * -50);
    };
    resize(); window.addEventListener("resize", resize);
    let last = 0;
    const draw = (t) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 55) return; last = t;
      ctx.fillStyle = "rgba(4,7,10,0.16)"; ctx.fillRect(0, 0, w, h);
      ctx.font = font + "px monospace";
      for (let i = 0; i < cols; i++) {
        const ch = glyph[(Math.random() * glyph.length) | 0];
        const x = i * font, y = drops[i] * font;
        ctx.fillStyle = Math.random() > 0.975 ? "#c9ffe0" : "#00d651";
        ctx.fillText(ch, x, y);
        if (y > h && Math.random() > 0.965) drops[i] = 0;
        drops[i] += 1;
      }
    };
    if (!reduce) raf = requestAnimationFrame(draw);
    else { ctx.fillStyle = "rgba(4,7,10,1)"; ctx.fillRect(0, 0, c.width, c.height); }
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="mx-rain" />;
}

/* ---------- decode text ---------- */
function Decode({ text, className }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOut(text); return; }
    const g = "ABCDEF0123456789<>#$%";
    let f = 0; const steps = 10;
    const id = setInterval(() => {
      f++;
      setOut(text.split("").map((ch, i) =>
        ch === " " ? " " : i < (f / steps) * text.length ? ch : g[(Math.random() * g.length) | 0]
      ).join(""));
      if (f >= steps) { clearInterval(id); setOut(text); }
    }, 32);
    return () => clearInterval(id);
  }, [text]);
  return <span className={className}>{out}</span>;
}

/* ---------- score gauge ---------- */
function Gauge({ value, label, weight, size = 118, color }) {
  const [v, setV] = useState(0);
  useEffect(() => { const id = setTimeout(() => setV(value), 60); return () => clearTimeout(id); }, [value]);
  const r = size / 2 - 9, circ = 2 * Math.PI * r;
  const col = color || (value >= 80 ? "#00ff66" : value >= 60 ? "#ffc233" : "#ff3b57");
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,255,102,.1)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ - (v / 100) * circ}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)", filter: `drop-shadow(0 0 5px ${col})` }} />
      </svg>
      <div className="gc">
        <div className="gv glow" style={{ color: col }}>{value}</div>
        {label && <div className="gl">{label}</div>}
        {weight && <div className="gw">{weight}</div>}
      </div>
    </div>
  );
}

/* ---------- data ---------- */
const CLIENTS = [
  { n: "Summit Ridge Fence Co.", loc: "Heber City, UT", plan: "GROWTH", score: 74, mon: "ACTIVE", trend: "+6" },
  { n: "Wasatch Peak Landscaping", loc: "Park City, UT", plan: "PRO", score: 81, mon: "ACTIVE", trend: "+3" },
  { n: "Canyon Roofing & Exteriors", loc: "Provo, UT", plan: "ESSENTIALS", score: 62, mon: "ACTIVE", trend: "+9" },
  { n: "Alpine Air HVAC", loc: "Orem, UT", plan: "GROWTH", score: 68, mon: "ACTIVE", trend: "+1" },
  { n: "Provo Valley Plumbing", loc: "Provo, UT", plan: "ESSENTIALS", score: 55, mon: "REVIEW", trend: "-2" },
];
const LEADS = [
  { n: "Redrock Concrete", loc: "Spanish Fork, UT", stat: "AUDIT_PURCHASED" },
  { n: "Timberline Electric", loc: "Heber City, UT", stat: "QUALIFIED" },
];
const CATS = [
  { k: "Website Performance", v: 71, w: "20%" },
  { k: "SEO", v: 66, w: "25%" },
  { k: "Local Search", v: 78, w: "15%" },
  { k: "Conversion", v: 82, w: "15%" },
  { k: "AI Readiness", v: 61, w: "10%" },
  { k: "Authority", v: 70, w: "15%" },
];
const OPPS = [
  { t: "Homepage LCP 5.2s - compress hero + preload", cat: "PERF", pri: 96, band: "IMMEDIATE", imp: 5, conf: 5, eff: 2, agent: "Website Health", sev: "CRITICAL" },
  { t: "3 money pages share duplicate title tags", cat: "SEO", pri: 84, band: "HIGH", imp: 4, conf: 5, eff: 1, agent: "Search / SEO", sev: "HIGH" },
  { t: "No LocalBusiness schema on 4 location pages", cat: "LOCAL", pri: 79, band: "HIGH", imp: 4, conf: 4, eff: 2, agent: "Schema", sev: "HIGH" },
  { t: "Service page missing FAQ / answer content", cat: "AI", pri: 71, band: "NORMAL", imp: 3, conf: 4, eff: 2, agent: "Content Opportunity", sev: "MEDIUM" },
  { t: "Contact form has 9 fields - reduce friction", cat: "CONV", pri: 64, band: "NORMAL", imp: 3, conf: 3, eff: 1, agent: "Conversion", sev: "MEDIUM" },
  { t: "Review count 22% of competitor median", cat: "AUTH", pri: 58, band: "NORMAL", imp: 3, conf: 4, eff: 3, agent: "Keyword & Competitor", sev: "MEDIUM" },
];
const bandColor = (b) => ({ IMMEDIATE: "#ff3b57", HIGH: "#ffc233", NORMAL: "#00ff66", BACKLOG: "#37b673", LOW: "rgba(140,255,190,.5)" }[b]);
const sevColor = (s) => ({ CRITICAL: "#ff3b57", HIGH: "#ffc233", MEDIUM: "#00ff66", LOW: "#37b673" }[s]);
const AGENTS = [
  { n: "Website Health", p: "OBSERVE", s: "RUNNING" }, { n: "Search / SEO", p: "OBSERVE", s: "IDLE" },
  { n: "Keyword & Competitor", p: "OBSERVE", s: "RUNNING" }, { n: "AI Visibility", p: "OBSERVE", s: "IDLE" },
  { n: "Content Opportunity", p: "PREPARE", s: "IDLE" }, { n: "Content Production", p: "PREPARE", s: "DRAFTING" },
  { n: "Existing Page Opt.", p: "PREPARE", s: "IDLE" }, { n: "Internal Linking", p: "PREPARE", s: "IDLE" },
  { n: "Schema", p: "PREPARE", s: "DRAFTING" }, { n: "Conversion", p: "PREPARE", s: "IDLE" },
  { n: "Reporting", p: "PREPARE", s: "IDLE" }, { n: "Client Comms", p: "PREPARE", s: "IDLE" },
  { n: "Verification / QA", p: "EXECUTE", s: "GATED" }, { n: "Orchestrator", p: "OBSERVE", s: "RUNNING" },
];
const permColor = (p) => ({ OBSERVE: "#39e6ff", PREPARE: "#00ff66", EXECUTE: "#ffc233" }[p]);
const planColor = (p) => ({ PRO: "#39e6ff", GROWTH: "#00ff66", ESSENTIALS: "#37b673", AUDIT_ONLY: "#ffc233" }[p] || "#37b673");

/* ---------- boot ---------- */
function Boot({ onDone }) {
  const lines = [
    "> initializing optiq // ai optimization runtime v1.0",
    "> establishing tenant context ......... [ WORKSPACE #1 ]",
    "> loading governed agent runtime ...... 14 agents online",
    "> permission model .................... OBSERVE-PREPARE-EXECUTE",
    "> external EXECUTE actions ............ DENY-BY-DEFAULT",
    "> deterministic scoring engine ........ dv-score-v1.0",
    "> secure channel ...................... ENCRYPTED",
  ];
  const [n, setN] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (n >= lines.length) { const t = setTimeout(() => setReady(true), 350); return () => clearTimeout(t); }
    const id = setTimeout(() => setN(n + 1), n === 0 ? 120 : 240);
    return () => clearTimeout(id);
  }, [n]);
  const renderLine = (l) => {
    const idx = l.lastIndexOf("....");
    if (idx === -1) return l;
    return <>{l.slice(0, idx + 4)}<span className="ok">{l.slice(idx + 4)}</span></>;
  };
  return (
    <div className="boot">
      <Rain />
      <div className="mx-scan" /><div className="mx-vig" />
      <div className="bootbox" style={{ position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
          <Terminal size={20} color="#00ff66" />
          <span className="glow" style={{ color: "#00ff66", letterSpacing: ".2em", fontSize: 15 }}>OPTIQ CONSOLE</span>
        </div>
        {lines.slice(0, n).map((l, i) => (
          <div className="bootln" key={i}>{renderLine(l)}</div>
        ))}
        {!ready && <span className="cursor" />}
        {ready && (
          <div className="jack">
            <div className="bootln ok" style={{ marginBottom: 14 }}>&gt; ACCESS GRANTED - operator authenticated</div>
            <button className="btn" onClick={onDone} style={{ fontSize: 13, padding: "11px 22px" }} autoFocus>
              <Power size={15} /> JACK IN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- shared bits ---------- */
const Panel = ({ title, icon, children, right }) => (
  <div className="panel">
    {(title || right) && (
      <div className="ptitle" style={{ justifyContent: "space-between" }}>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{icon}<b>{title}</b></span>
        {right}
      </div>
    )}
    {children}
  </div>
);

/* ---------- views ---------- */
function Dashboard({ go }) {
  return (
    <>
      <div className="vhead">
        <div>
          <div className="ey">workspace #1 - operator console</div>
          <Decode text="COMMAND CENTER" className="h1 glow" />
        </div>
        <button className="btn" onClick={() => go("audit")}><Play size={13} /> Run new audit</button>
      </div>

      <div className="four" style={{ marginBottom: 14 }}>
        {[
          { n: "$6,000", l: "Recurring / mo", d: "5 active clients", i: <TrendingUp size={14} /> },
          { n: "3", l: "Approvals waiting", d: "1 critical", i: <ShieldCheck size={14} /> },
          { n: "12", l: "Work queued", d: "next cycle", i: <ListChecks size={14} /> },
          { n: "47", l: "Agent runs today", d: "2 running now", i: <Cpu size={14} /> },
        ].map((k) => (
          <div className="panel kpi" key={k.l}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--grn-dim)" }}>
              <span className="l">{k.l}</span>{k.i}
            </div>
            <div className="n glow">{k.n}</div>
            <div className="d">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="two">
        <Panel title="Next best actions" icon={<Zap size={13} color="#00ff66" />}
          right={<span className="ghost" style={{ fontSize: 10 }}>orchestrator - op-priority-v1.0</span>}>
          {OPPS.slice(0, 4).map((o, i) => (
            <div className="row" key={i} tabIndex={0} onClick={() => go("opps")}>
              <span className="chip" style={{ color: bandColor(o.band) }}>{o.pri}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="soft" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.t}</div>
                <div className="ghost" style={{ fontSize: 10 }}>{o.agent} agent - {o.cat}</div>
              </div>
              <ChevronRight size={15} className="dim" />
            </div>
          ))}
        </Panel>

        <div className="grid">
          <Panel title="System status" icon={<Activity size={13} color="#39e6ff" />}>
            {[["Agents online", "14 / 14", "#00ff66"], ["Queue depth", "12 items", "#00ff66"],
              ["Failed runs (24h)", "0", "#00ff66"], ["EXECUTE actions", "DENY-BY-DEFAULT", "#ffc233"],
              ["Monthly AI budget", "38% used", "#00ff66"]].map((r) => (
              <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <span className="dim" style={{ fontSize: 11 }}>{r[0]}</span>
                <span style={{ color: r[2], fontSize: 11 }}><span className="led" style={{ color: r[2], marginRight: 6 }} />{r[1]}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Critical alert" icon={<AlertTriangle size={13} color="#ff3b57" />}>
            <div className="row" style={{ borderColor: "rgba(255,59,87,.4)", background: "rgba(255,59,87,.06)", cursor: "default" }}>
              <AlertTriangle size={16} color="#ff3b57" />
              <div style={{ flex: 1 }}>
                <div style={{ color: "#ff8a9c" }}>Summit Ridge - homepage LCP 5.2s</div>
                <div className="ghost" style={{ fontSize: 10 }}>direct lead-loss risk - fix drafted, awaiting approval</div>
              </div>
              <button className="btn" onClick={() => go("approvals")} style={{ padding: "6px 10px" }}>Review</button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Clients({ go }) {
  return (
    <>
      <div className="vhead">
        <div><div className="ey">roster - 5 active - 2 in pipeline</div><Decode text="CLIENTS" className="h1 glow" /></div>
        <button className="btn ghost"><Users size={13} /> Add client</button>
      </div>
      <Panel title="Active clients" icon={<Users size={13} color="#00ff66" />}>
        {CLIENTS.map((c) => (
          <div className="row" key={c.n} tabIndex={0} onClick={() => go("audit")}>
            <Gauge value={c.score} size={46} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="soft">{c.n}</div>
              <div className="ghost" style={{ fontSize: 10, display: "flex", gap: 6, alignItems: "center" }}>
                <MapPin size={10} /> {c.loc}
              </div>
            </div>
            <span className="tag" style={{ color: planColor(c.plan), borderColor: planColor(c.plan) }}>{c.plan}</span>
            <span className="tag" style={{ color: c.trend[0] === "-" ? "#ff3b57" : "#00ff66" }}>{c.trend} pts</span>
            <span className="chip" style={{ color: c.mon === "ACTIVE" ? "#00ff66" : "#ffc233" }}>{c.mon}</span>
            <ChevronRight size={15} className="dim" />
          </div>
        ))}
      </Panel>
      <div style={{ height: 14 }} />
      <Panel title="Lead pipeline" icon={<Radar size={13} color="#39e6ff" />}>
        {LEADS.map((l) => (
          <div className="row" key={l.n} tabIndex={0}>
            <div style={{ flex: 1 }}>
              <div className="soft">{l.n}</div>
              <div className="ghost" style={{ fontSize: 10 }}><MapPin size={10} /> {l.loc}</div>
            </div>
            <span className="tag" style={{ color: "#39e6ff", borderColor: "rgba(57,230,255,.4)" }}>{l.stat}</span>
            <button className="btn ghost" style={{ padding: "6px 12px" }}>Convert</button>
          </div>
        ))}
      </Panel>
    </>
  );
}

function Audit() {
  const overall = 71;
  return (
    <>
      <div className="vhead">
        <div>
          <div className="ey">summit ridge fence co. - digital visibility audit - dv-score-v1.0</div>
          <Decode text="AUDIT / BASELINE" className="h1 glow" />
        </div>
        <span className="tag" style={{ color: "#00ff66" }}><Clock size={11} /> finalized - 6 days ago</span>
      </div>

      <div className="two" style={{ marginBottom: 14 }}>
        <Panel title="Digital Visibility Score" icon={<Radar size={13} color="#00ff66" />}
          right={<span className="ghost" style={{ fontSize: 10 }}>weighted - deterministic</span>}>
          <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <Gauge value={overall} size={150} label="OVERALL" />
              <div className="tag" style={{ marginTop: 10, color: "#ffc233" }}>NEEDS IMPROVEMENT</div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10, flex: 1, minWidth: 260 }}>
              {CATS.map((c) => <Gauge key={c.k} value={c.v} label={c.k.split(" ")[0]} weight={c.w} size={96} />)}
            </div>
          </div>
        </Panel>

        <Panel title="Observed AI Visibility" icon={<Eye size={13} color="#39e6ff" />}
          right={<span className="tag" style={{ color: "#39e6ff", fontSize: 9 }}>SAMPLED - NOT A RANK</span>}>
          <div className="ghost" style={{ fontSize: 10, marginBottom: 12 }}>Perplexity Sonar API - 10 prompts - this month</div>
          {[["Mention rate", 40], ["Recommendation rate", 20], ["Citation rate", 30], ["Share of mentions", 33]].map((m) => (
            <div key={m[0]} style={{ marginBottom: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span className="dim" style={{ fontSize: 11 }}>{m[0]}</span>
                <span className="soft" style={{ fontSize: 11 }}>{m[1]}%</span>
              </div>
              <div className="bar"><i style={{ width: m[1] + "%", color: "#39e6ff" }} /></div>
            </div>
          ))}
          <div className="ghost" style={{ fontSize: 9.5, marginTop: 8, lineHeight: 1.5 }}>
            Reported separately from the score. Not presented as a guaranteed ranking or universal AI visibility.
          </div>
        </Panel>
      </div>

      <Panel title="Top findings" icon={<AlertTriangle size={13} color="#ffc233" />}
        right={<span className="ghost" style={{ fontSize: 10 }}>evidence-backed - auto-prioritized</span>}>
        {OPPS.map((o, i) => (
          <div className="row" key={i} tabIndex={0} style={{ cursor: "default" }}>
            <span className="chip" style={{ color: sevColor(o.sev) }}>{o.sev}</span>
            <div style={{ flex: 1, minWidth: 0 }} className="soft">{o.t}</div>
            <span className="tag">{o.cat}</span>
          </div>
        ))}
      </Panel>
    </>
  );
}

function Opps({ go }) {
  return (
    <>
      <div className="vhead">
        <div><div className="ey">prioritized - deterministic - op-priority-v1.0</div><Decode text="OPPORTUNITIES - WORK QUEUE" className="h1 glow" /></div>
        <span className="tag" style={{ color: "#00ff66" }}>{OPPS.length} open</span>
      </div>
      {OPPS.map((o, i) => (
        <div className="panel" key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center", minWidth: 58 }}>
              <div className="big glow" style={{ fontSize: 28, color: bandColor(o.band) }}>{o.pri}</div>
              <div className="chip" style={{ color: bandColor(o.band), fontSize: 8.5, marginTop: 3 }}>{o.band}</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="soft" style={{ marginBottom: 6 }}>{o.t}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="tag">impact {o.imp}/5</span>
                <span className="tag">confidence {o.conf}/5</span>
                <span className="tag">effort {o.eff}/5</span>
                <span className="tag" style={{ color: "#39e6ff", borderColor: "rgba(57,230,255,.4)" }}>{o.agent}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn ghost" style={{ padding: "8px 12px" }}>Draft</button>
              <button className="btn" onClick={() => go("approvals")} style={{ padding: "8px 12px" }}>Queue <ArrowUpRight size={13} /></button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function Approvals() {
  const [done, setDone] = useState(null);
  return (
    <>
      <div className="vhead">
        <div><div className="ey">human-in-the-loop - consequential actions only</div><Decode text="APPROVALS" className="h1 glow" /></div>
        <span className="tag" style={{ color: "#ffc233" }}>3 pending</span>
      </div>

      <div className="panel" style={{ marginBottom: 14, borderColor: "rgba(255,59,87,.35)" }}>
        <div className="ptitle" style={{ justifyContent: "space-between" }}>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Lock size={13} color="#ff3b57" /><b style={{ color: "#ff8a9c" }}>LIVE PAGE PUBLISH - REQUIRES APPROVAL</b>
          </span>
          <span className="tag" style={{ color: "#39e6ff" }}>Content Production agent</span>
        </div>

        <div className="two" style={{ gap: 14 }}>
          <div>
            {[
              ["What will change", "Publish rewritten hero + compressed imagery on summitridgefence.com homepage"],
              ["Why", "LCP 5.2s (FAIL, >4.0s) - largest element is a 3.1 MB uncompressed hero image"],
              ["Evidence", "PageSpeed field data - perf.lcp check v1 - screenshot + waterfall attached"],
              ["Expected benefit", "LCP -> ~2.1s (PASS band); Performance category +11 pts est."],
              ["Risk", "Medium - live homepage change - reversible"],
              ["Rollback", "Pre-change snapshot stored - one-click restore available"],
              ["Version approved", "draft-artifact v3 (content hash a91f...) - edits invalidate approval"],
            ].map((r) => (
              <div key={r[0]} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div className="ey" style={{ marginBottom: 3 }}>{r[0]}</div>
                <div className="soft" style={{ fontSize: 12 }}>{r[1]}</div>
              </div>
            ))}
          </div>
          <div className="grid" style={{ alignContent: "start" }}>
            <div className="panel" style={{ background: "rgba(0,0,0,.3)", padding: 12 }}>
              <div className="ey" style={{ marginBottom: 8 }}>after execution</div>
              <div className="dim" style={{ fontSize: 11, lineHeight: 1.7 }}>
                Verification agent re-fetches the page, confirms LCP element + values, checks no noindex/canonical
                regression, then marks <span style={{ color: "#00ff66" }}>VERIFIED</span> or escalates.
              </div>
            </div>
            {done === "approved" && <div className="tag" style={{ color: "#00ff66", padding: "10px" }}><CheckCircle2 size={13} /> Approved - queued for EXECUTE + verification</div>}
            {done === "rejected" && <div className="tag" style={{ color: "#ff3b57", borderColor: "rgba(255,59,87,.4)", padding: "10px" }}><XCircle size={13} /> Rejected - returned to drafting</div>}
            {!done && (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => setDone("approved")}><CheckCircle2 size={14} /> Approve</button>
                <button className="btn ghost" onClick={() => setDone(null)}><PenTool size={14} /> Edit</button>
                <button className="btn red" onClick={() => setDone("rejected")}><XCircle size={14} /> Reject</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {[["Publish 4x LocalBusiness JSON-LD blocks", "Schema agent", "reversible - low risk"],
        ["Send monthly report to Wasatch Peak", "Client Comms agent", "client-facing send"]].map((a) => (
        <div className="row" key={a[0]} style={{ cursor: "default" }}>
          <Lock size={14} color="#ffc233" />
          <div style={{ flex: 1 }}><div className="soft">{a[0]}</div><div className="ghost" style={{ fontSize: 10 }}>{a[1]} - {a[2]}</div></div>
          <button className="btn ghost" style={{ padding: "6px 12px" }}>Open</button>
        </div>
      ))}
    </>
  );
}

function Agents() {
  return (
    <>
      <div className="vhead">
        <div><div className="ey">governed runtime - 14 agents - tenant-scoped</div><Decode text="AGENTS / RUNS" className="h1 glow" /></div>
        <div style={{ display: "flex", gap: 8 }}>
          {["OBSERVE", "PREPARE", "EXECUTE"].map((p) => (
            <span key={p} className="tag" style={{ color: permColor(p), borderColor: permColor(p) }}>
              <span className="led" style={{ color: permColor(p) }} /> {p}
            </span>
          ))}
        </div>
      </div>
      <div className="three">
        {AGENTS.map((a) => {
          const running = a.s === "RUNNING" || a.s === "DRAFTING";
          return (
            <div className="panel" key={a.n} style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span className="led pulse" style={{ color: a.s === "GATED" ? "#ffc233" : running ? "#00ff66" : "#37b673" }} />
                <span className="tag" style={{ color: permColor(a.p), borderColor: permColor(a.p), fontSize: 8.5 }}>{a.p}</span>
              </div>
              <div className="soft" style={{ marginBottom: 4 }}>{a.n}</div>
              <div className="ghost" style={{ fontSize: 10, display: "flex", justifyContent: "space-between" }}>
                <span>{a.s === "GATED" ? "execute - deny-default" : running ? "active now" : "idle"}</span>
                <span style={{ color: running ? "#00ff66" : "var(--grn-ghost)" }}>{a.s}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Reports() {
  return (
    <>
      <div className="vhead">
        <div><div className="ey">monthly cycle - verified data only - human-finalized</div><Decode text="REPORTS" className="h1 glow" /></div>
        <button className="btn ghost"><FileText size={13} /> Export PDF</button>
      </div>
      <Panel title="Wasatch Peak Landscaping - November 2026" icon={<FileText size={13} color="#00ff66" />}
        right={<span className="tag" style={{ color: "#ffc233" }}>DRAFT - awaiting finalize</span>}>
        <div className="four" style={{ marginBottom: 14 }}>
          {[["Organic traffic", "+18%", "#00ff66"], ["Qualified leads", "14", "#00ff66"], ["Avg. position", "8.2 -> 5.6", "#00ff66"], ["AI mentions", "5 / 15", "#39e6ff"]].map((k) => (
            <div key={k[0]} className="panel kpi" style={{ padding: 12 }}>
              <div className="l">{k[0]}</div><div className="n glow" style={{ fontSize: 22, color: k[2] }}>{k[1]}</div>
            </div>
          ))}
        </div>
        <div className="two">
          <div className="panel" style={{ background: "rgba(0,0,0,.3)" }}>
            <div className="ey" style={{ marginBottom: 8 }}>work completed + verified</div>
            {["Published 2 location pages", "Fixed 6 duplicate titles", "Added FAQ schema to 3 pages", "Compressed 14 images"].map((w) => (
              <div key={w} style={{ display: "flex", gap: 8, padding: "5px 0", alignItems: "center" }}>
                <CheckCircle2 size={13} color="#00ff66" /><span className="dim" style={{ fontSize: 11 }}>{w}</span>
              </div>
            ))}
          </div>
          <div className="panel" style={{ background: "rgba(0,0,0,.3)" }}>
            <div className="ey" style={{ marginBottom: 8 }}>estimated pipeline value</div>
            <div className="big glow" style={{ fontSize: 30 }}>$21,000</div>
            <div className="ghost" style={{ fontSize: 10, marginTop: 6, lineHeight: 1.6 }}>
              14 qualified leads x $1,500 avg job - labeled <b>estimated</b> - client-approved inputs - not attributed revenue.
            </div>
          </div>
        </div>
      </Panel>
    </>
  );
}

function SettingsView() {
  const [exec, setExec] = useState(false);
  const [kill, setKill] = useState(false);
  const Toggle = ({ on, set, label, desc, danger }) => (
    <div className="row" style={{ cursor: "default", borderColor: on && danger ? "rgba(255,59,87,.4)" : "var(--line)" }}>
      <div style={{ flex: 1 }}>
        <div className="soft">{label}</div><div className="ghost" style={{ fontSize: 10 }}>{desc}</div>
      </div>
      <button onClick={() => set(!on)} className="btn" style={{
        padding: "6px 14px", minWidth: 76, justifyContent: "center",
        borderColor: on ? (danger ? "#ff3b57" : "#00ff66") : "var(--line)",
        color: on ? (danger ? "#ff3b57" : "#00ff66") : "var(--grn-dim)",
        background: on ? (danger ? "rgba(255,59,87,.1)" : "rgba(0,255,102,.1)") : "transparent",
      }}>{on ? "ON" : "OFF"}</button>
    </div>
  );
  return (
    <>
      <div className="vhead"><div><div className="ey">system control - platform safety</div><Decode text="SETTINGS" className="h1 glow" /></div></div>
      <Panel title="Autonomy & safety" icon={<ShieldCheck size={13} color="#00ff66" />}>
        <Toggle on={exec} set={setExec} label="External EXECUTE actions" desc="Allowlisted, reversible writes to live sites - deny-by-default" danger />
        <Toggle on={kill} set={setKill} label="Global kill switch" desc="Pause all scheduled agent work platform-wide" danger />
        <Toggle on set={() => {}} label="Human approval - client sends" desc="Mandatory in V1" />
        <Toggle on set={() => {}} label="Prompt-injection guardrails" desc="External content treated as untrusted data" />
      </Panel>
      <div style={{ height: 14 }} />
      <Panel title="Budgets" icon={<Zap size={13} color="#ffc233" />}>
        {[["Monthly AI budget", "38% of $400 used"], ["Crawl concurrency", "4 workers"], ["Max pages / crawl", "150"]].map((r) => (
          <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="dim" style={{ fontSize: 11 }}>{r[0]}</span><span className="soft" style={{ fontSize: 11 }}>{r[1]}</span>
          </div>
        ))}
      </Panel>
    </>
  );
}

/* ---------- app shell ---------- */
const NAV = [
  { k: "dash", label: "Dashboard", icon: LayoutDashboard },
  { k: "clients", label: "Clients", icon: Users, ct: "5" },
  { k: "audit", label: "Audits", icon: Radar },
  { k: "opps", label: "Opportunities", icon: ListChecks, ct: "6" },
  { k: "approvals", label: "Approvals", icon: ShieldCheck, ct: "3" },
  { k: "agents", label: "Agents", icon: Cpu },
  { k: "reports", label: "Reports", icon: FileText },
  { k: "settings", label: "Settings", icon: Settings },
];

export default function App() {
  const [booted, setBooted] = useState(false);
  const [view, setView] = useState("dash");
  const [railOpen, setRailOpen] = useState(false);
  const go = useCallback((v) => { setView(v); setRailOpen(false); }, []);
  const [clock, setClock] = useState("");
  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString("en-US", { hour12: false }));
    t(); const id = setInterval(t, 1000); return () => clearInterval(id);
  }, []);

  if (!booted) return (<div className="mx-root"><style>{CSS}</style><Boot onDone={() => setBooted(true)} /></div>);

  const V = { dash: Dashboard, clients: Clients, audit: Audit, opps: Opps, approvals: Approvals, agents: Agents, reports: Reports, settings: SettingsView }[view];

  return (
    <div className="mx-root">
      <style>{CSS}</style>
      <Rain /><div className="mx-scan" /><div className="mx-vig" />
      <div className="mx-shell">
        <aside className={"rail flick" + (railOpen ? " open" : "")}>
          <div className="brand">
            <Terminal size={18} color="#00ff66" />
            <b className="glow">OPTIQ</b>
          </div>
          <nav className="navwrap">
            {NAV.map((n) => {
              const I = n.icon;
              return (
                <button key={n.k} className={"nav" + (view === n.k ? " on" : "")} onClick={() => go(n.k)}>
                  <I size={15} /> {n.label}{n.ct && <span className="ct">{n.ct}</span>}
                </button>
              );
            })}
          </nav>
          <div className="railfoot">
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
              <span className="led pulse" style={{ color: "#00ff66" }} /> all systems nominal
            </div>
            operator - workspace #1
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="btn ghost" style={{ padding: "6px 9px", display: "none" }} onClick={() => setRailOpen((o) => !o)}>=</button>
            <div className="cmd">
              <Search size={14} />
              <input placeholder="run command...  cmd+K  -  try: audit summit ridge" onKeyDown={(e) => e.key === "Enter" && go("audit")} />
              <span className="ghost" style={{ fontSize: 10 }}>cmd+K</span>
            </div>
            <div className="stat"><span className="led pulse" style={{ color: "#00ff66" }} /> 2 agents active</div>
            <div className="stat" style={{ color: "#39e6ff" }}><Clock size={12} /> {clock}</div>
          </header>
          <main className="view">{V ? <V go={go} /> : null}</main>
        </div>
      </div>
    </div>
  );
}
