/* Intuitive Tracker — standalone PWA
   Data lives in IndexedDB on this device (mirrored to localStorage as a fallback).
   Nothing is ever sent anywhere. Export shares or saves a .json backup locally.
*/

const { h, render } = preact;
const { useState, useEffect, useMemo, useRef } = preactHooks;
const html = htm.bind(h);
const { exportTrackingData } = window.IntuitiveTrackerExport;

/* ---------------- tokens ---------------- */
const C = {
  paper: "#E9EDF0", card: "#FBFCFD", ink: "#101B24", muted: "#5D707D",
  rule: "#C3CDD4", signal: "#1F6F78", flag: "#8C3F6B", faint: "#DCE3E8",
};
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";
const SANS = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MEALS = ["Meal 1", "Meal 2", "Meal 3"];
const KINDS = ["run", "strength", "other"];
const KIND_COLOR = { run: "#1F6F78", strength: "#8C3F6B", other: "#C2803F", unspecified: "#5D707D" };
const HABITS = [
  { key: "sleep", label: "Good sleep", color: "#1F6F78" },
  { key: "meditation", label: "Meditation", color: "#C2803F" },
];
const didExercise = (e) => !!(e && e.exercise && e.exercise.done);

/* ---------------- storage ---------------- */
const DB_NAME = "daily-log", STORE = "kv", KEY = "state:v1";
function openDb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbGet(key) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbSet(key, val) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function loadState() {
  try { const v = await idbGet(KEY); if (v) return v; } catch (e) {}
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return null;
}
async function saveState(state) {
  let ok = false;
  try { await idbSet(KEY, state); ok = true; } catch (e) {}
  try { localStorage.setItem(KEY, JSON.stringify(state)); ok = true; } catch (e) {}
  return ok;
}

/* ---------------- dates ---------------- */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const fromIso = (s) => { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d); };
const shift = (s, n) => { const d = fromIso(s); d.setDate(d.getDate()+n); return iso(d); };
const dayLetter = (s) => "SMTWTFS"[fromIso(s).getDay()];
const shortDate = (s) => fromIso(s).toLocaleDateString(undefined,{month:"short",day:"numeric"});
const num = (v) => (v===""||v==null) ? null : Number(v);

/* ---------------- charts (hand-rolled SVG) ---------------- */
const VB = 320;
function axisBounds(values, pad=0.08, forced) {
  if (forced) return forced;
  const v = values.filter(x => x!=null);
  if (!v.length) return [0,1];
  let lo=Math.min(...v), hi=Math.max(...v);
  if (lo===hi) { lo-=1; hi+=1; }
  const p=(hi-lo)*pad;
  return [lo-p, hi+p];
}

function LineChart({ rows, lines, height=150, domain, ticks }) {
  const H=height, padL=34, padR=6, padT=8, padB=18;
  const w=VB-padL-padR, hh=H-padT-padB;
  const all=lines.flatMap(l=>rows.map(r=>r[l.key]));
  const [lo,hi]=axisBounds(all,0.08,domain);
  const x=(i)=>padL+(rows.length<2?w/2:(i/(rows.length-1))*w);
  const y=(v)=>padT+hh-((v-lo)/(hi-lo))*hh;
  const gridVals=ticks||[lo,(lo+hi)/2,hi];
  const path=(key)=>{
    let d="",pen=false;
    rows.forEach((r,i)=>{
      const v=r[key]; if(v==null) return;
      d+=(pen?"L":"M")+x(i).toFixed(1)+" "+y(v).toFixed(1)+" "; pen=true;
    });
    return d;
  };
  const labelIdx=[0,Math.floor((rows.length-1)/2),rows.length-1];
  return html`<svg viewBox="0 0 ${VB} ${H}" style="width:100%;height:auto;display:block" role="img">
    ${gridVals.map(g=>html`<g>
      <line x1=${padL} x2=${VB-padR} y1=${y(g)} y2=${y(g)} stroke=${C.faint} stroke-width="1" vector-effect="non-scaling-stroke"/>
      <text x=${padL-5} y=${y(g)+3} text-anchor="end" class="tick">${Math.abs(g)>=100?Math.round(g):g.toFixed(1)}</text>
    </g>`)}
    ${lines.map(l=>html`<path d=${path(l.key)} fill="none" stroke=${l.color} stroke-width=${l.width||2} stroke-dasharray=${l.dash||"none"} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`)}
    ${labelIdx.map((i)=>rows[i]&&html`<text x=${x(i)} y=${H-5} text-anchor=${i===0?"start":i===rows.length-1?"end":"middle"} class="tick">${rows[i].label}</text>`)}
  </svg>`;
}

function BarChart({ rows, dataKey, colorFn, color, height=140, domain }) {
  const H=height, padL=34, padR=6, padT=8, padB=18;
  const w=VB-padL-padR, hh=H-padT-padB;
  const vals=rows.map(r=>r[dataKey]);
  const hi=domain?domain[1]:Math.max(1,...vals.filter(v=>v!=null))*1.1;
  const bw=Math.max(1.5,(w/rows.length)*0.62);
  const x=(i)=>padL+(i+0.5)*(w/rows.length);
  const yv=(v)=>padT+hh-(v/hi)*hh;
  const gridVals=[0,hi/2,hi];
  const labelIdx=[0,Math.floor((rows.length-1)/2),rows.length-1];
  return html`<svg viewBox="0 0 ${VB} ${H}" style="width:100%;height:auto;display:block" role="img">
    ${gridVals.map(g=>html`<g>
      <line x1=${padL} x2=${VB-padR} y1=${yv(g)} y2=${yv(g)} stroke=${C.faint} stroke-width="1" vector-effect="non-scaling-stroke"/>
      <text x=${padL-5} y=${yv(g)+3} text-anchor="end" class="tick">${hi>=20?Math.round(g):g.toFixed(1)}</text>
    </g>`)}
    ${rows.map((r,i)=>{
      const v=r[dataKey]; if(v==null) return null;
      const fill=colorFn?colorFn(r):(color||C.signal);
      return html`<rect x=${x(i)-bw/2} y=${yv(v)} width=${bw} height=${Math.max(1,padT+hh-yv(v))} fill=${fill}/>`;
    })}
    ${labelIdx.map((i)=>rows[i]&&html`<text x=${x(i)} y=${H-5} text-anchor=${i===0?"start":i===rows.length-1?"end":"middle"} class="tick">${rows[i].label}</text>`)}
  </svg>`;
}

/* stacked two-key bar: key1 on bottom, key2 on top */
function StackedBarChart({ rows, keys, colors, height=140, domain }) {
  const H=height, padL=34, padR=6, padT=8, padB=18;
  const w=VB-padL-padR, hh=H-padT-padB;
  const hi=domain?domain[1]:keys.length;
  const bw=Math.max(1.5,(w/rows.length)*0.62);
  const x=(i)=>padL+(i+0.5)*(w/rows.length);
  const scale=(v)=>padT+hh-(v/hi)*hh;
  const labelIdx=[0,Math.floor((rows.length-1)/2),rows.length-1];
  return html`<svg viewBox="0 0 ${VB} ${H}" style="width:100%;height:auto;display:block" role="img">
    ${[0,hi/2,hi].map(g=>html`<g>
      <line x1=${padL} x2=${VB-padR} y1=${scale(g)} y2=${scale(g)} stroke=${C.faint} stroke-width="1" vector-effect="non-scaling-stroke"/>
      <text x=${padL-5} y=${scale(g)+3} text-anchor="end" class="tick">${g}</text>
    </g>`)}
    ${rows.map((r,i)=>{
      let base=0;
      return keys.map((k,ki)=>{
        const v=r[k]||0;
        const seg=html`<rect x=${x(i)-bw/2} y=${scale(base+v)} width=${bw} height=${Math.max(0,(v/hi)*hh)} fill=${colors[ki]}/>`;
        base+=v; return seg;
      });
    })}
    ${labelIdx.map((i)=>rows[i]&&html`<text x=${x(i)} y=${H-5} text-anchor=${i===0?"start":i===rows.length-1?"end":"middle"} class="tick">${rows[i].label}</text>`)}
  </svg>`;
}

/* ---------------- UI primitives ---------------- */
const Eyebrow = ({children,style}) => html`<div class="eyebrow" style=${style}>${children}</div>`;
const Card = ({children,style}) => html`<div class="card" style=${style}>${children}</div>`;
const Empty = ({children}) => html`<p style="font-family:${SANS};font-size:13px;color:${C.muted};margin:8px 0 0">${children}</p>`;
const Legend = ({items}) => html`<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px">
  ${items.map(([label,color])=>html`<span style="display:flex;align-items:center;gap:6px">
    <span style="width:10px;height:2px;background:${color};display:block"></span>
    <span style="font-family:${MONO};font-size:10px;color:${C.muted}">${label}</span>
  </span>`)}
</div>`;

function Chips({ value, onChange, color=C.signal }) {
  return html`<div class="chips">
    ${[1,2,3,4,5].map(n=>{
      const on = value!=null && value!=="" && Number(value)===n;
      return html`<button class="chip" aria-pressed=${on}
        style=${on?`background:${color};border-color:${color};color:#fff`:""}
        onClick=${()=>onChange(on?null:n)}>${n}</button>`;
    })}
  </div>`;
}

function Check({ label, checked, onChange, color=C.signal }) {
  return html`<button
    onClick=${()=>onChange(!checked)}
    style="display:flex;align-items:center;gap:12px;width:100%;padding:12px;margin-bottom:8px;background:${checked?color+"18":"transparent"};border:1px solid ${checked?color:C.rule};border-radius:2px;cursor:pointer;text-align:left"
  >
    <span style="width:20px;height:20px;flex-shrink:0;border-radius:2px;border:1px solid ${checked?color:C.rule};background:${checked?color:"transparent"};color:#fff;font-size:13px;line-height:19px;text-align:center;font-family:${MONO}">
      ${checked?"✓":""}
    </span>
    <span style="font-family:${SANS};font-size:14px;color:${checked?C.ink:C.muted}">${label}</span>
  </button>`;
}

function Segmented({ options, value, onChange, color=C.signal }) {
  return html`<div style="display:flex;gap:4px">
    ${options.map(o=>{
      const on=value===o;
      return html`<button
        style="flex:1;font-family:${MONO};font-size:12px;padding:10px 4px;background:${on?color:"transparent"};color:${on?"#fff":C.muted};border:1px solid ${on?color:C.rule};border-radius:2px;cursor:pointer"
        onClick=${()=>onChange(on?null:o)}>${o}</button>`;
    })}
  </div>`;
}

function Field({ label, hint, children }) {
  return html`<div class="field">
    <span class="flabel">${label}${hint?html` <span class="fhint">${hint}</span>`:""}</span>
    ${children}
  </div>`;
}

function Tape({ dates, entries, selected, onSelect }) {
  const ref = useRef(null);
  useEffect(()=>{ if(ref.current) ref.current.scrollLeft=ref.current.scrollWidth; },[]);
  const cells = (e) => [
    e?.weight!=null && e.weight!=="",
    !!e?.sleep || !!e?.meditation,
    (e?.meals||[]).some(m=>m&&(m.before||m.after||m.homeCooked)),
    didExercise(e),
  ];
  return html`<div class="tape" ref=${ref}>
    ${dates.map(d=>{
      const on=d===selected;
      return html`<button class=${"tapeday"+(on?" on":"")} onClick=${()=>onSelect(d)} aria-label=${shortDate(d)}>
        <span class="tl">${dayLetter(d)}</span>
        <span class="stripes">
          ${cells(entries[d]).map(f=>html`<span class="stripe" style="background:${f?(on?C.paper:C.signal):(on?"#2C3A45":C.faint)}"></span>`)}
        </span>
        <span class="tn">${fromIso(d).getDate()}</span>
      </button>`;
    })}
  </div>`;
}

/* ---------------- agent patches ---------------- */
function b64decode(s) {
  const t=String(s).replace(/-/g,"+").replace(/_/g,"/");
  const pad=t.length%4?"=".repeat(4-(t.length%4)):"";
  const bin=atob(t+pad);
  const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function extractPatchText(raw) {
  if(!raw) return null;
  const text=String(raw).trim(); if(!text) return null;
  const link=text.match(/[#?&]patch=([A-Za-z0-9+/_=-]+)/);
  if(link) return link[1];
  const brace=text.indexOf("{"), close=text.lastIndexOf("}");
  if(brace>=0&&close>brace) return text.slice(brace,close+1);
  return text;
}
const numish=(v)=>{ if(v==null||v==="") return null; return Number.isFinite(Number(v))?String(v).trim():null; };
const clamp15=(v)=>{ const n=Number(v); return Number.isFinite(n)?String(Math.min(5,Math.max(1,Math.round(n)))):null; };
const yesno=(v)=>v==null?null:v?"yes":"no";

function normalizePatch(v) {
  if(!v||typeof v!=="object") return null;
  const date=typeof v.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v.date)?v.date:null;
  if(!date) return null;
  const changes={};
  const w=numish(v.weight); if(w!=null) changes.weight=w;
  const cal=numish(v.calories); if(cal!=null) changes.calories=cal;
  if(v.sleep!=null) changes.sleep=!!v.sleep;
  if(v.meditation!=null) changes.meditation=!!v.meditation;
  let list=null;
  if(Array.isArray(v.meals)) list=v.meals;
  else if(v.meals&&typeof v.meals==="object") {
    list=[];
    Object.keys(v.meals).forEach(k=>{
      let i=MEALS.findIndex(m=>m.toLowerCase()===String(k).toLowerCase());
      if(i<0) i=Number(k);
      if(Number.isInteger(i)&&i>=0&&i<MEALS.length) list[i]=v.meals[k];
    });
  }
  if(list) {
    const meals={};
    list.slice(0,MEALS.length).forEach((m,i)=>{
      if(!m||typeof m!=="object") return;
      const one={};
      if(m.before!=null&&m.before!=="") one.before=clamp15(m.before);
      if(m.after!=null&&m.after!=="") one.after=clamp15(m.after);
      if(m.homeCooked!=null) one.homeCooked=!!m.homeCooked;
      if(typeof m.note==="string"&&m.note.trim()) one.note=m.note.trim().slice(0,280);
      Object.keys(one).forEach(k=>one[k]==null&&delete one[k]);
      if(Object.keys(one).length) meals[i]=one;
    });
    if(Object.keys(meals).length) changes.meals=meals;
  }
  if(v.exercise!=null) {
    const src=typeof v.exercise==="object"?v.exercise:{done:v.exercise};
    const ex={};
    if(src.done!=null) ex.done=!!src.done;
    const kind=typeof src.kind==="string"?KINDS.find(k=>k===src.kind.trim().toLowerCase()):null;
    if(kind){ ex.kind=kind; if(ex.done==null) ex.done=true; }
    if(typeof src.note==="string"&&src.note.trim()) ex.note=src.note.trim().slice(0,280);
    if(Object.keys(ex).length) changes.exercise=ex;
  }
  if(v.custom&&typeof v.custom==="object") {
    const cu={};
    Object.keys(v.custom).forEach(k=>{
      const name=String(k).trim().slice(0,40);
      const val=numish(v.custom[k]);
      if(name&&val!=null) cu[name]=val;
    });
    if(Object.keys(cu).length) changes.custom=cu;
  }
  if(!Object.keys(changes).length) return null;
  return {date,changes};
}
function parsePatch(raw) {
  const text=extractPatchText(raw); if(!text) return null;
  let body=text;
  if(body[0]!=="{") { try{ body=b64decode(body).trim(); }catch(e){ return null; } }
  try{ return normalizePatch(JSON.parse(body)); }catch(e){ return null; }
}
function patchLines(p,entries) {
  const cur=(entries&&entries[p.date])||{};
  const out=[];
  const push=(label,was,now)=>out.push({label,was:was==null||was===""?null:String(was),now:String(now)});
  if(p.changes.weight!=null) push("Weight",cur.weight,p.changes.weight);
  if(p.changes.meals) Object.keys(p.changes.meals).forEach(i=>{
    const m=p.changes.meals[i], c=(cur.meals||[])[i]||{};
    if(m.before!=null) push(MEALS[i]+" · hunger before",c.before,m.before);
    if(m.after!=null) push(MEALS[i]+" · hunger after",c.after,m.after);
    if(m.homeCooked!=null) push(MEALS[i]+" · home cooked",yesno(c.homeCooked),yesno(m.homeCooked));
    if(m.note!=null) push(MEALS[i]+" · note",c.note,m.note);
  });
  if(p.changes.exercise) {
    const c=cur.exercise||{};
    if(p.changes.exercise.done!=null) push("Exercised",yesno(c.done),yesno(p.changes.exercise.done));
    if(p.changes.exercise.kind!=null) push("Exercise · type",c.kind,p.changes.exercise.kind);
    if(p.changes.exercise.note!=null) push("Exercise · note",c.note,p.changes.exercise.note);
  }
  if(p.changes.calories!=null) push("Calories",cur.calories,p.changes.calories);
  if(p.changes.sleep!=null) push("Good sleep last night",yesno(cur.sleep),yesno(p.changes.sleep));
  if(p.changes.meditation!=null) push("Meditated",yesno(cur.meditation),yesno(p.changes.meditation));
  if(p.changes.custom) { const c=cur.custom||{}; Object.keys(p.changes.custom).forEach(k=>push(k,c[k],p.changes.custom[k])); }
  return out;
}

/* ---------------- app ---------------- */
function App() {
  const [,setDayTick] = useState(0);
  const today = iso(new Date());
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState({});
  const [fields, setFields] = useState([]);
  const [selected, setSelected] = useState(today);
  const [tab, setTab] = useState("log");
  const [win, setWin] = useState(14);
  const [newField, setNewField] = useState("");
  const [toast, setToast] = useState("");
  const [pending, setPending] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [dataOpen, setDataOpen] = useState(false);
  const [restorePaste, setRestorePaste] = useState("");
  const [lastExport, setLastExport] = useState(null);
  const store = useRef({ entries:{}, fields:[], lastExport:null });
  const newFieldRef = useRef("");
  const saveTimer = useRef(null);
  const todayRef = useRef(today);

  /* load */
  useEffect(()=>{
    (async()=>{
      const s=await loadState();
      if(s) {
        store.current={ entries:s.entries||{}, fields:s.fields||[], lastExport:s.lastExport||null };
        setEntries(store.current.entries);
        setFields(store.current.fields);
        setLastExport(store.current.lastExport);
      }
      setReady(true);
      if(navigator.storage?.persist) navigator.storage.persisted().then(p=>p||navigator.storage.persist());
    })();
  },[]);

  /* midnight rollover */
  useEffect(()=>{
    const check=()=>{
      const now=iso(new Date());
      if(now===todayRef.current) return;
      const was=todayRef.current; todayRef.current=now;
      setSelected(s=>s===was?now:s);
      setDayTick(t=>t+1);
    };
    const onVisible=()=>{ if(!document.hidden) check(); };
    document.addEventListener("visibilitychange",onVisible);
    window.addEventListener("focus",check);
    const id=setInterval(check,60000);
    return ()=>{ document.removeEventListener("visibilitychange",onVisible); window.removeEventListener("focus",check); clearInterval(id); };
  },[]);

  /* patch intake from share-target / deep link */
  useEffect(()=>{
    if(!ready) return;
    let raw=null;
    try {
      const q=new URLSearchParams(location.search);
      raw=q.get("patch")||q.get("text")||q.get("title")||q.get("url");
      if(!raw&&location.hash) { const h=new URLSearchParams(location.hash.slice(1)); raw=h.get("patch"); }
    } catch(e){}
    if(!raw) return;
    try{ history.replaceState(null,"",location.pathname); }catch(e){}
    const p=parsePatch(raw);
    if(p) setPending({patch:p});
    else showToast("That didn't look like a patch for this log");
  },[ready]);

  /* save */
  const scheduleSave = (state) => {
    clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>saveState(state),600);
  };

  const apply = (fn) => {
    const next=fn(store.current);
    store.current=next;
    setEntries({...next.entries});
    setFields([...next.fields]);
    setLastExport(next.lastExport);
    scheduleSave(next);
  };
  const patch = (partial) => apply(s=>({...s,entries:{...s.entries,[selected]:{...s.entries[selected],...partial}}}));
  const patchMeal = (i,partial) => apply(s=>{
    const meals=[...(s.entries[selected]?.meals||[])];
    meals[i]={...(meals[i]||{}),...partial};
    return {...s,entries:{...s.entries,[selected]:{...s.entries[selected],meals}}};
  });

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(""),2800); };

  /* tapeDates */
  const tapeDates = useMemo(()=>Array.from({length:14},(_,i)=>shift(today,i-13)),[today]);

  /* series */
  const series = useMemo(()=>{
    const dates=Array.from({length:win},(_,i)=>shift(today,i-win+1));
    const rows=dates.map(d=>{
      const e=entries[d]||{};
      const meals=e.meals||[];
      const logged=!!(e.weight||e.calories||meals.length||e.exercise||e.sleep!=null||e.meditation!=null);
      return {
        date:d, label:shortDate(d), logged,
        weight:num(e.weight),
        calories:num(e.calories),
        homeCooked:meals.some(m=>m&&m.homeCooked)?meals.filter(m=>m&&m.homeCooked).length:(logged?0:null),
        exercised:didExercise(e)?1:0,
        kind:e.exercise?.kind||null,
        sleep:e.sleep?1:0,
        meditation:e.meditation?1:0,
        custom:e.custom||{},
      };
    });
    const weightAt=(d)=>{ const e=entries[d]; return e&&e.weight!==""&&e.weight!=null?num(e.weight):null; };
    const ma=(r,span)=>{ const vals=[]; for(let k=0;k<span;k++){ const v=weightAt(shift(r.date,-k)); if(v!=null) vals.push(v); } return vals.length?Number((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2)):null; };
    rows.forEach(r=>{ r.ma=ma(r,7); r.ma14=ma(r,14); });
    rows.habits=HABITS.map(h=>({...h,done:rows.filter(r=>r[h.key]===1).length,of:rows.length}));
    rows.kinds=[...KINDS,"unspecified"].map(k=>({kind:k,color:KIND_COLOR[k],n:rows.filter(r=>r.exercised===1&&(r.kind||"unspecified")===k).length})).filter(x=>x.n);
    rows.exDone=rows.filter(r=>r.exercised===1).length;
    return rows;
  },[entries,win,today]);

  const slotSeries=useMemo(()=>MEALS.map((_,i)=>series.map(r=>{
    const m=((entries[r.date]||{}).meals||[])[i]||{};
    return {label:r.label,before:m.before?Number(m.before):null,after:m.after?Number(m.after):null};
  })),[series,entries]);

  const has=(k)=>series.some(r=>r[k]!=null);

  /* trend */
  const trend=useMemo(()=>{
    const ws=series.filter(r=>r.weight!=null);
    if(ws.length<2) return null;
    return (ws[ws.length-1].weight-ws[0].weight).toFixed(1);
  },[series]);

  /* fields */
  const addField=()=>{
    const name=newFieldRef.current.trim();
    if(!name||fields.includes(name)) return;
    apply(s=>({...s,fields:[...s.fields,name]}));
    setNewField(""); newFieldRef.current="";
  };
  const removeField=(name)=>apply(s=>({...s,fields:s.fields.filter(f=>f!==name)}));

  /* entry for selected day */
  const entry=entries[selected]||{};

  /* patch apply */
  const applyPatch=(p)=>{
    apply(s=>{
      const cur=s.entries[p.date]||{};
      const next={...cur};
      ["weight","calories","sleep","meditation"].forEach(k=>{ if(p.changes[k]!=null) next[k]=p.changes[k]; });
      if(p.changes.meals){ const meals=[...(cur.meals||[])]; Object.keys(p.changes.meals).forEach(i=>{ meals[i]={...(meals[i]||{}),...p.changes.meals[i]}; }); next.meals=meals; }
      if(p.changes.exercise) next.exercise={...(cur.exercise||{}),...p.changes.exercise};
      if(p.changes.custom) next.custom={...(cur.custom||{}),...p.changes.custom};
      const added=p.changes.custom?Object.keys(p.changes.custom).filter(k=>!s.fields.includes(k)):[];
      return {...s,entries:{...s.entries,[p.date]:next},fields:added.length?[...s.fields,...added]:s.fields};
    });
    setSelected(p.date);
    setPending(null); setPasteOpen(false); setPasteText("");
    showToast("Applied to "+shortDate(p.date));
  };
  const readPaste=()=>{ const p=parsePatch(pasteText); if(p) setPending({patch:p}); else showToast("Couldn't read that as a patch"); };

  /* export / import */
  const exportData=async()=>{
    try {
      await exportTrackingData({
        entries:store.current.entries,
        fields:store.current.fields,
        date:today
      });
      apply(s=>({...s,lastExport:today}));
      showToast("Export ready");
    } catch(e) {
      showToast(e?.name==="AbortError"?"Export cancelled":"Export failed");
    }
  };
  const importData=()=>{
    if(!restorePaste.trim()) return;
    try {
      const v=JSON.parse(restorePaste);
      const merged={...store.current.entries};
      Object.keys(v.entries||{}).forEach(d=>{ if(!merged[d]) merged[d]=v.entries[d]; });
      apply(s=>({...s,entries:merged,fields:v.fields||s.fields}));
      setRestorePaste(""); setDataOpen(false);
      showToast("Imported");
    } catch(e){ showToast("Couldn't parse that backup"); }
  };

  if(!ready) return html`<div style="padding:32px;text-align:center;font-family:${SANS};color:${C.muted}">Loading…</div>`;

  const inputStyle=`font-family:${MONO};font-size:14px;padding:10px 12px;border:1px solid ${C.rule};border-radius:2px;background:#fff;color:${C.ink};width:100%`;
  const textareaStyle=`${inputStyle};font-family:${SANS};font-size:13px;resize:vertical`;

  return html`<div style="max-width:480px;margin:0 auto;padding-bottom:80px">

    <!-- tape -->
    <${Tape} dates=${tapeDates} entries=${entries} selected=${selected} onSelect=${setSelected}/>

    <!-- tabs -->
    <div style="display:flex;border-bottom:1px solid ${C.rule};margin-bottom:12px">
      ${["log","review"].map(t=>html`<button
        style="flex:1;font-family:${MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;padding:12px;background:none;border:none;border-bottom:2px solid ${tab===t?C.ink:"transparent"};color:${tab===t?C.ink:C.muted};cursor:pointer"
        onClick=${()=>setTab(t)}>${t}</button>`)}
    </div>

    ${tab==="log"?html`

      <!-- weight -->
      <${Card}>
        <${Field} label="Weight">
          <input type="number" inputmode="decimal" value=${entry.weight??""} onInput=${e=>patch({weight:e.target.value})} placeholder="—" style=${inputStyle}/>
        <//>
      <//>

      <!-- today -->
      <${Card}>
        <${Eyebrow} style="margin-bottom:10px">Today<//>
        <${Check} label="Good sleep last night" checked=${!!entry.sleep} onChange=${v=>patch({sleep:v})}/>
        <${Check} label="Meditated" checked=${!!entry.meditation} onChange=${v=>patch({meditation:v})}/>
      <//>

      <!-- meals -->
      ${MEALS.map((name,i)=>{
        const m=(entry.meals||[])[i]||{};
        return html`<${Card} key=${name}>
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid ${C.faint}">
            <${Eyebrow}>${name}<//>
            <span style="font-family:${MONO};font-size:10px;color:${C.rule}">hunger 1 low · 5 high</span>
          </div>
          <${Field} label="Hunger before">
            <${Chips} value=${m.before??null} onChange=${v=>patchMeal(i,{before:v})} color=${C.flag}/>
          <//>
          <${Field} label="Hunger after">
            <${Chips} value=${m.after??null} onChange=${v=>patchMeal(i,{after:v})} color=${C.flag}/>
          <//>
          <${Check} label="Home cooked" checked=${!!m.homeCooked} onChange=${v=>patchMeal(i,{homeCooked:v})}/>
          <textarea value=${m.note??""} onInput=${e=>patchMeal(i,{note:e.target.value})} placeholder="what it was (optional)" rows="1" style=${textareaStyle}></textarea>
        <//>`;
      })}

      <!-- exercise -->
      <${Card}>
        <${Check} label="Exercised" checked=${!!entry.exercise?.done}
          onChange=${v=>patch({exercise:v?{...(entry.exercise||{}),done:true}:{done:false}})}/>
        ${entry.exercise?.done?html`
          <${Field} label="Type">
            <${Segmented} options=${KINDS} value=${entry.exercise?.kind??null}
              onChange=${v=>patch({exercise:{...(entry.exercise||{}),kind:v}})}/>
          <//>
          <textarea value=${entry.exercise?.note??""} onInput=${e=>patch({exercise:{...(entry.exercise||{}),note:e.target.value}})}
            placeholder="what you did (optional)" rows="1" style=${textareaStyle}></textarea>
        `:""}
      <//>

      <!-- calories -->
      <${Card}>
        <${Field} label="Calories" hint="optional">
          <input type="number" inputmode="numeric" value=${entry.calories??""} onInput=${e=>patch({calories:e.target.value})} placeholder="—" style=${inputStyle}/>
        <//>
      <//>

      <!-- custom fields -->
      <${Card}>
        <${Eyebrow} style="margin-bottom:10px">Your own metrics<//>
        ${fields.map(f=>html`<${Field} label=${f} key=${f}>
          <div style="display:flex;gap:8px">
            <input type="number" inputmode="decimal" value=${entry.custom?.[f]??""} onInput=${e=>patch({custom:{...(entry.custom||{}),[f]:e.target.value}})} placeholder="—" style=${inputStyle}/>
            <button onClick=${()=>removeField(f)} style="font-family:${MONO};font-size:11px;padding:0 12px;background:none;border:1px solid ${C.rule};border-radius:2px;color:${C.muted};cursor:pointer;white-space:nowrap">Remove</button>
          </div>
        <//>` )}
        <div style="display:flex;gap:8px;margin-top:8px">
          <input value=${newField} onInput=${e=>{setNewField(e.target.value);newFieldRef.current=e.target.value;}} placeholder="new metric name" style=${inputStyle}/>
          <button onClick=${addField} style="font-family:${MONO};font-size:11px;padding:0 16px;background:${C.ink};color:${C.paper};border:none;border-radius:2px;cursor:pointer;white-space:nowrap">Add</button>
        </div>
      <//>

    `:html`

      <!-- review tab -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        ${[[14,"14d"],[30,"1mo"],[90,"3mo"]].map(([n,lbl])=>html`<button
          onClick=${()=>setWin(n)}
          style="font-family:${MONO};font-size:11px;padding:7px 14px;border:1px solid ${win===n?C.signal:C.rule};color:${win===n?C.signal:C.muted};background:transparent;border-radius:2px;cursor:pointer"
        >${lbl}</button>`)}
      </div>

      <!-- weight -->
      <${Card}>
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
          <${Eyebrow}>Weight · moving averages<//>
          ${trend!=null?html`<span style="font-family:${MONO};font-size:12px;color:${C.ink}">${trend>0?"+":""}${trend} over ${win}d</span>`:""}
        </div>
        ${has("weight")?html`
          <${LineChart} rows=${series} lines=${[
            {key:"weight",color:C.rule,width:1,dots:true},
            {key:"ma",color:C.signal,width:2},
            {key:"ma14",color:C.ink,width:2.5},
          ]} domain=${null} height=${190}/>
          <${Legend} items=${[["logged",C.rule],["7-day avg",C.signal],["14-day avg",C.ink]]}/>
        `:html`<${Empty}>Log a weight and the average draws itself.<//>` }
      <//>

      <!-- exercise by type -->
      <${Card}>
        <${Eyebrow} style="margin-bottom:12px">Exercise · type by day<//>
        <${BarChart} rows=${series} dataKey="exercised" height=${130}
          domain=${[0,1]}
          colorFn=${r=>KIND_COLOR[r.kind||"unspecified"]}/>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px">
          <span style="font-family:${MONO};font-size:10px;color:${C.muted}">${series.exDone}/${series.length} days</span>
          ${series.kinds.map(k=>html`<span style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;background:${k.color};display:block;border-radius:1px"></span>
            <span style="font-family:${MONO};font-size:10px;color:${C.muted}">${k.kind} <span style="color:${C.ink}">${k.n}</span></span>
          </span>`)}
        </div>
      <//>

      <!-- sleep & meditation -->
      <${Card}>
        <${Eyebrow} style="margin-bottom:12px">Sleep &amp; meditation<//>
        <${StackedBarChart} rows=${series} keys=${["sleep","meditation"]} colors=${HABITS.map(h=>h.color)} height=${130} domain=${[0,2]}/>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px">
          ${series.habits.map(h=>html`<span style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;background:${h.color};display:block;border-radius:1px"></span>
            <span style="font-family:${MONO};font-size:10px;color:${C.muted}">${h.label} <span style="color:${C.ink}">${h.done}/${h.of}</span></span>
          </span>`)}
        </div>
      <//>

      <!-- hunger per meal -->
      ${MEALS.map((name,i)=>{
        const data=slotSeries[i];
        const any=data.some(r=>r.before!=null||r.after!=null);
        return html`<${Card} key=${name}>
          <${Eyebrow} style="margin-bottom:12px">${name} · hunger<//>
          ${any?html`
            <${LineChart} rows=${data} lines=${[
              {key:"before",color:C.flag,width:2},
              {key:"after",color:C.signal,width:2,dash:"3 3"},
            ]} domain=${[1,5]} ticks=${[1,3,5]} height=${140}/>
            ${i===MEALS.length-1?html`<${Legend} items=${[["before",C.flag],["after",C.signal]]}/>`:""}`
          :html`<${Empty}>Rate hunger on ${name.toLowerCase()} to start this one.<//>` }
        <//>`;
      })}

      <!-- home cooked -->
      <${Card}>
        <${Eyebrow} style="margin-bottom:12px">Home-cooked meals · per day<//>
        ${has("homeCooked")?html`<${BarChart} rows=${series} dataKey="homeCooked" color=${C.signal} height=${140} domain=${[0,3]}/>`
          :html`<${Empty}>Tick "home cooked" on a meal to start this one.<//>` }
      <//>

      <!-- calories -->
      <${Card}>
        <${Eyebrow} style="margin-bottom:12px">Calories<//>
        ${has("calories")?html`<${LineChart} rows=${series} lines=${[{key:"calories",color:C.flag,width:2,dots:true}]} height=${140}/>`
          :html`<${Empty}>Optional — leave it blank on days you'd rather not count.<//>` }
      <//>

      <!-- custom -->
      ${fields.map(f=>{
        const data=series.map(r=>({label:r.label,v:num(r.custom?.[f])}));
        if(!data.some(d=>d.v!=null)) return null;
        return html`<${Card} key=${f}>
          <${Eyebrow} style="margin-bottom:12px">${f}<//>
          <${LineChart} rows=${data} lines=${[{key:"v",color:C.signal,width:2,dots:true}]} height=${140}/>
        <//>`;
      })}

    `}

    <!-- footer -->
    <div style="position:fixed;bottom:0;left:0;right:0;background:${C.paper};border-top:1px solid ${C.rule};padding:10px 16px calc(10px + env(safe-area-inset-bottom));display:flex;gap:8px;justify-content:flex-end">
      <button onClick=${()=>{setPasteOpen(v=>!v);setDataOpen(false);}}
        style="font-family:${MONO};font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:8px 12px;background:${pasteOpen?C.ink:"none"};color:${pasteOpen?C.paper:C.muted};border:1px solid ${pasteOpen?C.ink:C.rule};border-radius:2px;cursor:pointer">
        ${pasteOpen?"Close":"Paste entry"}
      </button>
      <button onClick=${exportData}
        style="font-family:${MONO};font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:8px 12px;background:none;border:1px solid ${C.rule};border-radius:2px;color:${C.muted};cursor:pointer">
        Export
      </button>
      <button onClick=${()=>{setDataOpen(v=>!v);setPasteOpen(false);}}
        style="font-family:${MONO};font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:8px 12px;background:${dataOpen?C.ink:"none"};color:${dataOpen?C.paper:C.muted};border:1px solid ${dataOpen?C.ink:C.rule};border-radius:2px;cursor:pointer">
        ${dataOpen?"Close":"Import"}
      </button>
    </div>

    <!-- paste entry panel -->
    ${pasteOpen?html`<${Card} style="margin-bottom:20px">
      <${Eyebrow} style="margin-bottom:8px">Paste an entry for one day<//>
      <p style="font-family:${SANS};font-size:12px;color:${C.muted};margin:0 0 10px">Merges into that day — only the fields you name change.</p>
      <textarea rows="4" value=${pasteText} onInput=${e=>setPasteText(e.target.value)}
        placeholder=${'{"date":"'+today+'","weight":"180"}'}
        style=${textareaStyle+";margin-bottom:10px"}></textarea>
      <button onClick=${readPaste}
        style="font-family:${MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;padding:10px 16px;width:100%;background:${pasteText.trim()?C.ink:C.faint};color:${pasteText.trim()?C.paper:C.muted};border:none;border-radius:2px;cursor:${pasteText.trim()?"pointer":"default"}">
        Read it
      </button>
    <//>` :""}

    <!-- import/restore panel -->
    ${dataOpen?html`<${Card} style="margin-bottom:20px">
      <${Eyebrow} style="margin-bottom:8px">Restore from backup<//>
      <p style="font-family:${SANS};font-size:12px;color:${C.muted};margin:0 0 10px">Paste a previously exported JSON. Days already in the app take priority.</p>
      <textarea rows="5" value=${restorePaste} onInput=${e=>setRestorePaste(e.target.value)}
        placeholder='{"entries":{…},"fields":[]}'
        style=${textareaStyle+";margin-bottom:10px"}></textarea>
      <button onClick=${importData}
        style="font-family:${MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;padding:10px 16px;width:100%;background:${restorePaste.trim()?C.ink:C.faint};color:${restorePaste.trim()?C.paper:C.muted};border:none;border-radius:2px;cursor:${restorePaste.trim()?"pointer":"default"}">
        Restore
      </button>
    <//>` :""}

    <!-- confirmation sheet -->
    ${pending?html`<div style="position:fixed;inset:0;background:rgba(16,27,36,0.55);display:flex;align-items:flex-end;z-index:40">
      <div style="background:${C.paper};width:100%;max-height:82vh;overflow-y:auto;padding:20px 18px calc(20px + env(safe-area-inset-bottom));border-radius:10px 10px 0 0">
        <${Eyebrow}>Entry to apply<//>
        <h2 style="font-family:${MONO};font-size:22px;margin:4px 0 6px;color:${C.ink}">${shortDate(pending.patch.date)}</h2>
        ${(()=>{
          const lines=patchLines(pending.patch,entries);
          const over=lines.filter(l=>l.was!=null).length;
          return html`
            <p style="font-family:${SANS};font-size:13px;color:${C.muted};margin:0 0 14px">
              ${over?`${over} ${over===1?"value":"values"} already logged here would be replaced.`:"Nothing logged on this day yet."}
            </p>
            <div style="border-top:1px solid ${C.rule}">
              ${lines.map((l,i)=>html`<div key=${i} style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid ${C.faint};font-size:14px">
                <span style="font-family:${SANS};color:${C.muted}">${l.label}</span>
                <span style="font-family:${MONO};text-align:right;word-break:break-word;color:${C.ink}">
                  ${l.was!=null?html`<s style="color:${C.muted}">${l.was}</s><span style="margin:0 6px;color:${C.muted}">→</span>`:""}${l.now}
                </span>
              </div>`)}
            </div>`;
        })()}
        <div style="display:flex;gap:10px;margin-top:18px">
          <button onClick=${()=>setPending(null)} style="flex:1;font-family:${MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;padding:12px 14px;background:none;color:${C.muted};border:1px solid ${C.rule};border-radius:2px;cursor:pointer">Discard</button>
          <button onClick=${()=>applyPatch(pending.patch)} style="flex:1.4;font-family:${MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;padding:12px 14px;background:${C.ink};color:${C.paper};border:none;border-radius:2px;cursor:pointer">Apply</button>
        </div>
      </div>
    </div>`:""}

    <!-- toast -->
    ${toast?html`<div class="toast">${toast}</div>`:""}

  </div>`;
}

render(html`<${App}/>`, document.getElementById("app"));
