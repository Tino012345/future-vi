import { useState, useEffect, useRef, useCallback } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  RadialBarChart, RadialBar, Legend,
} from "recharts";

// ══════════════════════════════════════════════
//  API — proxy intégré claude.ai (pas de CORS)
// ══════════════════════════════════════════════
async function askClaude(system, user, maxTokens = 1600) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try { const j = await res.json(); msg = j?.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const d = await res.json();
  const text = (d.content || []).map(b => b.text || "").join("").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    throw new Error("Réponse invalide — réessaie.");
  }
}

// ══════════════════════════════════════════════
//  PROMPTS
// ══════════════════════════════════════════════
function promptAnalyze(idea, isFR) {
  const lang = isFR ? "Français" : "English";
  const sys = `Tu es un Auditeur Marché Senior, brutal et honnête. Langue: ${lang}.
Verdict: RENTABLE | A_AJUSTER | NON_RENTABLE.
viabilityScore: 0-100 (sois avare, >80 = exceptionnel).
trendScore: 0-100 momentum actuel. trendDirection: UP|DOWN|STABLE.
Réponds UNIQUEMENT en JSON valide sans markdown ni texte avant/après.
Structure EXACTE (ne rien omettre):
{"verdict":"RENTABLE","viabilityScore":68,"justification":"2 phrases.","microNiche":"niche","productFormat":"SaaS","globalMarkets":["USA","Europe","Asie"],"risks":["risque1","risque2","risque3"],"pricing":{"xaf":"15000 XAF","usd":"$27","eur":"25€"},"radarScores":{"market":70,"competition":55,"monetization":65,"execution":60,"timing":72,"innovation":58},"trendScore":65,"trendDirection":"UP","trendInsights":["Signal 1","Signal 2","Signal 3"],"revenueEstimate":{"low":"$200/mois","mid":"$1200/mois","high":"$5000/mois","timeToFirst":"2-3 mois"},"actionPlan":[{"step":1,"title":"Titre","description":"Description."}],"competitors":[{"name":"Concurrent1","url":"concurrent1.com","strength":"Ce qu'ils font bien","weakness":"Faiblesse exploitable","marketShare":"30%"},{"name":"Concurrent2","url":"concurrent2.com","strength":"Force","weakness":"Faiblesse","marketShare":"20%"},{"name":"Concurrent3","url":"concurrent3.com","strength":"Force","weakness":"Faiblesse","marketShare":"15%"}],"feasibility":{"budgetMin":"500€","budgetIdeal":"2000€","skills":["Skill1","Skill2","Skill3"],"timeToLaunch":"6-8 semaines","difficulty":65,"score":72,"breakdown":{"technical":60,"financial":75,"time":70,"expertise":65}},"marketing":{"channels":[{"name":"Instagram Reels","roi":"Élevé","budget":"50€/mois","why":"Courte explication"},{"name":"SEO Blog","roi":"Moyen","budget":"0€ (temps)","why":"Courte explication"},{"name":"Email Marketing","roi":"Très élevé","budget":"20€/mois","why":"Courte explication"}],"hooks":["Hook viral 1","Hook viral 2","Hook viral 3"],"monthlyAdBudget":"200€","targetingTips":"Conseil ciblage publicitaire en 1-2 phrases."}}`;
  return { sys, user: `Idée: "${idea}"` };
}

function promptRoadmap(idea, isFR) {
  const lang = isFR ? "Français" : "English";
  const sys = `Tu es un Coach de Lancement Produit expert. Crée un plan de lancement sur 90 jours, semaine par semaine. Langue: ${lang}.
Réponds UNIQUEMENT en JSON valide:
{"title":"Roadmap: [nom]","tagline":"Phrase d'accroche du plan","weeks":[{"week":1,"theme":"Thème semaine","focus":"RESEARCH|BUILD|LAUNCH|GROW","tasks":["Tâche 1","Tâche 2","Tâche 3"],"milestone":"Livrable clé","kpi":"Métrique à atteindre","effort":"LOW|MEDIUM|HIGH"},{"week":2,"theme":"...","focus":"BUILD","tasks":["..."],"milestone":"...","kpi":"...","effort":"HIGH"}],"phases":[{"name":"Phase 1 — Fondations","weeks":"1-4","color":"#60a5fa","goal":"Objectif phase"},{"name":"Phase 2 — Construction","weeks":"5-8","color":"#a78bfa","goal":"Objectif phase"},{"name":"Phase 3 — Lancement","weeks":"9-12","color":"#10b981","goal":"Objectif phase"}],"resources":{"budget":"Budget total estimé","tools":["Outil1","Outil2","Outil3"],"skills":["Compétence1","Compétence2"]},"successMetrics":["KPI 1","KPI 2","KPI 3"]}
Génère exactement 12 semaines.`;
  return { sys, user: `Idée/Produit: "${idea}"` };
}

function promptPivot(idea, verdict, isFR) {
  const lang = isFR ? "Français" : "English";
  const sys = `Stratège Business Créatif. L'idée "${idea}" a eu le verdict ${verdict}. Génère 3 pivots rentables dans le même domaine. Langue: ${lang}.
Réponds UNIQUEMENT en JSON valide:
{"pivots":[{"title":"Nom","tagline":"Accroche courte","whyBetter":"Explication","format":"Format","targetAudience":"Cible","estimatedScore":78,"keyChange":"Ce qui change"}]}`;
  return { sys, user: `Génère 3 pivots pour: "${idea}"` };
}

function promptHunt(niche, type, difficulty, budget, isFR) {
  const lang = isFR ? "Français" : "English";
  const sys = `Expert Product Hunter. Trouve 5-6 produits à fort potentiel. Diversité obligatoire. Langue: ${lang}.
Réponds UNIQUEMENT en JSON valide (structure exacte):
{"marketOverview":"2 phrases d'analyse.","suggestions":[{"name":"Nom","type":"PHYSICAL","productFormat":"Format","demandScore":78,"competitionLevel":"MEDIUM","targetAudience":"Cible","sellingPrice":"$29-79","estimatedCost":"$5","profitMargin":"75%","marketingHook":"Accroche","sourcingDifficulty":"EASY","sourcingAdvice":"Conseil","marketTrend":"UP","monthlySearchVolume":"10k-50k/mois","launchSpeed":{"score":82,"daysToFirstSale":14,"steps":["Étape 1 (J1-3)","Étape 2 (J4-7)","Étape 3 (J8-14)"],"mainBlocker":"Principal obstacle","quickWin":"Action immédiate à faire aujourd'hui"},"countryAnalysis":[{"country":"Sénégal","flag":"🇸🇳","potential":72,"currency":"XOF","avgPrice":"12000 XOF","competition":"FAIBLE","tip":"Conseil spécifique"},{"country":"France","flag":"🇫🇷","potential":65,"currency":"EUR","avgPrice":"35€","competition":"ÉLEVÉE","tip":"Conseil spécifique"},{"country":"USA","flag":"🇺🇸","potential":80,"currency":"USD","avgPrice":"$49","competition":"MOYENNE","tip":"Conseil spécifique"}]}]}`;
  return { sys, user: `Niche: "${niche}". Type: ${type}. Difficulté: ${difficulty}. Budget: ${budget}.` };
}

// ══════════════════════════════════════════════
//  PARTICLES
// ══════════════════════════════════════════════
function Particles({ level, dark }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const W = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    W();
    const n = [0,45,110,200,320][Math.min(level,4)];
    const rain = level === 4;
    let pts = Array.from({length:n}, () => ({
      x: Math.random()*canvas.width, y: Math.random()*canvas.height,
      r: rain ? Math.random()*12+7 : Math.random()*1.6+0.3,
      vx: (Math.random()-0.5)*(rain?0.3:0.5),
      vy: rain ? Math.random()*16+8 : Math.random()*(level*0.35)+0.15,
      o: Math.random()*0.4+0.08,
    }));
    // Mode sombre: blanc | Mode clair: bleu-indigo bien visible
    const [pR,pG,pB] = dark ? [255,255,255] : [79,70,229];
    const opMult = dark ? 1 : 3.2;
    function draw() {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      pts.forEach(p => {
        const a = Math.min(1, p.o * opMult);
        if (rain) {
          ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x+p.vx*2,p.y+p.r);
          ctx.strokeStyle=`rgba(${pR},${pG},${pB},${a*.6})`; ctx.lineWidth=1.2; ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
          ctx.fillStyle=`rgba(${pR},${pG},${pB},${a})`; ctx.fill();
        }
        p.x+=p.vx; p.y+=p.vy;
        if(p.y>canvas.height){p.y=-p.r; p.x=Math.random()*canvas.width;}
        if(p.x<0)p.x=canvas.width; if(p.x>canvas.width)p.x=0;
      });
      raf=requestAnimationFrame(draw);
    }
    if(n>0) draw();
    const onR=()=>{W(); pts=pts.map(p=>({...p,x:Math.random()*canvas.width,y:Math.random()*canvas.height}));};
    window.addEventListener("resize",onR);
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener("resize",onR); };
  }, [level, dark]);
  return <canvas ref={ref} style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}} />;
}

// ══════════════════════════════════════════════
//  3D LOGOS
// ══════════════════════════════════════════════
function Logo3DAnalyzer({size=42}) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <defs>
        <linearGradient id="lg-at" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#7dd3fc"/><stop offset="100%" stopColor="#1d4ed8"/></linearGradient>
        <linearGradient id="lg-ar" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#1e3a8a"/><stop offset="100%" stopColor="#1e3268"/></linearGradient>
        <radialGradient id="lg-ac" cx="50%" cy="35%" r="60%"><stop offset="0%" stopColor="#93c5fd" stopOpacity=".9"/><stop offset="100%" stopColor="#2563eb" stopOpacity=".6"/></radialGradient>
        <linearGradient id="lg-as" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="white" stopOpacity=".5"/><stop offset="100%" stopColor="white" stopOpacity="0"/></linearGradient>
      </defs>
      <ellipse cx="22" cy="41.5" rx="12" ry="2.2" fill="rgba(59,130,246,.22)"/>
      <polygon points="30,10 38,15 38,32 30,27" fill="url(#lg-ar)"/>
      <polygon points="8,15 8,32 22,32 22,15" fill="#1a3272"/>
      <polygon points="8,15 16,10 30,10 38,15 30,20 16,20" fill="url(#lg-at)"/>
      <polygon points="8,15 16,10 30,10 38,15 30,16.5 16,16.5" fill="url(#lg-as)"/>
      <polygon points="8,15 22,15 30,20 30,27 22,32 8,32" fill="#1e3a8a"/>
      <rect x="11" y="18" width="14" height="11" rx="1.5" fill="url(#lg-ac)"/>
      <rect x="13.5" y="20" width="9" height="7" rx="1" fill="#1d4ed8" opacity=".7"/>
      {[21.5,23.5,25.5].map((y,i)=><line key={i} x1="14" y1={y} x2="22" y2={y} stroke="#93c5fd" strokeWidth=".7" opacity=".7"/>)}
      {[19.5,21.5,23.5,25.5].map((y,i)=><line key={`l${i}`} x1="9" y1={y} x2="11" y2={y} stroke="#60a5fa" strokeWidth="1" strokeLinecap="round"/>)}
      {[19.5,21.5,23.5,25.5].map((y,i)=><line key={`r${i}`} x1="25" y1={y} x2="27" y2={y} stroke="#60a5fa" strokeWidth="1" strokeLinecap="round"/>)}
      {[13,17,21].map((x,i)=><line key={`t${i}`} x1={x} y1="16" x2={x} y2="18" stroke="#60a5fa" strokeWidth="1" strokeLinecap="round"/>)}
      <circle cx="13" cy="12.5" r=".8" fill="#bfdbfe"/><circle cx="17" cy="11.5" r=".8" fill="#bfdbfe"/><circle cx="22" cy="11.5" r=".8" fill="#bfdbfe"/>
      <polygon points="8,15 16,10 30,10 38,15 30,20 16,20" fill="none" stroke="rgba(147,197,253,.35)" strokeWidth=".6"/>
      <polygon points="8,15 22,15 30,20 30,27 22,32 8,32" fill="none" stroke="rgba(96,165,250,.2)" strokeWidth=".5"/>
      <polygon points="30,10 38,15 38,32 30,27" fill="none" stroke="rgba(59,130,246,.2)" strokeWidth=".5"/>
    </svg>
  );
}

function Logo3DHunter({size=42}) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <defs>
        <linearGradient id="lg-ht" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#c4b5fd"/><stop offset="100%" stopColor="#6d28d9"/></linearGradient>
        <linearGradient id="lg-hr" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#4c1d95"/><stop offset="100%" stopColor="#3b0764"/></linearGradient>
        <radialGradient id="lg-hstar" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#f0abfc"/><stop offset="100%" stopColor="#a855f7"/></radialGradient>
        <linearGradient id="lg-hs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="white" stopOpacity=".45"/><stop offset="100%" stopColor="white" stopOpacity="0"/></linearGradient>
      </defs>
      <ellipse cx="22" cy="41.5" rx="12" ry="2.2" fill="rgba(139,92,246,.22)"/>
      <polygon points="30,10 38,15 38,32 30,27" fill="url(#lg-hr)"/>
      <polygon points="8,15 8,32 22,32 22,15" fill="#3b0764"/>
      <polygon points="8,15 16,10 30,10 38,15 30,20 16,20" fill="url(#lg-ht)"/>
      <polygon points="8,15 16,10 30,10 38,15 30,16.8 16,16.8" fill="url(#lg-hs)"/>
      <polygon points="8,15 22,15 30,20 30,27 22,32 8,32" fill="#4c1d95"/>
      <circle cx="17" cy="23" r="5.5" fill="none" stroke="#a78bfa" strokeWidth="1.4"/>
      <circle cx="17" cy="23" r="1.8" fill="#c4b5fd" opacity=".8"/>
      <line x1="21" y1="27" x2="24.5" y2="30.5" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round"/>
      <g transform="translate(22,18)"><polygon points="0,-2.8 0.6,-0.6 2.8,0 0.6,0.6 0,2.8 -0.6,0.6 -2.8,0 -0.6,-0.6" fill="url(#lg-hstar)"/></g>
      <circle cx="16" cy="11.5" r=".9" fill="#e9d5ff"/><circle cx="20" cy="10.5" r=".9" fill="#e9d5ff"/><circle cx="24" cy="11.5" r=".9" fill="#e9d5ff"/>
      <polygon points="8,15 16,10 30,10 38,15 30,20 16,20" fill="none" stroke="rgba(196,181,253,.4)" strokeWidth=".6"/>
      <polygon points="8,15 22,15 30,20 30,27 22,32 8,32" fill="none" stroke="rgba(167,139,250,.2)" strokeWidth=".5"/>
      <polygon points="30,10 38,15 38,32 30,27" fill="none" stroke="rgba(139,92,246,.2)" strokeWidth=".5"/>
    </svg>
  );
}

// ══════════════════════════════════════════════
//  LOGO 3D ROADMAP
// ══════════════════════════════════════════════
function Logo3DRoadmap({size=42}) {
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" fill="none">
      <rect x="5" y="7" width="32" height="28" rx="4" fill="rgba(16,185,129,.14)" stroke="rgba(16,185,129,.45)" strokeWidth="1.4"/>
      <line x1="5" y1="13" x2="37" y2="13" stroke="rgba(16,185,129,.4)" strokeWidth="1"/>
      <circle cx="10" cy="10" r="1.4" fill="#10b981"/>
      <circle cx="14.5" cy="10" r="1.4" fill="#34d399"/>
      <circle cx="19" cy="10" r="1.4" fill="#6ee7b7"/>
      <rect x="10" y="18" width="8" height="3" rx="1.5" fill="rgba(16,185,129,.6)"/>
      <rect x="10" y="23.5" width="14" height="3" rx="1.5" fill="rgba(52,211,153,.5)"/>
      <rect x="10" y="29" width="6" height="3" rx="1.5" fill="rgba(110,231,183,.4)"/>
      <polyline points="26,29 29,24 32,27 35,19" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="35" cy="19" r="2" fill="#10b981"/>
    </svg>
  );
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
const C = { card:"rgba(17,20,66,.8)", bdr:"rgba(53,61,122,.55)", sub:"rgba(255,255,255,.04)", subBdr:"rgba(53,61,122,.4)" };
const sc = v => v>=75?"#10b981":v>=50?"#f59e0b":"#ef4444";
const tc = t => t==="UP"?"#10b981":t==="DOWN"?"#ef4444":"#60a5fa";
const DC = v => v==="LOW"||v==="EASY" ? {bg:"rgba(16,185,129,.1)",bd:"rgba(16,185,129,.3)",col:"#10b981"}
              : v==="MEDIUM"          ? {bg:"rgba(245,158,11,.1)",bd:"rgba(245,158,11,.3)",col:"#f59e0b"}
                                      : {bg:"rgba(239,68,68,.1)",bd:"rgba(239,68,68,.3)",col:"#ef4444"};
const fmtM = n => n>=1000?`$${(n/1000).toFixed(1)}k`:`$${n}`;

// ══════════════════════════════════════════════
//  SCORE ARC
// ══════════════════════════════════════════════
function ScoreArc({score,c1,c2}) {
  const r=50,cx=74,cy=74,arc=2*Math.PI*r*.75;
  const off = arc-(score/100)*arc;
  const pt = deg => { const a=(deg-90)*Math.PI/180; return {x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)}; };
  const s=pt(135),e=pt(405),C2=2*Math.PI*r;
  return (
    <svg width="148" height="148" viewBox="0 0 148 148">
      <defs><linearGradient id="sarc" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor={c1}/><stop offset="100%" stopColor={c2}/>
      </linearGradient></defs>
      <path d={`M${s.x} ${s.y} A${r} ${r} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" strokeLinecap="round"/>
      <path d={`M${s.x} ${s.y} A${r} ${r} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke="url(#sarc)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${arc} ${C2}`} strokeDashoffset={off} style={{transition:"stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)"}}/>
      <text x={cx} y={cy-3} textAnchor="middle" dominantBaseline="middle" fill={c1} fontSize="28" fontWeight="800">{score}</text>
      <text x={cx} y={cy+20} textAnchor="middle" fill="rgba(255,255,255,.28)" fontSize="11">/100</text>
    </svg>
  );
}

// ══════════════════════════════════════════════
//  METRIC BAR
// ══════════════════════════════════════════════
function MBar({label,value,color}) {
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",color:"#8892b8"}}>{label}</span>
        <span style={{fontSize:10,fontWeight:700,color}}>{value}</span>
      </div>
      <div style={{height:5,borderRadius:9,background:"rgba(255,255,255,.07)",overflow:"hidden"}}>
        <div style={{height:"100%",borderRadius:9,width:`${value}%`,background:color,transition:"width 1s cubic-bezier(.22,1,.36,1)"}}/>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  RESULT CARD
// ══════════════════════════════════════════════
function ResultCard({result,loading,isFR,idea,onPivot,pivots,pivotLoading,TH={}}) {
  const [price,setPrice]=useState(29);
  const [conv,setConv]=useState(2);
  const [vis,setVis]=useState(1000);
  const [calcOpen,setCalcOpen]=useState(false);

  const sales=Math.round(vis*conv/100);
  const monthly=sales*price;

  const L = isFR ? {
    score:"Score Viabilité",ov:"Vue d'ensemble",niche:"Micro-Niche",fmt:"Format",
    analysis:"Analyse",markets:"Marchés",risks:"Risques",pricing:"Prix MVP",plan:"Plan de Validation",
    trend:"Tendance Marché",signals:"Signaux",revenue:"Calculateur Revenus",
    pivot:"Mode Pivot",pivotBtn:"Générer des Pivots",pivotSub:"Transformez votre idée en version rentable",
    export:"Exporter PDF",aiProj:"Projection IA",firstSale:"Première vente dans",
    cons:"Prudent",real:"Réaliste",opti:"Optimiste",
    revS:"Ventes/mois",revM:"Mensuel",revA:"Annuel",
    wBetter:"Pourquoi ça marche",kChange:"Changement clé",
    loading:"Analyse en cours…",
    unitPrice:"Prix unitaire ($)",convRate:"Taux conversion (%)",monthVis:"Visiteurs / mois",
  } : {
    score:"Viability Score",ov:"Overview",niche:"Micro-Niche",fmt:"Format",
    analysis:"Analysis",markets:"Markets",risks:"Risks",pricing:"MVP Price",plan:"Validation Plan",
    trend:"Market Trend",signals:"Signals",revenue:"Revenue Calculator",
    pivot:"Pivot Mode",pivotBtn:"Generate Pivots",pivotSub:"Transform your idea into a profitable version",
    export:"Export PDF",aiProj:"AI Projection",firstSale:"First sale in",
    cons:"Conservative",real:"Realistic",opti:"Optimistic",
    revS:"Sales/mo",revM:"Monthly",revA:"Annual",
    wBetter:"Why it works",kChange:"Key change",
    loading:"Analyzing…",
    unitPrice:"Unit price ($)",convRate:"Conversion rate (%)",monthVis:"Monthly visitors",
  };

  const VD = {
    RENTABLE:     {c1:"#10b981",c2:"#2dd4bf",label:isFR?"RENTABLE":"PROFITABLE",       bg:"rgba(16,185,129,.12)",bd:"rgba(16,185,129,.3)",col:"#10b981"},
    A_AJUSTER:    {c1:"#f59e0b",c2:"#f97316",label:isFR?"À AJUSTER":"NEEDS ADJUSTMENT",bg:"rgba(245,158,11,.12)",bd:"rgba(245,158,11,.3)",col:"#f59e0b"},
    NON_RENTABLE: {c1:"#ef4444",c2:"#ec4899",label:isFR?"NON RENTABLE":"NOT PROFITABLE",bg:"rgba(239,68,68,.12)",bd:"rgba(239,68,68,.3)",col:"#ef4444"},
  };

  if(loading) return (
    <div style={{textAlign:"center",marginTop:64,width:"100%"}}>
      <div style={{width:46,height:46,border:"3px solid rgba(96,165,250,.18)",borderTop:"3px solid #60a5fa",borderRadius:"50%",margin:"0 auto 18px",animation:"spin 1s linear infinite"}}/>
      <p style={{color:"#60a5fa",fontSize:12,letterSpacing:".3em",textTransform:"uppercase",fontWeight:600}}>{L.loading}</p>
    </div>
  );
  if(!result) return null;

  const vd = VD[result.verdict]||VD.NON_RENTABLE;
  const lmap = isFR
    ?{market:"Marché",competition:"Concurrence",monetization:"Monétisation",execution:"Exécution",timing:"Timing",innovation:"Innovation"}
    :{market:"Market",competition:"Competition",monetization:"Monetization",execution:"Execution",timing:"Timing",innovation:"Innovation"};
  const radarData=Object.entries(result.radarScores||{}).map(([k,v])=>({subject:lmap[k]||k,A:v,fullMark:100}));
  const barData=Object.entries(result.radarScores||{}).map(([k,v])=>({name:lmap[k]||k,value:v}));
  const tScore=result.trendScore??60;
  const tDir=result.trendDirection||"STABLE";

  const CARD={background:TH.cardBg||C.card,border:`1px solid ${TH.cardBdr||C.bdr}`,backdropFilter:"blur(20px)",borderRadius:16,padding:20};
  const SUB={background:TH.subBg||C.sub,border:`1px solid ${TH.subBdr||C.subBdr}`,borderRadius:9};

  const CTip=({active,payload})=>active&&payload?.length
    ?<div style={{background:"#111442",border:"1px solid rgba(53,61,122,.7)",borderRadius:8,padding:"7px 12px",fontSize:11,fontWeight:600,color:"#e2e8f0"}}>
       {payload[0].payload.name}: <span style={{color:sc(payload[0].value)}}>{payload[0].value}</span>
     </div>:null;

  const exportPDF = () => {
    if (!result) return;
    const safe = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const trendColor = tScore>=70?"#0ea5e9":tScore>=45?"#f59e0b":"#ef4444";
    const trendIcon  = tDir==="UP"?"↑":tDir==="DOWN"?"↓":"→";

    // Build all HTML sections as plain strings — no nested template literals
    let radarHTML = "";
    Object.entries(result.radarScores||{}).forEach(([k,v])=>{
      const col = sc(v);
      radarHTML += '<div style="margin-bottom:8px">'
        +'<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">'
        +'<span>'+safe(lmap[k]||k)+'</span>'
        +'<strong style="color:'+col+'">'+v+'</strong></div>'
        +'<div style="height:5px;background:#e5e7eb;border-radius:3px">'
        +'<div style="height:5px;border-radius:3px;width:'+v+'%;background:'+col+'"></div></div></div>';
    });

    let pricingHTML = "";
    [["XAF",result.pricing?.xaf],["USD",result.pricing?.usd],["EUR",result.pricing?.eur]].forEach(([c,v])=>{
      pricingHTML += '<div style="border:1px solid #e0e3f8;border-radius:9px;padding:12px;text-align:center">'
        +'<div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7db3;margin-bottom:3px">'+c+'</div>'
        +'<div style="font-size:16px;font-weight:800;color:#1a1a2e">'+safe(v||"—")+'</div></div>';
    });

    let riskHTML = "";
    (result.risks||[]).forEach(r=>{
      riskHTML += '<div style="display:flex;gap:8px;padding:10px;background:#fff5f5;border:1px solid #fecaca;border-radius:7px;margin-bottom:6px;font-size:12px;line-height:1.5">'
        +'<span style="color:#ef4444;flex-shrink:0">⚠</span>'+safe(r)+'</div>';
    });

    let stepsHTML = "";
    (result.actionPlan||[]).forEach(s=>{
      stepsHTML += '<div style="display:flex;gap:12px;margin-bottom:12px;font-size:12px;line-height:1.5">'
        +'<div style="width:28px;height:28px;border-radius:50%;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0">'+s.step+'</div>'
        +'<div><strong style="font-size:13px">'+safe(s.title)+'</strong><br><span style="color:#6b7280">'+safe(s.description)+'</span></div></div>';
    });

    let insightsHTML = "";
    (result.trendInsights||[]).forEach(t=>{
      insightsHTML += '<div style="padding:7px 12px;border-left:3px solid #0ea5e9;background:#f0f9ff;margin-bottom:6px;font-size:12px;line-height:1.5;color:#0c4a6e">'+safe(t)+'</div>';
    });

    let revenueHTML = "";
    if(result.revenueEstimate){
      const re = result.revenueEstimate;
      revenueHTML = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:8px">'
        +'<div style="border:1px solid #e0e3f8;border-radius:9px;padding:12px;text-align:center"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7db3;margin-bottom:3px">'+(isFR?"Prudent":"Conservative")+'</div><div style="font-size:15px;font-weight:800;color:#6b7db3">'+safe(re.low)+'</div></div>'
        +'<div style="border:1px solid #d1fae5;border-radius:9px;padding:12px;text-align:center"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#10b981;margin-bottom:3px">'+(isFR?"Réaliste":"Realistic")+'</div><div style="font-size:15px;font-weight:800;color:#10b981">'+safe(re.mid)+'</div></div>'
        +'<div style="border:1px solid #fef3c7;border-radius:9px;padding:12px;text-align:center"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#f59e0b;margin-bottom:3px">'+(isFR?"Optimiste":"Optimistic")+'</div><div style="font-size:15px;font-weight:800;color:#f59e0b">'+safe(re.high)+'</div></div>'
        +'</div>'
        +'<p style="font-size:11px;color:#6b7db3">'+(isFR?"Première vente estimée dans :":"Estimated first sale in:")+'&nbsp;<strong style="color:#6366f1">'+safe(re.timeToFirst)+'</strong></p>';
    }

    let pivotsHTML = "";
    (pivots?.pivots||[]).forEach(p=>{
      pivotsHTML += '<div style="border:1px solid #ddd6fe;border-radius:10px;padding:14px;margin-bottom:10px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">'
        +'<strong style="font-size:13px">'+safe(p.title)+'</strong>'
        +'<span style="font-size:12px;font-weight:800;color:#7c3aed">'+p.estimatedScore+'/100</span></div>'
        +'<p style="font-size:11px;font-style:italic;color:#6b7280;margin-bottom:6px">"'+safe(p.tagline)+'"</p>'
        +'<p style="font-size:11px;color:#374151"><strong style="color:#7c3aed">↺ '+safe(p.keyChange)+'</strong></p></div>';
    });

    const dateStr = new Date().toLocaleDateString(isFR?"fr-FR":"en-US",{year:"numeric",month:"long",day:"numeric"});

    const html = [
      "<!DOCTYPE html>",
      "<html lang=\"" + (isFR ? "fr" : "en") + "\">",
      "<head>",
      "<meta charset=\"UTF-8\">",
      "<title>" + safe(idea) + " — Future Vision Suite</title>",
      "<style>",
      "*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}",
      "body{background:#fff;color:#1a1a2e;padding:40px;max-width:800px;margin:0 auto}",
      "h2{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#6366f1;margin:24px 0 10px;padding-bottom:5px;border-bottom:1px solid #e5e7eb}",
      "@media print{@page{margin:1.5cm}body{padding:0}}",
      "</style>",
      "</head>",
      "<body>",
      "<div style=\"display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #6366f1\">",
      "<div><div style=\"font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#6366f1\">Future Vision Suite</div>",
      "<div style=\"font-size:22px;font-weight:800;margin:6px 0 3px;color:#1a1a2e\">" + safe(idea) + "</div>",
      "<div style=\"font-size:13px;color:#6b7280\">" + (isFR ? "Rapport d'analyse" : "Analysis Report") + "</div></div>",
      "<div style=\"text-align:right;font-size:11px;color:#9ca3af\">" + dateStr + "</div></div>",
      "<div style=\"display:inline-block;padding:5px 18px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:.08em;border:2px solid " + vd.col + ";color:" + vd.col + ";background:" + vd.col + "18;margin-bottom:16px\">" + safe(vd.label) + "</div>",
      "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px\">",
      "<div style=\"border:1px solid #e0e3f8;border-radius:9px;padding:14px\">",
      "<div style=\"font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7db3;margin-bottom:4px\">" + (isFR ? "Score Viabilité" : "Viability Score") + "</div>",
      "<div style=\"font-size:34px;font-weight:900;color:" + vd.c1 + "\">" + result.viabilityScore + "<span style=\"font-size:14px;color:#9ca3af\">/100</span></div></div>",
      "<div style=\"border:1px solid #e0e3f8;border-radius:9px;padding:14px\">",
      "<div style=\"font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7db3;margin-bottom:4px\">" + (isFR ? "Tendance Marché" : "Market Trend") + "</div>",
      "<div style=\"font-size:30px;font-weight:900;color:" + trendColor + "\">" + tScore + " <span style=\"font-size:18px\">" + trendIcon + " " + tDir + "</span></div></div></div>",
      "<div style=\"border:1px solid #e0e3f8;border-radius:9px;padding:14px;margin-bottom:4px\">",
      "<div style=\"font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7db3;margin-bottom:5px\">" + (isFR ? "Analyse" : "Analysis") + "</div>",
      "<p style=\"font-size:13px;line-height:1.65;color:#374151\">" + safe(result.justification) + "</p></div>",
      "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px\">",
      "<div style=\"border:1px solid #e0e3f8;border-radius:9px;padding:12px\">",
      "<div style=\"font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7db3;margin-bottom:3px\">Micro-Niche</div>",
      "<div style=\"font-size:13px;font-weight:600\">" + safe(result.microNiche) + "</div></div>",
      "<div style=\"border:1px solid #e0e3f8;border-radius:9px;padding:12px\">",
      "<div style=\"font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7db3;margin-bottom:3px\">Format</div>",
      "<div style=\"font-size:13px;font-weight:600\">" + safe(result.productFormat) + "</div></div></div>",
      insightsHTML ? "<h2>" + (isFR ? "Signaux de tendance" : "Trend Signals") + "</h2>" + insightsHTML : "",
      "<h2>" + (isFR ? "Analyse Dimensionnelle" : "Dimension Analysis") + "</h2>" + radarHTML,
      "<h2>" + (isFR ? "Prix MVP" : "MVP Price") + "</h2><div style=\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:4px\">" + pricingHTML + "</div>",
      revenueHTML ? "<h2>" + (isFR ? "Projection de Revenus" : "Revenue Projection") + "</h2>" + revenueHTML : "",
      result.globalMarkets?.length ? "<h2>" + (isFR ? "Marchés" : "Markets") + "</h2><p style=\"font-size:12px;line-height:1.7;color:#374151\">" + result.globalMarkets.map(m => safe(m)).join(" &nbsp;·&nbsp; ") + "</p>" : "",
      "<h2>" + (isFR ? "Risques" : "Risks") + "</h2>" + riskHTML,
      "<h2>" + (isFR ? "Plan de Validation" : "Validation Plan") + "</h2>" + stepsHTML,
      pivotsHTML ? "<h2>" + (isFR ? "Pivots Suggérés" : "Suggested Pivots") + "</h2>" + pivotsHTML : "",
      "<div style=\"margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center\">",
      "Future Vision Suite &nbsp;·&nbsp; " + (isFR ? "Propulsé par Claude" : "Powered by Claude") + " &nbsp;·&nbsp; " + dateStr,
      "</div>",
      "</body>",
      "</html>"
    ].join("\n");

    // Ouvre dans un nouvel onglet via Blob (pas de document.write, pas de popup bloqué)
    const blob = new Blob([html], {type:"text/html;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const tab  = window.open(url, "_blank");
    if (tab) {
      tab.addEventListener("load", () => {
        setTimeout(() => { tab.focus(); tab.print(); }, 500);
      });
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } else {
      // Fallback : télécharge le fichier HTML si popup bloqué
      const a = document.createElement("a");
      a.href = url;
      a.download = safe(idea).replace(/\s+/g,"-").slice(0,40)+"-rapport.html";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  };

  return (
    <div style={{width:"100%",maxWidth:1020,margin:"28px auto 60px",animation:"fadeUp .4s ease both"}}>

      {/* Export */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <button onClick={exportPDF} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 15px",borderRadius:9,border:"1px solid rgba(99,102,241,.35)",background:"rgba(99,102,241,.1)",color:"#a5b4fc",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          📄 {L.export}
        </button>
      </div>

      {/* Row 1 — Score / Overview / Radar */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:14,marginBottom:14}}>
        <div style={{...CARD,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
          <ScoreArc score={result.viabilityScore} c1={vd.c1} c2={vd.c2}/>
          <span style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".12em",color:TH.subTxt||"#8892b8"}}>{L.score}</span>
          <span style={{padding:"5px 16px",borderRadius:99,fontSize:11,fontWeight:700,letterSpacing:".08em",background:vd.bg,border:`1px solid ${vd.bd}`,color:vd.col}}>{vd.label}</span>
        </div>
        <div style={{...CARD,display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#60a5fa",marginBottom:7}}>{L.ov}</p>
            <p style={{fontSize:13,lineHeight:1.65,color:TH.subTxt||"#c8d0e8"}}>{result.justification}</p>
          </div>
          <div style={{height:1,background:"rgba(53,61,122,.5)"}}/>
          <div><p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#38bdf8",marginBottom:4}}>{L.niche}</p><p style={{fontWeight:600,color:TH.headTxt||"#e2e8f0"}}>{result.microNiche}</p></div>
          <div><p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#a78bfa",marginBottom:4}}>{L.fmt}</p><p style={{fontWeight:600,color:TH.headTxt||"#e2e8f0"}}>{result.productFormat}</p></div>
        </div>
        <div style={CARD}>
          <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#a78bfa",marginBottom:8}}>{L.analysis}</p>
          <ResponsiveContainer width="100%" height={215}>
            <RadarChart data={radarData} margin={{top:8,right:18,bottom:8,left:18}}>
              <PolarGrid stroke="rgba(53,61,122,.5)"/>
              <PolarAngleAxis dataKey="subject" tick={{fill:"#8892b8",fontSize:10,fontWeight:600}}/>
              <Radar dataKey="A" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.22} strokeWidth={2}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trend */}
      <div style={{...CARD,marginBottom:14}}>
        <div style={{display:"flex",flexWrap:"wrap",gap:20,alignItems:"stretch"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,minWidth:115}}>
            <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#0ea5e9"}}>{L.trend}</p>
            <svg width="84" height="84" viewBox="0 0 84 84">
              <circle cx="42" cy="42" r="32" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="6"/>
              <circle cx="42" cy="42" r="32" fill="none"
                stroke={tScore>=70?"#0ea5e9":tScore>=45?"#f59e0b":"#ef4444"} strokeWidth="6"
                strokeDasharray={`${(tScore/100)*201} 201`} strokeLinecap="round"
                transform="rotate(-90 42 42)" style={{transition:"stroke-dasharray 1.2s ease"}}/>
              <text x="42" y="46" textAnchor="middle" dominantBaseline="middle"
                fill={tScore>=70?"#0ea5e9":tScore>=45?"#f59e0b":"#ef4444"} fontSize="19" fontWeight="800">{tScore}</text>
            </svg>
            <span style={{fontSize:13,fontWeight:700,color:tc(tDir)}}>{tDir==="UP"?"↑":tDir==="DOWN"?"↓":"→"} {tDir}</span>
          </div>
          <div style={{flex:1,minWidth:190}}>
            <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#0ea5e9",marginBottom:10}}>{L.signals}</p>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {(result.trendInsights||[]).map((ins,i)=>(
                <div key={i} style={{display:"flex",gap:9,padding:"8px 12px",background:"rgba(14,165,233,.06)",border:"1px solid rgba(14,165,233,.15)",borderRadius:8}}>
                  <span style={{color:"#0ea5e9",flexShrink:0,fontSize:13}}>◉</span>
                  <span style={{fontSize:12,color:TH.subTxt||"#c8d0e8",lineHeight:1.5}}>{ins}</span>
                </div>
              ))}
            </div>
          </div>
          {result.revenueEstimate&&(
            <div style={{display:"flex",flexDirection:"column",gap:6,minWidth:150}}>
              <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#10b981"}}>{L.aiProj}</p>
              {[[L.cons,result.revenueEstimate.low,"#6b7db3"],[L.real,result.revenueEstimate.mid,"#10b981"],[L.opti,result.revenueEstimate.high,"#f59e0b"]].map(([lbl,val,col])=>(
                <div key={lbl} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:`${col}15`,border:`1px solid ${col}35`,borderRadius:8,gap:10}}>
                  <span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#6b7db3"}}>{lbl}</span>
                  <span style={{fontSize:12,fontWeight:700,color:col}}>{val}</span>
                </div>
              ))}
              <div style={{padding:"5px 10px",background:"rgba(99,102,241,.08)",border:"1px solid rgba(99,102,241,.2)",borderRadius:8,textAlign:"center"}}>
                <span style={{fontSize:9,color:"#8892b8"}}>{L.firstSale} </span>
                <span style={{fontSize:10,fontWeight:700,color:"#a5b4fc"}}>{result.revenueEstimate.timeToFirst}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 3 — Bar + Pricing + Markets */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:14,marginBottom:14}}>
        <div style={CARD}>
          <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#a78bfa",marginBottom:13}}>{L.analysis}</p>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={barData} layout="vertical" margin={{top:0,right:5,left:2,bottom:0}}>
              <XAxis type="number" domain={[0,100]} tick={{fill:"#6b7db3",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" width={96} tick={{fill:"#8892b8",fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip content={<CTip/>}/>
              <Bar dataKey="value" radius={[0,4,4,0]} maxBarSize={12}>
                {barData.map((d,i)=><Cell key={i} fill={sc(d.value)} fillOpacity={.85}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={CARD}>
            <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#10b981",marginBottom:11}}>{L.pricing}</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9}}>
              {[["XAF",result.pricing?.xaf],["USD",result.pricing?.usd],["EUR",result.pricing?.eur]].map(([cur,val])=>(
                <div key={cur} style={{...SUB,padding:"9px",textAlign:"center"}}>
                  <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#6b7db3",marginBottom:2}}>{cur}</div>
                  <div style={{fontWeight:700,fontSize:12,color:TH.headTxt||"#c8d0e8"}}>{val}</div>
                </div>
              ))}
            </div>
          </div>
          {(result.globalMarkets||[]).length>0&&(
            <div style={{...CARD,flex:1}}>
              <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#38bdf8",marginBottom:9}}>{L.markets}</p>
              {result.globalMarkets.map((m,i)=>(
                <div key={i} style={{display:"flex",gap:7,fontSize:12,color:TH.subTxt||"#c8d0e8",marginBottom:6}}>
                  <span style={{color:"#38bdf8"}}>›</span>{m}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Revenue Calculator */}
      <div style={{...CARD,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:calcOpen?18:0}}>
          <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#10b981"}}>💰 {L.revenue}</p>
          <button onClick={()=>setCalcOpen(!calcOpen)} style={{fontSize:11,padding:"5px 13px",borderRadius:99,border:"1px solid rgba(16,185,129,.3)",background:"rgba(16,185,129,.08)",color:"#10b981",cursor:"pointer",fontWeight:600}}>
            {calcOpen?(isFR?"Réduire ↑":"Collapse ↑"):(isFR?"Ouvrir ↓":"Open ↓")}
          </button>
        </div>
        {!calcOpen&&(
          <div style={{display:"flex",gap:22,flexWrap:"wrap"}}>
            {[[L.revS,`${sales}`,"#a78bfa"],[L.revM,fmtM(monthly),"#10b981"],[L.revA,fmtM(monthly*12),"#f59e0b"]].map(([l,v,col])=>(
              <div key={l}><div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#6b7db3",marginBottom:2}}>{l}</div>
                <div style={{fontSize:18,fontWeight:800,color:col}}>{v}</div></div>
            ))}
          </div>
        )}
        {calcOpen&&(
          <div style={{animation:"fadeUp .2s ease both"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:18,marginBottom:20}}>
              {[
                {label:L.unitPrice,val:price,set:setPrice,min:1,max:999,color:"#a78bfa"},
                {label:L.convRate, val:conv, set:setConv, min:0.1,max:20,step:0.1,color:"#60a5fa"},
                {label:L.monthVis,val:vis,  set:setVis,  min:100,max:50000,step:100,color:"#10b981"},
              ].map(sl=>(
                <div key={sl.label}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:11,fontWeight:600,color:"#8892b8"}}>{sl.label}</span>
                    <span style={{fontSize:12,fontWeight:700,color:sl.color}}>{sl.val.toLocaleString()}</span>
                  </div>
                  <input type="range" min={sl.min} max={sl.max} step={sl.step||1} value={sl.val}
                    onChange={e=>sl.set(parseFloat(e.target.value))}
                    style={{width:"100%",accentColor:sl.color,cursor:"pointer"}}/>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
              {[[L.revS,`${sales}`,"#a78bfa","rgba(167,139,250,.08)","rgba(167,139,250,.2)"],
                [L.revM,fmtM(monthly),"#10b981","rgba(16,185,129,.08)","rgba(16,185,129,.25)"],
                [L.revA,fmtM(monthly*12),"#f59e0b","rgba(245,158,11,.08)","rgba(245,158,11,.2)"]].map(([l,v,col,bg,bd])=>(
                <div key={l} style={{padding:"13px",borderRadius:10,background:bg,border:`1px solid ${bd}`,textAlign:"center"}}>
                  <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#6b7db3",marginBottom:5}}>{l}</div>
                  <div style={{fontSize:20,fontWeight:800,color:col}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Risks */}
      {(result.risks||[]).length>0&&(
        <div style={{...CARD,background:"rgba(127,29,29,.18)",border:"1px solid rgba(239,68,68,.22)",marginBottom:14}}>
          <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#f87171",marginBottom:11}}>{L.risks}</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:9}}>
            {result.risks.map((r,i)=>(
              <div key={i} style={{display:"flex",gap:9,padding:"11px 13px",background:"rgba(0,0,0,.22)",border:"1px solid rgba(239,68,68,.1)",borderRadius:9}}>
                <span style={{color:"#f87171",flexShrink:0}}>⚠</span>
                <span style={{fontSize:12,color:TH.subTxt||"#c8d0e8",lineHeight:1.5}}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Plan */}
      <div style={{...CARD,marginBottom:14}}>
        <p style={{fontSize:16,fontWeight:700,color:TH.headTxt||"#e2e8f0",marginBottom:14}}>{L.plan}</p>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {(result.actionPlan||[]).map((item,i)=>(
            <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:TH.inputBg||"#0d1033",border:`1px solid ${TH.cardBdr||"rgba(53,61,122,.7)"}`,color:TH.headTxt||"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,flexShrink:0}}>{item.step}</div>
              <div style={{flex:1,padding:"11px 14px",background:TH.subBg||"rgba(255,255,255,.025)",border:`1px solid ${TH.subBdr||"rgba(53,61,122,.35)"}`,borderRadius:9}}>
                <p style={{fontWeight:700,fontSize:13,color:TH.headTxt||"#e2e8f0",marginBottom:3}}>{item.title}</p>
                <p style={{fontSize:12,color:TH.subTxt||"#8892b8",lineHeight:1.55}}>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── NEW TABS: Competitors / Feasibility / Marketing ── */}
      {(result.competitors||result.feasibility||result.marketing)&&(
        <AnalyzerTabs result={result} isFR={isFR} TH={TH}/>
      )}

      {/* Pivot */}
      <div style={{...CARD,border:"1px solid rgba(167,139,250,.38)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:11,marginBottom:pivots?.pivots?.length?18:0}}>
          <div>
            <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#a78bfa"}}>🔄 {L.pivot}</p>
            <p style={{fontSize:12,color:"#8892b8",marginTop:3}}>{L.pivotSub}</p>
          </div>
          <button onClick={onPivot} disabled={pivotLoading}
            style={{display:"flex",alignItems:"center",gap:7,padding:"9px 18px",borderRadius:10,border:"1px solid rgba(167,139,250,.4)",background:"rgba(167,139,250,.1)",color:"#c4b5fd",fontSize:12,fontWeight:700,cursor:pivotLoading?"not-allowed":"pointer",opacity:pivotLoading?.7:1}}>
            {pivotLoading
              ?<><span style={{width:12,height:12,border:"2px solid rgba(196,181,253,.3)",borderTop:"2px solid #c4b5fd",borderRadius:"50%",display:"inline-block",animation:"spin 1s linear infinite"}}/>{isFR?"Analyse…":"Analyzing…"}</>
              :<>🔄 {L.pivotBtn}</>}
          </button>
        </div>
        {(pivots?.pivots||[]).length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:11,animation:"fadeUp .3s ease both"}}>
            {pivots.pivots.map((p,i)=>(
              <div key={i} style={{padding:"15px 17px",background:"rgba(167,139,250,.06)",border:"1px solid rgba(167,139,250,.2)",borderRadius:11}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <h4 style={{fontSize:13,fontWeight:700,color:TH.headTxt||"#e2e8f0"}}>{p.title}</h4>
                  <span style={{fontSize:12,fontWeight:800,color:"#a78bfa",flexShrink:0,marginLeft:7}}>{p.estimatedScore}/100</span>
                </div>
                <p style={{fontSize:12,fontStyle:"italic",color:TH.subTxt||"#8892b8",marginBottom:9,lineHeight:1.5}}>"{p.tagline}"</p>
                <div style={{height:1,background:"rgba(53,61,122,.5)",marginBottom:9}}/>
                <p style={{fontSize:11,color:"#c8d0e8",marginBottom:4}}><span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#6b7db3"}}>{L.kChange}: </span><span style={{color:"#c4b5fd"}}>{p.keyChange}</span></p>
                <p style={{fontSize:11,color:TH.subTxt||"#c8d0e8",marginBottom:9}}><span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3"}}>{L.wBetter}: </span>{p.whyBetter}</p>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,padding:"2px 9px",borderRadius:99,background:"rgba(56,189,248,.1)",border:"1px solid rgba(56,189,248,.2)",color:"#38bdf8"}}>{p.format}</span>
                  <span style={{fontSize:10,padding:"2px 9px",borderRadius:99,background:"rgba(16,185,129,.1)",border:"1px solid rgba(16,185,129,.2)",color:"#10b981"}}>{(p.targetAudience||"").slice(0,28)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════
//  ANALYZER TABS (Concurrents / Faisabilité / Marketing)
// ══════════════════════════════════════════════
function AnalyzerTabs({result, isFR, TH={}}) {
  const [tab, setTab] = useState(0);
  const CARD = {background:TH.cardBg||"rgba(17,20,66,.82)", border:`1px solid ${TH.cardBdr||"rgba(53,61,122,.55)"}`, backdropFilter:"blur(20px)", borderRadius:16, padding:20};
  const SUB  = {background:TH.subBg||"rgba(255,255,255,.04)", border:`1px solid ${TH.subBdr||"rgba(53,61,122,.4)"}`, borderRadius:9};

  const tabs = isFR
    ? ["🧠 Concurrents","📊 Faisabilité","📣 Marketing"]
    : ["🧠 Competitors","📊 Feasibility","📣 Marketing"];
  const tabColors = ["#60a5fa","#a78bfa","#f59e0b"];

  return (
    <div style={{...CARD, padding:0, overflow:"hidden"}}>
      {/* Tab bar */}
      <div style={{display:"flex", borderBottom:`1px solid ${TH.cardBdr||"rgba(53,61,122,.4)"}`}}>
        {tabs.map((t,i) => (
          <button key={i} onClick={()=>setTab(i)}
            style={{flex:1, padding:"13px 8px", fontSize:11, fontWeight:700, border:"none", cursor:"pointer",
              background:tab===i?TH.subBg||"rgba(255,255,255,.04)":"transparent",
              color:tab===i?tabColors[i]:(TH.iconCol||"#6b7db3"),
              borderBottom:tab===i?`2px solid ${tabColors[i]}`:"2px solid transparent",
              transition:"all .18s"}}>
            {t}
          </button>
        ))}
      </div>

      <div style={{padding:20}}>

        {/* ── TAB 0: Concurrents ── */}
        {tab===0&&(
          <div style={{animation:"fadeUp .25s ease both"}}>
            {!(result.competitors?.length) && (
              <p style={{color:TH.subTxt||"#8892b8",fontSize:13,textAlign:"center",padding:"20px 0"}}>
                {isFR?"Données non disponibles pour cette analyse.":"Data not available for this analysis."}
              </p>
            )}
            {(result.competitors||[]).map((c,i)=>(
              <div key={i} style={{...SUB, padding:16, marginBottom:10, display:"flex", gap:14, alignItems:"flex-start"}}>
                {/* Rank */}
                <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(96,165,250,.12)",border:"1px solid rgba(96,165,250,.25)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:12,fontWeight:800,color:"#60a5fa"}}>#{i+1}</span>
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div>
                      <span style={{fontSize:13,fontWeight:700,color:TH.headTxt||"#e2e8f0"}}>{c.name}</span>
                      {c.url&&<span style={{fontSize:10,color:TH.iconCol||"#6b7db3",marginLeft:8}}>{c.url}</span>}
                    </div>
                    {c.marketShare&&<span style={{fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:99,background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.25)",color:"#60a5fa"}}>{c.marketShare}</span>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div style={{padding:"9px 11px",borderRadius:8,background:"rgba(16,185,129,.06)",border:"1px solid rgba(16,185,129,.18)"}}>
                      <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#10b981",marginBottom:3}}>
                        {isFR?"✓ Force":"✓ Strength"}
                      </div>
                      <p style={{fontSize:11,color:TH.subTxt||"#8892b8",lineHeight:1.5}}>{c.strength}</p>
                    </div>
                    <div style={{padding:"9px 11px",borderRadius:8,background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.18)"}}>
                      <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#f87171",marginBottom:3}}>
                        {isFR?"⚡ Faille à exploiter":"⚡ Exploitable weakness"}
                      </div>
                      <p style={{fontSize:11,color:TH.subTxt||"#8892b8",lineHeight:1.5}}>{c.weakness}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB 1: Faisabilité ── */}
        {tab===1&&(
          <div style={{animation:"fadeUp .25s ease both"}}>
            {!result.feasibility && (
              <p style={{color:TH.subTxt||"#8892b8",fontSize:13,textAlign:"center",padding:"20px 0"}}>
                {isFR?"Données non disponibles.":"Data not available."}
              </p>
            )}
            {result.feasibility&&(()=>{
              const f=result.feasibility;
              const scoreColor = f.score>=70?"#10b981":f.score>=45?"#f59e0b":"#ef4444";
              const dimLabels = isFR
                ? {technical:"Technique",financial:"Financier",time:"Temps",expertise:"Expertise"}
                : {technical:"Technical",financial:"Financial",time:"Time",expertise:"Expertise"};
              return (
                <>
                  {/* Score global */}
                  <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:20,marginBottom:18,alignItems:"center"}}>
                    <div style={{textAlign:"center"}}>
                      <svg width="90" height="90" viewBox="0 0 90 90">
                        <circle cx="45" cy="45" r="36" fill="none" stroke={TH.subBg||"rgba(255,255,255,.06)"} strokeWidth="8"/>
                        <circle cx="45" cy="45" r="36" fill="none" stroke={scoreColor} strokeWidth="8"
                          strokeDasharray={`${(f.score/100)*226} 226`}
                          strokeLinecap="round" transform="rotate(-90 45 45)"/>
                        <text x="45" y="41" textAnchor="middle" fontSize="18" fontWeight="900" fill={scoreColor}>{f.score}</text>
                        <text x="45" y="57" textAnchor="middle" fontSize="9" fill={TH.iconCol||"#6b7db3"}>/100</text>
                      </svg>
                      <p style={{fontSize:10,fontWeight:700,color:TH.iconCol||"#6b7db3",marginTop:2}}>{isFR?"Score Global":"Global Score"}</p>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:7}}>
                      {Object.entries(f.breakdown||{}).map(([k,v])=>(
                        <div key={k}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                            <span style={{color:TH.subTxt||"#8892b8"}}>{dimLabels[k]||k}</span>
                            <strong style={{color:v>=70?"#10b981":v>=45?"#f59e0b":"#ef4444"}}>{v}</strong>
                          </div>
                          <div style={{height:4,background:TH.subBg||"rgba(255,255,255,.06)",borderRadius:3}}>
                            <div style={{height:4,borderRadius:3,width:`${v}%`,background:v>=70?"#10b981":v>=45?"#f59e0b":"#ef4444"}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Budget + Time */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
                    {[
                      [isFR?"Budget min":"Min budget",f.budgetMin,"#60a5fa"],
                      [isFR?"Budget idéal":"Ideal budget",f.budgetIdeal,"#a78bfa"],
                      [isFR?"Délai lancement":"Time to launch",f.timeToLaunch,"#10b981"],
                    ].map(([l,v,col])=>(
                      <div key={l} style={{...SUB,padding:"10px 12px",textAlign:"center"}}>
                        <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:4}}>{l}</div>
                        <div style={{fontSize:14,fontWeight:800,color:col}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {/* Skills */}
                  <div>
                    <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:8}}>
                      {isFR?"Compétences requises":"Required skills"}
                    </p>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {(f.skills||[]).map((s,i)=>(
                        <span key={i} style={{fontSize:11,padding:"4px 12px",borderRadius:99,background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.2)",color:"#60a5fa",fontWeight:500}}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── TAB 2: Marketing ── */}
        {tab===2&&(
          <div style={{animation:"fadeUp .25s ease both"}}>
            {!result.marketing && (
              <p style={{color:TH.subTxt||"#8892b8",fontSize:13,textAlign:"center",padding:"20px 0"}}>
                {isFR?"Données non disponibles.":"Data not available."}
              </p>
            )}
            {result.marketing&&(()=>{
              const m=result.marketing;
              const roiColor=r=>r==="Très élevé"||r==="Very High"||r==="Élevé"||r==="High"?"#10b981":r==="Moyen"||r==="Medium"?"#f59e0b":"#ef4444";
              return (
                <>
                  {/* Channels */}
                  <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:10}}>
                    {isFR?"Canaux recommandés":"Recommended channels"}
                  </p>
                  <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                    {(m.channels||[]).map((ch,i)=>(
                      <div key={i} style={{...SUB,padding:"12px 14px",display:"flex",alignItems:"flex-start",gap:12}}>
                        <div style={{minWidth:0,flex:1}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                            <span style={{fontSize:12,fontWeight:700,color:TH.headTxt||"#e2e8f0"}}>{ch.name}</span>
                            <div style={{display:"flex",gap:6}}>
                              <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:99,background:roiColor(ch.roi)+"18",border:`1px solid ${roiColor(ch.roi)}44`,color:roiColor(ch.roi)}}>
                                ROI {ch.roi}
                              </span>
                              <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:99,background:"rgba(167,139,250,.1)",border:"1px solid rgba(167,139,250,.25)",color:"#a78bfa"}}>
                                {ch.budget}
                              </span>
                            </div>
                          </div>
                          <p style={{fontSize:11,color:TH.subTxt||"#8892b8",lineHeight:1.5}}>{ch.why}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Hooks */}
                  <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:8}}>
                    {isFR?"🎯 Hooks viraux":"🎯 Viral hooks"}
                  </p>
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
                    {(m.hooks||[]).map((h,i)=>(
                      <div key={i} style={{padding:"9px 13px",borderRadius:9,background:"rgba(245,158,11,.07)",border:"1px solid rgba(245,158,11,.2)"}}>
                        <span style={{fontSize:12,color:TH.headTxt||"#e2e8f0",fontStyle:"italic"}}>"{h}"</span>
                      </div>
                    ))}
                  </div>
                  {/* Budget + Tips */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div style={{...SUB,padding:"11px 13px"}}>
                      <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:4}}>
                        {isFR?"Budget pub mensuel":"Monthly ad budget"}
                      </div>
                      <div style={{fontSize:18,fontWeight:800,color:"#f59e0b"}}>{m.monthlyAdBudget}</div>
                    </div>
                    <div style={{...SUB,padding:"11px 13px"}}>
                      <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:4}}>
                        {isFR?"Conseil ciblage":"Targeting tip"}
                      </div>
                      <p style={{fontSize:11,color:TH.subTxt||"#8892b8",lineHeight:1.5}}>{m.targetingTips}</p>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
}


// ══════════════════════════════════════════════
//  HUNTER EXTRAS (Launch Speed + Country Analysis)
// ══════════════════════════════════════════════
function HunterExtras({product, isFR, TH={}}) {
  const CARD = {background:TH.cardBg||"rgba(17,20,66,.82)", border:`1px solid ${TH.cardBdr||"rgba(53,61,122,.55)"}`, backdropFilter:"blur(20px)", borderRadius:16, padding:20};
  const SUB  = {background:TH.subBg||"rgba(255,255,255,.04)", border:`1px solid ${TH.subBdr||"rgba(53,61,122,.4)"}`, borderRadius:9};
  const ls   = product.launchSpeed;
  const ca   = product.countryAnalysis||[];

  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:14}}>

      {/* Launch Speed */}
      {ls&&(
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#10b981"}}>
              ⚡ {isFR?"Vitesse de lancement":"Launch speed"}
            </p>
            <div style={{textAlign:"center"}}>
              <svg width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="24" fill="none" stroke="rgba(16,185,129,.1)" strokeWidth="7"/>
                <circle cx="32" cy="32" r="24" fill="none" stroke={ls.score>=70?"#10b981":ls.score>=45?"#f59e0b":"#ef4444"} strokeWidth="7"
                  strokeDasharray={`${(ls.score/100)*150.8} 150.8`}
                  strokeLinecap="round" transform="rotate(-90 32 32)"/>
                <text x="32" y="28" textAnchor="middle" fontSize="13" fontWeight="900" fill={ls.score>=70?"#10b981":ls.score>=45?"#f59e0b":"#ef4444"}>{ls.score}</text>
                <text x="32" y="42" textAnchor="middle" fontSize="7" fill={TH.iconCol||"#6b7db3"}>/100</text>
              </svg>
            </div>
          </div>
          <div style={{...SUB,padding:"10px 13px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:TH.subTxt||"#8892b8"}}>{isFR?"Première vente estimée":"Estimated first sale"}</span>
            <span style={{fontSize:14,fontWeight:800,color:"#10b981"}}>J+{ls.daysToFirstSale}</span>
          </div>
          <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:8}}>
            {isFR?"Étapes pour démarrer":"Steps to start"}
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
            {(ls.steps||[]).map((s,i)=>(
              <div key={i} style={{display:"flex",gap:9,alignItems:"flex-start"}}>
                <div style={{width:20,height:20,borderRadius:"50%",background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                  <span style={{fontSize:9,fontWeight:800,color:"#10b981"}}>{i+1}</span>
                </div>
                <span style={{fontSize:11,color:TH.subTxt||"#8892b8",lineHeight:1.5}}>{s}</span>
              </div>
            ))}
          </div>
          {ls.quickWin&&(
            <div style={{padding:"10px 13px",borderRadius:9,background:"rgba(16,185,129,.07)",border:"1px solid rgba(16,185,129,.2)"}}>
              <p style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#10b981",marginBottom:4}}>
                🚀 {isFR?"Action immédiate":"Immediate action"}
              </p>
              <p style={{fontSize:11,color:TH.headTxt||"#e2e8f0",lineHeight:1.5}}>{ls.quickWin}</p>
            </div>
          )}
          {ls.mainBlocker&&(
            <div style={{padding:"9px 13px",borderRadius:9,background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.18)",marginTop:8}}>
              <p style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#f87171",marginBottom:3}}>
                ⚠ {isFR?"Obstacle principal":"Main blocker"}
              </p>
              <p style={{fontSize:11,color:TH.subTxt||"#8892b8",lineHeight:1.5}}>{ls.mainBlocker}</p>
            </div>
          )}
        </div>
      )}

      {/* Country Analysis */}
      {ca.length>0&&(
        <div style={CARD}>
          <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#38bdf8",marginBottom:14}}>
            🌍 {isFR?"Analyse par pays":"Country analysis"}
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {ca.map((c,i)=>{
              const potColor=c.potential>=70?"#10b981":c.potential>=45?"#f59e0b":"#ef4444";
              return (
                <div key={i} style={{...SUB,padding:"13px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:20}}>{c.flag}</span>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:TH.headTxt||"#e2e8f0"}}>{c.country}</div>
                        <div style={{fontSize:11,fontWeight:600,color:potColor}}>{c.avgPrice}</div>
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:18,fontWeight:900,color:potColor}}>{c.potential}</div>
                      <div style={{fontSize:9,color:TH.iconCol||"#6b7db3"}}>{isFR?"potentiel":"potential"}</div>
                    </div>
                  </div>
                  <div style={{height:4,background:TH.subBg||"rgba(255,255,255,.06)",borderRadius:3,marginBottom:8}}>
                    <div style={{height:4,borderRadius:3,width:`${c.potential}%`,background:potColor,transition:"width .6s ease"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:99,
                      background:c.competition==="FAIBLE"||c.competition==="LOW"?"rgba(16,185,129,.1)":c.competition==="ÉLEVÉE"||c.competition==="HIGH"?"rgba(239,68,68,.1)":"rgba(245,158,11,.1)",
                      border:`1px solid ${c.competition==="FAIBLE"||c.competition==="LOW"?"rgba(16,185,129,.3)":c.competition==="ÉLEVÉE"||c.competition==="HIGH"?"rgba(239,68,68,.3)":"rgba(245,158,11,.3)"}`,
                      color:c.competition==="FAIBLE"||c.competition==="LOW"?"#10b981":c.competition==="ÉLEVÉE"||c.competition==="HIGH"?"#ef4444":"#f59e0b"}}>
                      {isFR?"Concurrence":"Competition"}: {c.competition}
                    </span>
                    <span style={{fontSize:10,color:TH.iconCol||"#6b7db3"}}>{c.currency}</span>
                  </div>
                  {c.tip&&<p style={{fontSize:11,color:TH.subTxt||"#8892b8",lineHeight:1.5,borderLeft:`2px solid ${potColor}44`,paddingLeft:8}}>{c.tip}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}


// ══════════════════════════════════════════════
//  ROADMAP TOOL
// ══════════════════════════════════════════════
function RoadmapTool({result, loading, isFR, TH={}}) {
  const [selWeek, setSelWeek] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const CARD = {background:TH.cardBg||"rgba(17,20,66,.82)", border:`1px solid ${TH.cardBdr||"rgba(53,61,122,.55)"}`, backdropFilter:"blur(20px)", borderRadius:16, padding:20};
  const SUB  = {background:TH.subBg||"rgba(255,255,255,.04)", border:`1px solid ${TH.subBdr||"rgba(53,61,122,.4)"}`, borderRadius:9};

  const focusColors = {RESEARCH:"#60a5fa",BUILD:"#a78bfa",LAUNCH:"#10b981",GROW:"#f59e0b"};
  const effortColors= {LOW:"#10b981",MEDIUM:"#f59e0b",HIGH:"#ef4444"};

  const exportPDF = () => {
    if(!result) return;
    setPdfLoading(true);
    const safe=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const dateStr=new Date().toLocaleDateString(isFR?"fr-FR":"en-US",{year:"numeric",month:"long",day:"numeric"});
    const phaseColors={};
    (result.phases||[]).forEach(p=>{ phaseColors[p.name]=p.color||"#6366f1"; });

    let weeksHTML="";
    (result.weeks||[]).map(w=>{
      const fc=focusColors[w.focus]||"#6b7db3";
      const ec=effortColors[w.effort]||"#6b7db3";
      weeksHTML+='<div style="break-inside:avoid;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:10px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        +'<div style="display:flex;align-items:center;gap:8px">'
        +'<div style="width:28px;height:28px;border-radius:50%;background:'+fc+'18;border:1px solid '+fc+'44;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:'+fc+'">'+w.week+'</div>'
        +'<div><div style="font-size:12px;font-weight:700;color:#111827">'+safe(w.theme)+'</div>'
        +'<div style="font-size:10px;color:#6b7280">'+safe(w.milestone)+'</div></div></div>'
        +'<div style="display:flex;gap:5px">'
        +'<span style="font-size:8px;font-weight:700;padding:2px 7px;border-radius:99px;background:'+fc+'18;color:'+fc+'">'+w.focus+'</span>'
        +'<span style="font-size:8px;font-weight:700;padding:2px 7px;border-radius:99px;background:'+ec+'18;color:'+ec+'">'+w.effort+'</span>'
        +'</div></div>'
        +'<ul style="padding-left:16px;margin-bottom:7px">'
        +(w.tasks||[]).map(t=>'<li style="font-size:11px;color:#374151;margin-bottom:3px">'+safe(t)+'</li>').join("")
        +'</ul>'
        +'<div style="font-size:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:5px 8px;color:#15803d">📊 KPI: '+safe(w.kpi)+'</div>'
        +'</div>';
    });

    const html="<!DOCTYPE html>\n<html lang=\""+(isFR?"fr":"en")+"\">\n<head>\n"
      +"<meta charset=\"UTF-8\"><title>"+safe(result.title||"Roadmap")+"</title>\n"
      +"<style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{background:#fff;color:#111827;padding:36px;max-width:900px;margin:0 auto}h2{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#10b981;margin:22px 0 10px;padding-bottom:5px;border-bottom:1px solid #d1fae5}@media print{@page{margin:1.5cm}body{padding:0}}</style>\n"
      +"</head>\n<body>\n"
      +"<div style=\"display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #10b981\">"
      +"<div><div style=\"font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#10b981\">Future Vision Suite — Roadmap 90j</div>"
      +"<div style=\"font-size:22px;font-weight:800;color:#111827;margin:6px 0 3px\">"+safe(result.title||"Roadmap")+"</div>"
      +"<div style=\"font-size:13px;font-style:italic;color:#6b7280\">"+safe(result.tagline||"")+"</div></div>"
      +"<div style=\"font-size:11px;color:#9ca3af\">"+dateStr+"</div></div>\n"
      // Phases
      +"<div style=\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px\">"
      +(result.phases||[]).map(p=>'<div style="border-left:4px solid '+safe(p.color||"#10b981")+';padding:10px 12px;background:#f9fafb;border-radius:0 8px 8px 0">'
        +'<div style="font-size:10px;font-weight:700;color:'+safe(p.color||"#10b981")+';margin-bottom:2px">'+safe(p.name)+'</div>'
        +'<div style="font-size:9px;color:#6b7280;margin-bottom:4px">'+safe(isFR?"Semaines":"Weeks")+' '+safe(p.weeks)+'</div>'
        +'<div style="font-size:11px;color:#374151">'+safe(p.goal)+'</div></div>').join("")
      +"</div>\n"
      +"<h2>"+(isFR?"Plan semaine par semaine":"Week by week plan")+"</h2>\n"
      +weeksHTML
      // Resources + KPIs
      +(result.resources?
        "<h2>"+(isFR?"Ressources":"Resources")+"</h2>"
        +"<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px\">"
        +"<div style=\"border:1px solid #e5e7eb;border-radius:9px;padding:12px\"><div style=\"font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px\">"+(isFR?"Budget total":"Total budget")+"</div><div style=\"font-size:16px;font-weight:800;color:#10b981\">"+safe(result.resources.budget)+"</div></div>"
        +"<div style=\"border:1px solid #e5e7eb;border-radius:9px;padding:12px\"><div style=\"font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px\">"+(isFR?"Compétences clés":"Key skills")+"</div><div style=\"font-size:11px;color:#374151\">"+(result.resources.skills||[]).join(" · ")+"</div></div>"
        +"</div>"
        +"<div style=\"border:1px solid #e5e7eb;border-radius:9px;padding:12px;margin-bottom:16px\"><div style=\"font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:6px\">"+(isFR?"Outils recommandés":"Recommended tools")+"</div><div style=\"display:flex;flex-wrap:wrap;gap:6px\">"+(result.resources.tools||[]).map(t=>'<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:#f3f4f6;border:1px solid #e5e7eb;color:#374151">'+safe(t)+'</span>').join("")+"</div></div>"
        :"")
      +(result.successMetrics?
        "<h2>"+(isFR?"Indicateurs de succès":"Success metrics")+"</h2>"
        +"<div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:8px\">"
        +(result.successMetrics||[]).map(m=>'<div style="border:1px solid #d1fae5;background:#f0fdf4;border-radius:7px;padding:9px;font-size:11px;color:#065f46">✓ '+safe(m)+'</div>').join("")
        +"</div>"
        :"")
      +"<div style=\"margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center\">Future Vision Suite &nbsp;·&nbsp; "+(isFR?"Propulsé par Claude":"Powered by Claude")+" &nbsp;·&nbsp; "+dateStr+"</div>\n"
      +"</body></html>";

    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const tab=window.open(url,"_blank");
    if(tab){tab.addEventListener("load",()=>{setTimeout(()=>{tab.focus();tab.print();},500);});setTimeout(()=>URL.revokeObjectURL(url),30000);}
    else{const a=document.createElement("a");a.href=url;a.download="roadmap-90j.html";document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),5000);}
    setPdfLoading(false);
  };

  if(loading) return (
    <div style={{textAlign:"center",marginTop:64,width:"100%"}}>
      <div style={{width:50,height:50,border:"3px solid rgba(16,185,129,.18)",borderTop:"3px solid #10b981",borderRadius:"50%",margin:"0 auto 18px",animation:"spin 1s linear infinite"}}/>
      <p style={{color:"#10b981",fontSize:12,letterSpacing:".3em",textTransform:"uppercase",fontWeight:600}}>
        {isFR?"Génération de la roadmap…":"Generating roadmap…"}
      </p>
    </div>
  );
  if(!result) return null;

  const weeks = result.weeks||[];
  const phases = result.phases||[];
  const selectedWeek = selWeek!==null ? weeks.find(w=>w.week===selWeek) : null;

  return (
    <div style={{width:"100%",maxWidth:1100,margin:"28px auto 60px",display:"flex",flexDirection:"column",gap:14,animation:"fadeUp .4s ease both"}}>

      {/* Export */}
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <button onClick={exportPDF} disabled={pdfLoading}
          style={{display:"flex",alignItems:"center",gap:6,padding:"7px 15px",borderRadius:9,border:"1px solid rgba(16,185,129,.35)",background:"rgba(16,185,129,.1)",color:"#34d399",fontSize:12,fontWeight:600,cursor:pdfLoading?"not-allowed":"pointer",opacity:pdfLoading?.7:1}}>
          {pdfLoading?<><span style={{width:12,height:12,border:"2px solid rgba(52,211,153,.3)",borderTop:"2px solid #34d399",borderRadius:"50%",display:"inline-block",animation:"spin 1s linear infinite"}}/>{isFR?"Génération…":"Generating…"}</>:<>📄 {isFR?"Exporter PDF":"Export PDF"}</>}
        </button>
      </div>

      {/* Header card */}
      <div style={CARD}>
        <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#10b981",marginBottom:5}}>
          🗓 {isFR?"Plan de lancement":"Launch plan"}
        </p>
        <h2 style={{fontSize:22,fontWeight:800,color:TH.headTxt||"#e2e8f0",margin:"0 0 6px"}}>{result.title}</h2>
        {result.tagline&&<p style={{fontSize:13,color:TH.subTxt||"#8892b8",fontStyle:"italic"}}>{result.tagline}</p>}
      </div>

      {/* 3 phases */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
        {phases.map((p,i)=>(
          <div key={i} style={{...SUB,padding:"15px 17px",borderLeft:`4px solid ${p.color||"#10b981"}`}}>
            <p style={{fontSize:11,fontWeight:700,color:p.color||"#10b981",marginBottom:3}}>{p.name}</p>
            <p style={{fontSize:10,color:TH.iconCol||"#6b7db3",marginBottom:5}}>{isFR?"Semaines":"Weeks"} {p.weeks}</p>
            <p style={{fontSize:12,color:TH.subTxt||"#8892b8",lineHeight:1.5}}>{p.goal}</p>
          </div>
        ))}
      </div>

      {/* Timeline grid — 12 weeks */}
      <div style={CARD}>
        <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:16}}>
          {isFR?"Semaine par semaine — cliquer pour les détails":"Week by week — click for details"}
        </p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(72px,1fr))",gap:8}}>
          {weeks.map(w=>{
            const fc=focusColors[w.focus]||"#6b7db3";
            const ec=effortColors[w.effort]||"#6b7db3";
            const isActive=selWeek===w.week;
            return (
              <div key={w.week} onClick={()=>setSelWeek(isActive?null:w.week)}
                style={{cursor:"pointer",borderRadius:10,padding:"10px 6px",textAlign:"center",border:`1px solid ${isActive?fc:"rgba(53,61,122,.4)"}`,background:isActive?fc+"12":"transparent",transition:"all .2s"}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:fc+"1a",border:`2px solid ${fc}55`,margin:"0 auto 5px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:11,fontWeight:800,color:fc}}>S{w.week}</span>
                </div>
                <p style={{fontSize:8,fontWeight:700,color:TH.subTxt||"#6b7db3",lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{w.theme}</p>
                <div style={{width:6,height:6,borderRadius:"50%",background:ec,margin:"4px auto 0"}}/>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{display:"flex",gap:14,marginTop:14,flexWrap:"wrap",justifyContent:"center"}}>
          {Object.entries(focusColors).map(([k,v])=>(
            <span key={k} style={{fontSize:9,display:"flex",alignItems:"center",gap:4,color:TH.subTxt||"#8892b8"}}>
              <span style={{width:8,height:8,borderRadius:2,background:v,display:"inline-block"}}/>{k}
            </span>
          ))}
          <span style={{fontSize:9,color:TH.iconCol||"#4a5480",fontStyle:"italic"}}>· {isFR?"Cercle bas = effort":"Bottom dot = effort"}</span>
        </div>
      </div>

      {/* Week detail panel */}
      {selectedWeek&&(
        <div style={{...CARD,border:`1px solid ${focusColors[selectedWeek.focus]||"#6b7db3"}44`,animation:"fadeUp .2s ease both"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{display:"flex",gap:7,marginBottom:5}}>
                <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:99,background:(focusColors[selectedWeek.focus]||"#6b7db3")+"18",color:focusColors[selectedWeek.focus]||"#6b7db3",border:`1px solid ${focusColors[selectedWeek.focus]||"#6b7db3"}44`}}>
                  {selectedWeek.focus}
                </span>
                <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:99,background:(effortColors[selectedWeek.effort]||"#6b7db3")+"18",color:effortColors[selectedWeek.effort]||"#6b7db3",border:`1px solid ${effortColors[selectedWeek.effort]||"#6b7db3"}44`}}>
                  {isFR?"Effort":"Effort"}: {selectedWeek.effort}
                </span>
              </div>
              <h3 style={{fontSize:16,fontWeight:700,color:TH.headTxt||"#e2e8f0",margin:0}}>
                {isFR?"Semaine":"Week"} {selectedWeek.week} — {selectedWeek.theme}
              </h3>
            </div>
            <button onClick={()=>setSelWeek(null)} style={{background:"none",border:"none",color:TH.iconCol||"#6b7db3",cursor:"pointer",fontSize:17,padding:4}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div>
              <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:9}}>
                {isFR?"📋 Tâches":"📋 Tasks"}
              </p>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {(selectedWeek.tasks||[]).map((t,i)=>(
                  <div key={i} style={{...SUB,padding:"9px 12px",display:"flex",gap:9,alignItems:"flex-start"}}>
                    <span style={{color:"#10b981",fontSize:13,flexShrink:0,marginTop:1}}>✓</span>
                    <span style={{fontSize:12,color:TH.subTxt||"#8892b8",lineHeight:1.5}}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{...SUB,padding:"12px 14px"}}>
                <p style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#10b981",marginBottom:5}}>
                  🏆 {isFR?"Livrable clé":"Key milestone"}
                </p>
                <p style={{fontSize:13,fontWeight:600,color:TH.headTxt||"#e2e8f0"}}>{selectedWeek.milestone}</p>
              </div>
              <div style={{...SUB,padding:"12px 14px"}}>
                <p style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#f59e0b",marginBottom:5}}>
                  📊 KPI
                </p>
                <p style={{fontSize:12,color:TH.subTxt||"#8892b8"}}>{selectedWeek.kpi}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resources */}
      {result.resources&&(
        <div style={CARD}>
          <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:14}}>
            {isFR?"🛠 Ressources nécessaires":"🛠 Required resources"}
          </p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}>
            <div style={{...SUB,padding:"12px 14px"}}>
              <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:4}}>{isFR?"Budget estimé":"Estimated budget"}</div>
              <div style={{fontSize:18,fontWeight:800,color:"#10b981"}}>{result.resources.budget}</div>
            </div>
            <div style={{...SUB,padding:"12px 14px"}}>
              <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:7}}>{isFR?"Compétences":"Skills"}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {(result.resources.skills||[]).map((s,i)=>(
                  <span key={i} style={{fontSize:10,padding:"2px 9px",borderRadius:99,background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.2)",color:"#60a5fa"}}>{s}</span>
                ))}
              </div>
            </div>
            <div style={{...SUB,padding:"12px 14px"}}>
              <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:7}}>{isFR?"Outils":"Tools"}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {(result.resources.tools||[]).map((t,i)=>(
                  <span key={i} style={{fontSize:10,padding:"2px 9px",borderRadius:99,background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.2)",color:"#f59e0b"}}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success metrics */}
      {result.successMetrics&&(
        <div style={CARD}>
          <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#10b981",marginBottom:12}}>
            ✅ {isFR?"Indicateurs de succès à 90 jours":"90-day success metrics"}
          </p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:9}}>
            {result.successMetrics.map((m,i)=>(
              <div key={i} style={{...SUB,padding:"11px 14px",borderLeft:"3px solid #10b981",display:"flex",alignItems:"center",gap:9}}>
                <span style={{color:"#10b981",fontSize:14,flexShrink:0}}>✓</span>
                <span style={{fontSize:12,color:TH.subTxt||"#8892b8",lineHeight:1.4}}>{m}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ══════════════════════════════════════════════
//  PRODUCT FINDER
// ══════════════════════════════════════════════
function ProductFinder({result,loading,isFR,TH={}}) {
  const [sel,  setSel]  = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const L = isFR ? {
    loading:"Recherche de produits…", ov:"Vue du Marché", chart:"Demande & Concurrence",
    detail:"Détails Produit", hint:"Clic sur une barre pour les détails",
    demand:"Demande", ease:"Facilité concurrence", margin:"Marge",
    price:"Prix vente", cost:"Coût", sourcing:"Sourcing",
    hook:"Angle marketing", audience:"Cible",
    export:"Exporter PDF",
    pdfTitle:"Rapport Product Hunter",
    pdfSub:"Analyse de niche & produits gagnants",
  } : {
    loading:"Hunting products…", ov:"Market Overview", chart:"Demand & Competition",
    detail:"Product Details", hint:"Click a bar for details",
    demand:"Demand", ease:"Competition ease", margin:"Margin",
    price:"Selling price", cost:"Cost", sourcing:"Sourcing",
    hook:"Marketing hook", audience:"Target audience",
    export:"Export PDF",
    pdfTitle:"Product Hunter Report",
    pdfSub:"Niche analysis & winning products",
  };

  const TV = v => isFR
    ? ({LOW:"FAIBLE",MEDIUM:"MOYEN",HIGH:"ÉLEVÉE",EASY:"FACILE",HARD:"DIFFICILE",
        PHYSICAL:"PHYSIQUE",DIGITAL:"DIGITAL",UP:"↑ HAUSSE",DOWN:"↓ BAISSE",STABLE:"→ STABLE"}[v]||v)
    : v;
  const CN  = v => v==="LOW"?82:v==="MEDIUM"?50:18;
  const tCol= t => t==="UP"?"#10b981":t==="DOWN"?"#ef4444":"#8892b8";
  const CARD= {background:TH.cardBg||C.card, border:`1px solid ${TH.cardBdr||C.bdr}`, backdropFilter:"blur(20px)", borderRadius:16, padding:20};
  const SUB = {background:TH.subBg||C.sub,   border:`1px solid ${TH.subBdr||C.subBdr}`, borderRadius:9};

  // ── Export PDF ──────────────────────────────────────────────────────────
  const exportPDF = () => {
    if (!result) return;
    setPdfLoading(true);
    const safe = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const products = result.suggestions || [];
    const dateStr  = new Date().toLocaleDateString(isFR?"fr-FR":"en-US",{year:"numeric",month:"long",day:"numeric"});

    // Palette couleurs niveau demande
    const dCol = v => v>=75?"#10b981":v>=50?"#f59e0b":"#ef4444";
    const cColMap = {LOW:"#10b981",EASY:"#10b981",MEDIUM:"#f59e0b",HIGH:"#ef4444",HARD:"#ef4444"};
    const cCol  = v => cColMap[v]||"#6b7db3";
    const tIcon = t => t==="UP"?"↑":t==="DOWN"?"↓":"→";
    const tC    = t => t==="UP"?"#10b981":t==="DOWN"?"#ef4444":"#6b7db3";

    // Build product cards HTML
    let cardsHTML = "";
    products.forEach((p, idx) => {
      const demandCol = dCol(p.demandScore);
      const compCol   = cCol(p.competitionLevel);
      const diffCol   = cCol(p.sourcingDifficulty);
      const trendCol2 = tC(p.marketTrend);
      const margin    = parseInt(p.profitMargin)||0;
      cardsHTML +=
        '<div style="break-inside:avoid;border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin-bottom:16px;background:#fafafa">'
        // Header row
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">'
        +'<div>'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        +'<span style="font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:99px;'
        +(p.type==="PHYSICAL"
          ? 'background:#fff7ed;border:1px solid #fed7aa;color:#ea580c'
          : 'background:#ecfeff;border:1px solid #a5f3fc;color:#0891b2')
        +'">'+safe(TV(p.type))+'</span>'
        +'<span style="font-size:10px;color:#9ca3af">'+safe(p.productFormat)+'</span>'
        +'</div>'
        +'<h3 style="font-size:15px;font-weight:800;color:#111827;margin:0">'+safe(p.name)+'</h3>'
        +'</div>'
        // Score circle
        +'<div style="text-align:center">'
        +'<div style="width:48px;height:48px;border-radius:50%;background:'+demandCol+'18;border:2px solid '+demandCol
        +';display:flex;align-items:center;justify-content:center;flex-direction:column">'
        +'<span style="font-size:14px;font-weight:900;color:'+demandCol+'">'+p.demandScore+'</span>'
        +'</div>'
        +'<div style="font-size:9px;color:'+trendCol2+';font-weight:700;margin-top:3px">'+tIcon(p.marketTrend)+' '+safe(TV(p.marketTrend))+'</div>'
        +'</div></div>'
        // Bars
        +'<div style="margin-bottom:12px">'
        +'<div style="margin-bottom:6px">'
        +'<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px">'
        +'<span style="color:#6b7280">'+(isFR?"Demande":"Demand")+'</span><strong style="color:'+demandCol+'">'+p.demandScore+'%</strong></div>'
        +'<div style="height:5px;background:#e5e7eb;border-radius:3px">'
        +'<div style="height:5px;border-radius:3px;width:'+p.demandScore+'%;background:'+demandCol+'"></div></div></div>'
        +'<div>'
        +'<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px">'
        +'<span style="color:#6b7280">'+(isFR?"Marge":"Margin")+'</span><strong style="color:#10b981">'+safe(p.profitMargin)+'</strong></div>'
        +'<div style="height:5px;background:#e5e7eb;border-radius:3px">'
        +'<div style="height:5px;border-radius:3px;width:'+margin+'%;background:#10b981"></div></div></div></div>'
        // Details grid
        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">'
        +'<div style="background:#fff;border:1px solid #e5e7eb;border-radius:7px;padding:8px">'
        +'<div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px">'+(isFR?"Prix vente":"Sell price")+'</div>'
        +'<div style="font-size:12px;font-weight:700;color:#111827">'+safe(p.sellingPrice)+'</div></div>'
        +'<div style="background:#fff;border:1px solid #e5e7eb;border-radius:7px;padding:8px">'
        +'<div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px">'+(isFR?"Coût":"Cost")+'</div>'
        +'<div style="font-size:12px;font-weight:700;color:#6b7280">'+safe(p.estimatedCost)+'</div></div>'
        +'<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;padding:8px">'
        +'<div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#15803d;margin-bottom:2px">'+(isFR?"Marge":"Margin")+'</div>'
        +'<div style="font-size:12px;font-weight:700;color:#16a34a">'+safe(p.profitMargin)+'</div></div></div>'
        // Competition + Difficulty badges
        +'<div style="display:flex;gap:8px;margin-bottom:10px">'
        +'<span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:99px;background:'+compCol+'18;border:1px solid '+compCol+'44;color:'+compCol+'">'
        +(isFR?"Concurrence":"Competition")+': '+safe(TV(p.competitionLevel))+'</span>'
        +'<span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:99px;background:'+diffCol+'18;border:1px solid '+diffCol+'44;color:'+diffCol+'">'
        +'Sourcing: '+safe(TV(p.sourcingDifficulty))+'</span>'
        +'<span style="font-size:9px;color:#6b7280">'+safe(p.monthlySearchVolume||"")+'</span>'
        +'</div>'
        // Hook + Sourcing advice
        +'<div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:7px;padding:9px;margin-bottom:8px">'
        +'<div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#7c3aed;margin-bottom:3px">'+(isFR?"Angle Marketing":"Marketing Hook")+'</div>'
        +'<div style="font-size:11px;color:#374151;font-style:italic">"'+safe(p.marketingHook)+'"</div></div>'
        +'<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;padding:9px">'
        +'<div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:3px">Sourcing</div>'
        +'<div style="font-size:11px;color:#475569">'+safe(p.sourcingAdvice)+'</div>'
        +'<div style="font-size:10px;color:#94a3b8;margin-top:4px">'+(isFR?"Cible":"Target")+': '+safe(p.targetAudience)+'</div></div>'
        +'</div>';
    });

    const html =
      '<!DOCTYPE html>\n<html lang="'+(isFR?"fr":"en")+'">\n<head>\n'
      +'<meta charset="UTF-8">\n'
      +'<title>'+safe(result.niche||"Niche")+' — '+safe(L.pdfTitle)+'</title>\n'
      +'<style>\n'
      +'*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}\n'
      +'body{background:#fff;color:#111827;padding:40px;max-width:900px;margin:0 auto}\n'
      +'h2{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#7c3aed;margin:24px 0 10px;padding-bottom:5px;border-bottom:1px solid #ede9fe}\n'
      +'@media print{@page{margin:1.5cm}body{padding:0}h2{margin-top:18px}}\n'
      +'</style>\n</head>\n<body>\n'
      // Header
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:3px solid #7c3aed">\n'
      +'<div>'
      +'<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#7c3aed">Future Vision Suite — Product Hunter</div>'
      +'<div style="font-size:22px;font-weight:800;color:#111827;margin:6px 0 3px">'+safe(L.pdfTitle)+'</div>'
      +'<div style="font-size:13px;color:#6b7280">'+safe(L.pdfSub)+'</div>'
      +'</div>'
      +'<div style="text-align:right;font-size:11px;color:#9ca3af">'+dateStr+'</div></div>\n'
      // Market overview
      +'<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:16px;margin-bottom:20px">'
      +'<div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#7c3aed;margin-bottom:6px">'+(isFR?"Vue du Marché":"Market Overview")+'</div>'
      +'<p style="font-size:13px;line-height:1.65;color:#374151">'+safe(result.marketOverview)+'</p>'
      +'</div>\n'
      // Summary stats
      +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">'
      +'<div style="border:1px solid #e5e7eb;border-radius:9px;padding:14px;text-align:center">'
      +'<div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">'+(isFR?"Produits analysés":"Products analyzed")+'</div>'
      +'<div style="font-size:28px;font-weight:900;color:#7c3aed">'+products.length+'</div></div>'
      +'<div style="border:1px solid #e5e7eb;border-radius:9px;padding:14px;text-align:center">'
      +'<div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">'+(isFR?"Score moyen demande":"Avg demand score")+'</div>'
      +'<div style="font-size:28px;font-weight:900;color:#10b981">'
      +(products.length ? Math.round(products.reduce((s,p)=>s+p.demandScore,0)/products.length) : 0)
      +'</div></div>'
      +'<div style="border:1px solid #e5e7eb;border-radius:9px;padding:14px;text-align:center">'
      +'<div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">'+(isFR?"Tendance dominante":"Top trend")+'</div>'
      +'<div style="font-size:20px;font-weight:900;color:#f59e0b">'
      +(()=>{const ups=products.filter(p=>p.marketTrend==="UP").length; return ups>products.length/2?(isFR?"↑ HAUSSE":"↑ RISING"):(isFR?"→ STABLE":"→ STABLE");})()
      +'</div></div></div>\n'
      // Products
      +'<h2>'+(isFR?"Produits Recommandés":"Recommended Products")+'</h2>\n'
      +cardsHTML
      // Footer
      +'<div style="margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center">'
      +'Future Vision Suite &nbsp;·&nbsp; '+(isFR?"Propulsé par Claude":"Powered by Claude")+' &nbsp;·&nbsp; '+dateStr
      +'</div>\n</body>\n</html>';

    const blob = new Blob([html], {type:"text/html;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const tab  = window.open(url, "_blank");
    if (tab) {
      tab.addEventListener("load", () => { setTimeout(() => { tab.focus(); tab.print(); }, 500); });
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = "product-hunter-rapport.html";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    setPdfLoading(false);
  };

  if(loading) return (
    <div style={{textAlign:"center",marginTop:64,width:"100%"}}>
      <div style={{width:46,height:46,border:"3px solid rgba(167,139,250,.18)",borderTop:"3px solid #a78bfa",borderRadius:"50%",margin:"0 auto 18px",animation:"spin 1s linear infinite"}}/>
      <p style={{color:"#a78bfa",fontSize:12,letterSpacing:".3em",textTransform:"uppercase",fontWeight:600}}>{L.loading}</p>
    </div>
  );
  if(!result) return null;

  const products = result.suggestions||[];
  const selected = sel!==null ? products[sel] : null;
  const barData  = products.map(p=>({name:p.name.length>13?p.name.slice(0,11)+"…":p.name, full:p.name, demand:p.demandScore, ease:CN(p.competitionLevel)}));
  const radialData = selected ? [
    {name:L.demand, value:selected.demandScore,               fill:"#818cf8"},
    {name:L.margin, value:parseInt(selected.profitMargin)||70, fill:"#10b981"},
    {name:L.ease,   value:selected.sourcingDifficulty==="EASY"?88:selected.sourcingDifficulty==="MEDIUM"?52:22, fill:"#f59e0b"},
  ] : [];

  const CTip = ({active,payload}) => active&&payload?.length
    ? <div style={{background:"#111442",border:"1px solid rgba(53,61,122,.7)",borderRadius:8,padding:"7px 12px",fontSize:11,fontWeight:600,color:"#e2e8f0"}}>{payload[0].payload.full}</div>
    : null;

  return (
    <div style={{width:"100%",maxWidth:1100,margin:"28px auto 60px",display:"flex",flexDirection:"column",gap:14,animation:"fadeUp .4s ease both"}}>

      {/* Export button */}
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <button onClick={exportPDF} disabled={pdfLoading}
          style={{display:"flex",alignItems:"center",gap:6,padding:"7px 15px",borderRadius:9,border:"1px solid rgba(124,58,237,.35)",background:"rgba(124,58,237,.1)",color:"#c4b5fd",fontSize:12,fontWeight:600,cursor:pdfLoading?"not-allowed":"pointer",opacity:pdfLoading?.7:1}}>
          {pdfLoading
            ? <><span style={{width:12,height:12,border:"2px solid rgba(196,181,253,.3)",borderTop:"2px solid #c4b5fd",borderRadius:"50%",display:"inline-block",animation:"spin 1s linear infinite"}}/>{isFR?"Génération…":"Generating…"}</>
            : <>📄 {L.export}</>}
        </button>
      </div>

      {/* Market overview */}
      <div style={CARD}>
        <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#60a5fa",marginBottom:9}}>{L.ov}</p>
        <p style={{fontSize:14,fontWeight:300,lineHeight:1.7,color:TH.subTxt||"#c8d0e8"}}>{result.marketOverview}</p>
      </div>

      {/* Bar chart */}
      <div style={CARD}>
        <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#a78bfa",marginBottom:14}}>{L.chart}</p>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={barData} margin={{top:0,right:8,left:-22,bottom:0}} barGap={3} barCategoryGap="25%">
            <XAxis dataKey="name" tick={{fill:"#8892b8",fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis domain={[0,100]} tick={{fill:"#6b7db3",fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip content={<CTip/>}/>
            <Bar dataKey="demand" radius={[4,4,0,0]} maxBarSize={20}>
              {barData.map((_,i)=><Cell key={i} fill={sc(barData[i].demand)} fillOpacity={sel===i?1:.65} cursor="pointer" onClick={()=>setSel(sel===i?null:i)}/>)}
            </Bar>
            <Bar dataKey="ease" radius={[4,4,0,0]} maxBarSize={20}>
              {barData.map((_,i)=><Cell key={i} fill="#6366f1" fillOpacity={sel===i?1:.4} cursor="pointer" onClick={()=>setSel(sel===i?null:i)}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{display:"flex",gap:16,marginTop:9,justifyContent:"center",flexWrap:"wrap"}}>
          {[["#10b981",L.demand],["#6366f1",L.ease]].map(([col,lbl])=>(
            <span key={lbl} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:TH.subTxt||"#8892b8"}}>
              <span style={{width:11,height:11,borderRadius:3,background:col,display:"inline-block"}}/>{lbl}
            </span>
          ))}
          <span style={{fontSize:10,color:TH.iconCol||"#4a5480",fontStyle:"italic"}}>{L.hint}</span>
        </div>
      </div>

      {/* Selected detail panel */}
      {selected&&(
        <div style={{...CARD,animation:"fadeUp .28s ease both"}}>
          <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#a78bfa",marginBottom:14}}>{L.detail} — {selected.name}</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:18}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:175}}>
              <ResponsiveContainer width={175} height={175}>
                <RadialBarChart innerRadius={26} outerRadius={74} data={radialData} startAngle={90} endAngle={-270}>
                  <RadialBar minAngle={10} dataKey="value" cornerRadius={4} background={{fill:"rgba(255,255,255,.04)"}}/>
                  <Legend iconSize={9} wrapperStyle={{fontSize:10,color:TH.subTxt||"#8892b8"}}/>
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:11}}>
              <div>
                <span style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3"}}>{TV(selected.type)} · {selected.productFormat}</span>
                <h3 style={{fontSize:17,fontWeight:700,color:TH.headTxt||"#e2e8f0",margin:"7px 0 13px"}}>{selected.name}</h3>
                <MBar label={L.demand} value={selected.demandScore} color={sc(selected.demandScore)}/>
                <MBar label={L.margin+" %"} value={parseInt(selected.profitMargin)||0} color="#10b981"/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {[[L.price+" / "+L.cost, selected.sellingPrice+" → "+selected.estimatedCost],
                  [L.hook, '"'+selected.marketingHook+'"'],
                  [L.audience, selected.targetAudience]].map(([l,v])=>(
                  <div key={l} style={{...SUB,padding:"9px 11px"}}>
                    <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",color:TH.iconCol||"#6b7db3",marginBottom:2}}>{l}</div>
                    <div style={{fontSize:12,color:TH.subTxt||"#c8d0e8",lineHeight:1.4}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Launch Speed + Country Analysis for selected product */}
      {selected&&(selected.launchSpeed||selected.countryAnalysis)&&(
        <HunterExtras product={selected} isFR={isFR} TH={TH}/>
      )}

      {/* Product cards grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(275px,1fr))",gap:13}}>
        {products.map((item,idx)=>{
          const dc=DC(item.sourcingDifficulty);
          const isAct=sel===idx;
          return (
            <div key={idx} onClick={()=>setSel(isAct?null:idx)}
              style={{...CARD,cursor:"pointer",transition:"all .22s",transform:isAct?"translateY(-3px)":"",
                border:isAct?"1px solid rgba(167,139,250,.55)":CARD.border,
                boxShadow:isAct?"0 0 20px rgba(167,139,250,.1)":""}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9}}>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",padding:"2px 8px",borderRadius:99,
                    ...(item.type==="PHYSICAL"
                      ?{background:"rgba(251,146,60,.1)",border:"1px solid rgba(251,146,60,.3)",color:"#fb923c"}
                      :{background:"rgba(34,211,238,.1)",border:"1px solid rgba(34,211,238,.3)",color:"#22d3ee"})}}>
                    {TV(item.type)}
                  </span>
                  <span style={{fontSize:10,color:TH.iconCol||"#6b7db3"}}>{item.productFormat}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                  <svg width="38" height="38" viewBox="0 0 38 38">
                    <circle cx="19" cy="19" r="14" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="3"/>
                    <circle cx="19" cy="19" r="14" fill="none" stroke={sc(item.demandScore)} strokeWidth="3"
                      strokeDasharray={`${(item.demandScore/100)*87.9} 87.9`}
                      strokeLinecap="round" transform="rotate(-90 19 19)"/>
                    <text x="19" y="23" textAnchor="middle" fontSize="9" fontWeight="800" fill={sc(item.demandScore)}>{item.demandScore}</text>
                  </svg>
                  <span style={{fontSize:10,fontWeight:700,color:tCol(item.marketTrend)}}>
                    {item.marketTrend==="UP"?"↑":item.marketTrend==="DOWN"?"↓":"→"}
                  </span>
                </div>
              </div>
              <h3 style={{fontSize:13,fontWeight:700,color:TH.headTxt||"#e2e8f0",marginBottom:11,lineHeight:1.3}}>{item.name}</h3>
              <MBar label={L.demand} value={item.demandScore} color={sc(item.demandScore)}/>
              <MBar label={L.margin} value={parseInt(item.profitMargin)||0} color="#10b981"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,margin:"10px 0"}}>
                <div style={{...SUB,padding:"7px 9px"}}>
                  <div style={{fontSize:9,textTransform:"uppercase",fontWeight:700,color:TH.iconCol||"#6b7db3",marginBottom:2}}>{L.price}</div>
                  <div style={{fontSize:11,fontWeight:700,color:TH.headTxt||"#c8d0e8"}}>{item.sellingPrice}</div>
                </div>
                <div style={{...SUB,padding:"7px 9px"}}>
                  <div style={{fontSize:9,textTransform:"uppercase",fontWeight:700,color:TH.iconCol||"#6b7db3",marginBottom:2}}>{L.cost}</div>
                  <div style={{fontSize:11,fontWeight:700,color:TH.subTxt||"#8892b8"}}>{item.estimatedCost}</div>
                </div>
                <div style={{gridColumn:"1/-1",padding:"6px 10px",borderRadius:7,background:"rgba(16,185,129,.08)",display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:9,textTransform:"uppercase",fontWeight:700,color:"#10b981"}}>{L.margin}</span>
                  <span style={{fontSize:12,fontWeight:800,color:"#10b981"}}>{item.profitMargin}</span>
                </div>
              </div>
              <div style={{...SUB,padding:"8px 10px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:9,textTransform:"uppercase",fontWeight:700,color:TH.iconCol||"#6b7db3"}}>{L.sourcing}</span>
                  <span style={{fontSize:9,fontWeight:700,padding:"1px 7px",borderRadius:99,background:dc.bg,border:`1px solid ${dc.bd}`,color:dc.col}}>{TV(item.sourcingDifficulty)}</span>
                </div>
                <p style={{fontSize:11,color:TH.subTxt||"#8892b8",lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{item.sourcingAdvice}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  HISTORY DRAWER
// ══════════════════════════════════════════════
function HistoryDrawer({open,onClose,history,onSelect,onClear,isFR,TH={}}) {
  if(!open) return null;
  const fmt=ts=>new Date(ts).toLocaleString(isFR?"fr-FR":"en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",backdropFilter:"blur(6px)",zIndex:60}}/>
      <div style={{position:"fixed",top:0,right:0,bottom:0,width:"min(360px,100vw)",background:TH.drawerBg||"rgba(13,16,51,.98)",borderLeft:`1px solid ${TH.drawerBdr||"rgba(53,61,122,.6)"}`,backdropFilter:"blur(24px)",zIndex:70,display:"flex",flexDirection:"column",animation:"slideIn .25s ease"}}>
        <div style={{padding:"18px 22px",borderBottom:"1px solid rgba(53,61,122,.5)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <span style={{color:"#60a5fa",fontSize:17}}>⊙</span>
            <h2 style={{fontSize:16,fontWeight:700,color:TH.headTxt||"#e2e8f0"}}>{isFR?"Historique":"History"}</h2>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#6b7db3",cursor:"pointer",fontSize:17,padding:4}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:9}}>
          {history.length===0
            ?<p style={{textAlign:"center",marginTop:50,color:TH.iconCol||"#6b7db3",fontSize:13}}>{isFR?"Aucun historique.":"No history yet."}</p>
            :history.map(h=>(
              <div key={h.id} onClick={()=>{onSelect(h);onClose();}}
                style={{padding:"11px 13px",borderRadius:11,border:`1px solid ${TH.cardBdr||"rgba(53,61,122,.4)"}`,background:TH.subBg||"rgba(255,255,255,.04)",cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,...(h.tool==="analyzer"?{background:"rgba(96,165,250,.12)",color:"#60a5fa"}:{background:"rgba(167,139,250,.12)",color:"#a78bfa"})}}>
                    {h.tool==="analyzer"?"Analyzer":"Hunter"} · {h.isFR?"FR":"EN"}
                  </span>
                  <span style={{fontSize:10,color:TH.iconCol||"#6b7db3"}}>{fmt(h.ts)}</span>
                </div>
                <p style={{fontSize:12,fontWeight:500,color:TH.headTxt||"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.query}</p>
              </div>
            ))}
        </div>
        {history.length>0&&(
          <div style={{padding:"10px 12px",borderTop:"1px solid rgba(53,61,122,.5)"}}>
            <button onClick={onClear} style={{width:"100%",padding:"9px",borderRadius:9,background:"none",border:"1px solid rgba(239,68,68,.3)",color:"#f87171",cursor:"pointer",fontSize:12,fontWeight:600}}>
              🗑 {isFR?"Effacer tout":"Clear All"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════
//  APP
// ══════════════════════════════════════════════
export default function App() {
  const [isFR,   setIsFR]   = useState(true);
  const [tool,   setTool]   = useState("analyzer");
  const [anim,   setAnim]   = useState(1);
  const [dark,   setDark]   = useState(true);
  const [histO,  setHistO]  = useState(false);
  const [toolM,  setToolM]  = useState(false);
  const [hist,   setHist]   = useState([]);

  // Suggestions pool (rotate after each query)
  const SUGS_FR = [
    "Styliste Personnel IA","Vote Blockchain","Cours Productivité",
    "Marketplace Freelance","SaaS Finance Africaine","Newsletter Premium",
    "App Méditation Africaine","Plugin No-Code","Coaching en ligne",
    "Abonnement Box Beauté","Template Notion","Agence IA locale",
  ];
  const SUGS_EN = [
    "AI Personal Stylist","Blockchain Voting","Productivity Course",
    "Freelance Marketplace","African Finance SaaS","Premium Newsletter",
    "No-Code Plugin","Online Coaching","Beauty Subscription Box",
    "Notion Template","Local AI Agency","VR Language Learning",
  ];
  const pickSugs = (fr, exclude=[]) => {
    const pool = (fr ? SUGS_FR : SUGS_EN).filter(s => !exclude.includes(s));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  };
  const [suggestions, setSuggestions] = useState(() => pickSugs(true));

  // Niche suggestions pool (rotate after each hunt)
  const NICHES_FR = [
    "Sport à domicile","Accessoires animaux","Beauté naturelle","Décoration maison",
    "Bien-être & méditation","Formation en ligne","Jardinage urbain","Alimentation saine",
    "Gadgets tech","Mode éthique","Parentalité","Finance personnelle",
  ];
  const NICHES_EN = [
    "Home gym equipment","Pet accessories","Natural beauty","Home decor",
    "Wellness & meditation","Online education","Urban gardening","Healthy food",
    "Tech gadgets","Ethical fashion","Parenting","Personal finance",
  ];
  const pickNicheSugs = (fr, exclude=[]) => {
    const pool = (fr ? NICHES_FR : NICHES_EN).filter(s => !exclude.includes(s));
    return [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
  };
  const [nicheSugs, setNicheSugs] = useState(() => pickNicheSugs(true));

  // Analyzer
  const [idea,    setIdea]    = useState("");
  const [aRes,    setARes]    = useState(null);
  const [aLoad,   setALoad]   = useState(false);
  const [aErr,    setAErr]    = useState("");
  const [pivots,  setPivots]  = useState(null);
  const [pivLoad, setPivLoad] = useState(false);

  // Roadmap
  const [rmIdea,  setRmIdea]  = useState("");
  const [rmRes,   setRmRes]   = useState(null);
  const [rmLoad,  setRmLoad]  = useState(false);
  const [rmErr,   setRmErr]   = useState("");

  // Hunter
  const [niche,   setNiche]   = useState("");
  const [pType,   setPType]   = useState("BOTH");
  const [diff,    setDiff]    = useState("Any");
  const [budget,  setBudget]  = useState("Any");
  const [hRes,    setHRes]    = useState(null);
  const [hLoad,   setHLoad]   = useState(false);
  const [hErr,    setHErr]    = useState("");

  const isA  = tool === "analyzer";
  const isH  = tool === "hunter";
  const isRM = tool === "roadmap";

  const addHist = useCallback(entry => {
    setHist(prev => {
      const next = [entry, ...prev].slice(0,40);
      return next;
    });
  }, []);

  // ── Analyze ──
  const doAnalyze = useCallback(async (q) => {
    const query = (q || idea).trim();
    if (!query) return;
    if (q) setIdea(q);
    setALoad(true); setAErr(""); setARes(null); setPivots(null);
    try {
      const {sys, user} = promptAnalyze(query, isFR);
      const data = await askClaude(sys, user, 1600);
      setARes(data);
      addHist({id:Date.now(), ts:Date.now(), tool:"analyzer", isFR, query, result:data});
      setSuggestions(pickSugs(isFR, [query]));
    } catch(e) {
      setAErr(e.message);
    } finally {
      setALoad(false);
    }
  }, [idea, isFR, addHist]);

  // ── Pivot ──
  const doPivot = useCallback(async () => {
    if (!aRes || !idea.trim() || pivLoad) return;
    setPivLoad(true);
    try {
      const {sys, user} = promptPivot(idea, aRes.verdict, isFR);
      const data = await askClaude(sys, user, 1000);
      setPivots(data);
    } catch(e) {
      console.error(e);
    } finally {
      setPivLoad(false);
    }
  }, [aRes, idea, isFR, pivLoad]);

  // ── Hunt ──
  const doHunt = useCallback(async (overrideNiche) => {
    const q = (overrideNiche || niche).trim();
    if (overrideNiche) setNiche(overrideNiche);
    if (!q) return;
    setHLoad(true); setHErr(""); setHRes(null);
    try {
      const {sys, user} = promptHunt(q, pType, diff, budget, isFR);
      const data = await askClaude(sys, user, 1600);
      // Attach the searched niche to result for the PDF
      data.niche = q;
      setHRes(data);
      addHist({id:Date.now(), ts:Date.now(), tool:"hunter", isFR, query:`${q} (${pType})`, result:data});
      // Rotate niche chips
      setNicheSugs(pickNicheSugs(isFR, [q]));
    } catch(e) {
      setHErr(e.message);
    } finally {
      setHLoad(false);
    }
  }, [niche, pType, diff, budget, isFR, addHist]);

  // ── Roadmap ──
  const doRoadmap = useCallback(async (q) => {
    const query = (q || rmIdea).trim();
    if (!query) return;
    if (q) setRmIdea(q);
    setRmLoad(true); setRmErr(""); setRmRes(null);
    try {
      const {sys, user} = promptRoadmap(query, isFR);
      const data = await askClaude(sys, user, 2000);
      setRmRes(data);
      addHist({id:Date.now(), ts:Date.now(), tool:"roadmap", isFR, query, result:data});
    } catch(e) {
      setRmErr(e.message);
    } finally {
      setRmLoad(false);
    }
  }, [rmIdea, isFR, addHist]);

  // ── Restore history ──
  const doRestore = useCallback(h => {
    setTool(h.tool); setIsFR(h.isFR);
    if (h.tool==="analyzer") { setIdea(h.query); setARes(h.result); setPivots(null); setAErr(""); }
    else if (h.tool==="hunter") { setNiche(h.query.replace(/\s*\(.*\)$/,"")); setHRes(h.result); setHErr(""); }
    else if (h.tool==="roadmap") { setRmIdea(h.query); setRmRes(h.result); setRmErr(""); }
    setSuggestions(pickSugs(h.isFR, [h.query]));
  }, []);

  const T = isFR ? {
    appN:"Future Vision", huntN:"Product Hunter", roadmapN:"Roadmap 90j",
    aTit:"Analysez votre", aHL:"Vision Digitale",
    aSub:"Transformez vos concepts en stratégies produits vérifiées instantanément.",
    aPH:"Décrivez votre idée de produit…", aBtn:"ANALYSER L'IDÉE",
    aSug:suggestions,
    hTit:"Trouvez des", hHL:"Produits Gagnants",
    hSub:"Identifiez des produits à fort potentiel avec données de demande précises.",
    hPH:"Entrez une niche (ex: Sport Maison, Accessoires Animaux)…", hBtn:"TROUVER DES PRODUITS",
    hTypes:{both:"Tous",physical:"Physique",digital:"Digital"},
    hF:{bLabel:"Budget",bAny:"Peu importe",bLow:"Faible (<100€)",bMed:"Moyen (100-1K€)",bHigh:"Élevé (>1K€)",dLabel:"Difficulté",dAny:"Peu importe",dEasy:"Débutant",dMed:"Intermédiaire",dHard:"Avancé"},
    sug:"ESSAYEZ :", proc:"TRAITEMENT…", foot:"Future Vision Suite. Propulsé par Claude.",
  } : {
    appN:"Future Vision", huntN:"Product Hunter", roadmapN:"90d Roadmap",
    aTit:"Analyze your", aHL:"Digital Vision",
    aSub:"Transform abstract concepts into verified, data-driven product strategies instantly.",
    aPH:"Describe your product idea…", aBtn:"ANALYZE IDEA",
    aSug:suggestions,
    hTit:"Find Winning", hHL:"Niche Products",
    hSub:"Identify high-profit products with precise demand and competition data.",
    hPH:"Enter a niche (e.g. Home Gym, Pet Accessories)…", hBtn:"FIND PRODUCTS",
    hTypes:{both:"All",physical:"Physical",digital:"Digital"},
    hF:{bLabel:"Budget",bAny:"Any",bLow:"Low (<$100)",bMed:"Med ($100-$1K)",bHigh:"High (>$1K)",dLabel:"Difficulty",dAny:"Any",dEasy:"Beginner",dMed:"Intermediate",dHard:"Advanced"},
    sug:"TRY:", proc:"PROCESSING…", foot:"Future Vision Suite. Powered by Claude.",
  };

  // ── Theme palette (dark / light) ──────────────────────────────
  const TH = dark ? {
    pageBg:   "#0d1033",
    cardBg:   "rgba(17,20,66,.82)",
    cardBdr:  "rgba(53,61,122,.55)",
    subBg:    "rgba(255,255,255,.04)",
    subBdr:   "rgba(53,61,122,.4)",
    inputBg:  "#161b3d",
    inputBdr: "#2a3060",
    chipBg:   "#1e2347",
    chipBdr:  "#353d7a",
    headTxt:  "#e2e8f0",
    subTxt:   "#8892b8",
    iconCol:  "#6b7db3",
    btnBg:    "#dde1f0",
    btnTx:    "#0d1033",
    drawerBg: "rgba(13,16,51,.98)",
    drawerBdr:"rgba(53,61,122,.6)",
    hBtnBg:   "rgba(255,255,255,.05)",
    hBtnBdr:  "rgba(53,61,122,.5)",
    placeholderCol: "#38406e",
    selectOptBg: "#111442",
    orbTop:   "radial-gradient(ellipse,rgba(55,48,163,.3) 0%,rgba(109,40,217,.1) 55%,transparent 75%)",
    orbBot:   "radial-gradient(ellipse,rgba(109,40,217,.09) 0%,transparent 70%)",
    scrollThumb: "rgba(53,61,122,.6)",
  } : {
    pageBg:   "#f0f2fa",
    cardBg:   "rgba(255,255,255,.92)",
    cardBdr:  "rgba(99,102,241,.18)",
    subBg:    "rgba(99,102,241,.05)",
    subBdr:   "rgba(99,102,241,.15)",
    inputBg:  "#ffffff",
    inputBdr: "#c7caed",
    chipBg:   "#e8eaf6",
    chipBdr:  "#c5c8e8",
    headTxt:  "#1a1a3e",
    subTxt:   "#5b6080",
    iconCol:  "#7b84b8",
    btnBg:    "#1a1a3e",
    btnTx:    "#ffffff",
    drawerBg: "rgba(240,242,250,.98)",
    drawerBdr:"rgba(99,102,241,.2)",
    hBtnBg:   "rgba(99,102,241,.08)",
    hBtnBdr:  "rgba(99,102,241,.25)",
    placeholderCol: "#9ba3c8",
    selectOptBg: "#f0f2fa",
    orbTop:   "radial-gradient(ellipse,rgba(99,102,241,.15) 0%,rgba(139,92,246,.06) 55%,transparent 75%)",
    orbBot:   "radial-gradient(ellipse,rgba(139,92,246,.06) 0%,transparent 70%)",
    scrollThumb: "rgba(99,102,241,.35)",
  };

  // style constants
  const BG=TH.pageBg, IC=TH.iconCol, HT=TH.headTxt, SB=TH.subTxt;
  const CHIP={bg:TH.chipBg,bd:TH.chipBdr};
  const BTN={bg:TH.btnBg,tx:TH.btnTx};
  const iB={bg:TH.inputBg,bd:TH.inputBdr};
  const hBtn={width:38,height:38,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:TH.hBtnBg,border:`1px solid ${TH.hBtnBdr}`,color:IC,cursor:"pointer",flexShrink:0};
  const sBar={display:"flex",alignItems:"center",background:iB.bg,border:`1px solid ${iB.bd}`,borderRadius:14,overflow:"hidden"};
  const anims=["⬜","☁","❄","💨","⛈"];
  const isLoading = isA ? aLoad : isH ? hLoad : rmLoad;

  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",flexDirection:"column",alignItems:"center",overflowX:"hidden",position:"relative"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;font-family:'Inter',sans-serif;}
        .syne{font-family:'Syne',sans-serif!important;}
        input::placeholder{color:${TH.placeholderCol};}
        select option{background:${TH.selectOptBg};color:${TH.headTxt};}
        ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:${TH.scrollThumb};border-radius:3px;}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}
        @keyframes slideIn{from{transform:translateX(100%);}to{transform:translateX(0);}}
        button:hover{filter:brightness(1.06);}
      `}</style>

      {/* Orbs */}
      <div style={{position:"fixed",top:"-8%",left:"50%",transform:"translateX(-50%)",width:800,height:500,borderRadius:"50%",background:TH.orbTop,pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",bottom:"-20%",right:"-5%",width:580,height:580,borderRadius:"50%",background:TH.orbBot,pointerEvents:"none",zIndex:0}}/>
      <Particles level={anim} dark={dark}/>

      {/* ── HEADER ── */}
      <header style={{position:"relative",zIndex:50,width:"100%",maxWidth:1200,padding:"13px 22px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,animation:"fadeUp .4s ease both"}}>
          <div style={{width:44,height:44,borderRadius:13,display:"flex",alignItems:"center",justifyContent:"center",
            background:isA?"linear-gradient(135deg,rgba(30,58,138,.7),rgba(17,20,66,.9))":isH?"linear-gradient(135deg,rgba(76,29,149,.7),rgba(17,20,66,.9))":"linear-gradient(135deg,rgba(6,78,59,.7),rgba(17,20,66,.9))",
            border:isA?"1px solid rgba(96,165,250,.25)":isH?"1px solid rgba(167,139,250,.25)":"1px solid rgba(16,185,129,.25)",
            boxShadow:isA?"0 4px 18px rgba(59,130,246,.25),inset 0 1px 0 rgba(255,255,255,.1)":isH?"0 4px 18px rgba(139,92,246,.25),inset 0 1px 0 rgba(255,255,255,.1)":"0 4px 18px rgba(16,185,129,.25),inset 0 1px 0 rgba(255,255,255,.1)"}}>
            {isA?<Logo3DAnalyzer size={36}/>:isH?<Logo3DHunter size={36}/>:<Logo3DRoadmap size={36}/>}
          </div>
          <span className="syne" style={{fontSize:16,fontWeight:700,color:TH.headTxt||HT,letterSpacing:"-.3px"}}>{isA?T.appN:isH?T.huntN:T.roadmapN}</span>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {/* Tool switcher */}
          <div style={{position:"relative"}}>
            <button style={{...hBtn,color:toolM?"#60a5fa":IC}} onClick={()=>setToolM(!toolM)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            </button>
            {toolM&&(
              <div style={{position:"absolute",right:0,top:45,width:210,borderRadius:13,border:`1px solid ${TH.cardBdr||"rgba(53,61,122,.6)"}`,padding:7,zIndex:60,background:TH.drawerBg||"rgba(13,16,51,.98)",backdropFilter:"blur(24px)",animation:"fadeUp .2s ease both"}}>
                <p style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",padding:"5px 9px 7px",color:TH.iconCol||IC}}>Applications</p>
                {[["analyzer",T.appN,"#60a5fa",<Logo3DAnalyzer size={24}/>],["hunter",T.huntN,"#a78bfa",<Logo3DHunter size={24}/>],["roadmap",T.roadmapN,"#10b981",<Logo3DRoadmap size={24}/>]].map(([t,lbl,col,logo])=>(
                  <button key={t} onClick={()=>{setTool(t);setToolM(false);setAErr("");setHErr("");setRmErr("");}}
                    style={{width:"100%",textAlign:"left",padding:"8px 9px",borderRadius:8,display:"flex",alignItems:"center",gap:9,fontSize:12,fontWeight:500,cursor:"pointer",border:"none",background:tool===t?"rgba(255,255,255,.06)":"transparent",color:tool===t?col:(TH.subTxt||"#c8d0e8"),transition:"all .15s"}}>
                    {logo}{lbl}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button style={hBtn} onClick={()=>setHistO(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>
            </svg>
          </button>

          {/* Dark/Light mode */}
          <button style={{...hBtn,color:dark?"#f59e0b":"#6366f1"}} onClick={()=>setDark(!dark)} title={dark?"Mode clair":"Mode sombre"}>
            {dark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>

          <button style={{...hBtn,color:anim>0?"#38bdf8":IC}} onClick={()=>setAnim(p=>p>=4?0:p+1)}>
            <span style={{fontSize:13}}>{anims[anim]}</span>
          </button>

          {/* Language pill */}
          <div style={{position:"relative"}}>
            <div style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <select value={isFR?"fr":"en"} onChange={e=>{const fr=e.target.value==="fr"; setIsFR(fr); setSuggestions(pickSugs(fr)); setNicheSugs(pickNicheSugs(fr));}}
              style={{appearance:"none",paddingLeft:26,paddingRight:24,paddingTop:7,paddingBottom:7,borderRadius:99,border:`1px solid ${CHIP.bd}`,background:CHIP.bg,color:HT,fontSize:11,fontWeight:700,letterSpacing:".08em",cursor:"pointer",outline:"none"}}>
              <option value="fr">FR</option>
              <option value="en">EN</option>
            </select>
            <div style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:IC,fontSize:9}}>▾</div>
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main style={{position:"relative",zIndex:10,width:"100%",maxWidth:1200,padding:"0 16px 60px",display:"flex",flexDirection:"column",alignItems:"center",paddingTop:32}}>

        {/* Title */}
        <div style={{textAlign:"center",marginBottom:40,maxWidth:820,animation:"fadeUp .45s ease both"}}>
          <h1 className="syne" style={{fontSize:"clamp(2rem,5vw,4rem)",fontWeight:800,lineHeight:1.08,color:TH.headTxt||HT,margin:0}}>
            {isA?T.aTit:isH?T.hTit:(isFR?"Planifiez votre":"Plan your")}<br/>
            <span style={{background:isRM?"linear-gradient(90deg,#10b981 0%,#34d399 55%,#6ee7b7 100%)":isH?"linear-gradient(90deg,#a78bfa 0%,#c084fc 55%,#f0abfc 100%)":"linear-gradient(90deg,#60a5fa 0%,#a78bfa 55%,#c084fc 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",filter:"drop-shadow(0 0 28px rgba(167,139,250,.35))"}}>
              {isA?T.aHL:isH?T.hHL:(isFR?"Lancement en 90 jours":"90-Day Launch")}
            </span>
          </h1>
          <p style={{fontSize:"clamp(.88rem,1.7vw,1.05rem)",color:TH.subTxt||SB,fontWeight:300,lineHeight:1.7,marginTop:16}}>
            {isA?T.aSub:isH?T.hSub:(isFR?"Transformez n'importe quelle idée en un plan d'action concret semaine par semaine, sur 90 jours.":"Turn any idea into a concrete week-by-week action plan over 90 days.")}
          </p>
        </div>

        {/* ── ANALYZER INPUT ── */}
        {isA&&(
          <>
            <div style={{width:"100%",maxWidth:820,animation:"fadeUp .5s ease both"}}>
              <div style={sBar}>
                <div style={{padding:"0 12px 0 17px",color:"#38406e",display:"flex",alignItems:"center",flexShrink:0}}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <input value={idea} onChange={e=>setIdea(e.target.value)} placeholder={T.aPH}
                  onKeyDown={e=>e.key==="Enter"&&!aLoad&&doAnalyze()}
                  style={{flex:1,padding:"16px 0",background:"transparent",border:"none",outline:"none",fontSize:15,fontWeight:300,color:TH.headTxt||HT}}/>
                <div style={{width:1,height:28,background:"rgba(53,61,122,.6)",flexShrink:0,margin:"0 4px"}}/>
                <div style={{padding:6,flexShrink:0}}>
                  <button onClick={()=>doAnalyze()} disabled={aLoad||!idea.trim()}
                    style={{padding:"10px 24px",borderRadius:9,fontWeight:700,fontSize:12,letterSpacing:".1em",border:"none",cursor:aLoad||!idea.trim()?"not-allowed":"pointer",background:aLoad||!idea.trim()?"rgba(53,61,122,.4)":BTN.bg,color:aLoad||!idea.trim()?IC:BTN.tx,display:"flex",alignItems:"center",gap:7,whiteSpace:"nowrap",transition:"all .18s"}}>
                    {aLoad?<><span style={{width:12,height:12,border:"2px solid rgba(0,0,0,.2)",borderTop:"2px solid #0d1033",borderRadius:"50%",display:"inline-block",animation:"spin 1s linear infinite"}}/>{T.proc}</>:T.aBtn}
                  </button>
                </div>
              </div>
            </div>
            <div style={{marginTop:18,display:"flex",flexWrap:"wrap",justifyContent:"center",alignItems:"center",gap:8,maxWidth:820,animation:"fadeUp .55s ease both"}}>
              <span style={{fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:".12em",color:IC}}>✦ {T.sug}</span>
              {T.aSug.map((s,i)=>(
                <button key={i} onClick={()=>!aLoad&&doAnalyze(s)} disabled={aLoad}
                  style={{fontSize:11,padding:"5px 13px",borderRadius:99,border:`1px solid ${CHIP.bd}`,background:CHIP.bg,color:TH.headTxt||HT,cursor:aLoad?"not-allowed":"pointer",fontWeight:500,transition:"all .18s",opacity:aLoad?.6:1}}>
                  {s}
                </button>
              ))}
            </div>
            {aErr&&<div style={{marginTop:14,padding:"11px 16px",background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.22)",borderRadius:9,color:"#f87171",fontSize:12,maxWidth:720,textAlign:"center",animation:"fadeUp .3s ease both"}}>{aErr}</div>}
          </>
        )}

        {/* ── HUNTER INPUT ── */}
        {isH&&(
          <>
            <div style={{width:"100%",maxWidth:900,animation:"fadeUp .5s ease both"}}>
              <div style={{...sBar,flexDirection:"column"}}>
                <div style={{display:"flex",width:"100%",alignItems:"center"}}>
                  <div style={{padding:"0 12px 0 17px",color:"#38406e",display:"flex",alignItems:"center",flexShrink:0}}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><polyline points="16.5 9.4 7.55 4.24"/><line x1="3.29" y1="7" x2="12" y2="12"/><line x1="12" y1="22" x2="12" y2="12"/><circle cx="18.5" cy="20.5" r="2.5"/><line x1="21" y1="23" x2="19.5" y2="21.5"/></svg>
                  </div>
                  <input value={niche} onChange={e=>setNiche(e.target.value)} placeholder={T.hPH}
                    onKeyDown={e=>e.key==="Enter"&&!hLoad&&doHunt()}
                    style={{flex:1,padding:"16px 0",background:"transparent",border:"none",outline:"none",fontSize:15,fontWeight:300,color:TH.headTxt||HT}}/>
                  <div style={{width:1,height:28,background:"rgba(53,61,122,.6)",flexShrink:0,margin:"0 4px"}}/>
                  <div style={{padding:6,flexShrink:0}}>
                    <button onClick={doHunt} disabled={hLoad||!niche.trim()}
                      style={{padding:"10px 20px",borderRadius:9,fontWeight:700,fontSize:12,letterSpacing:".1em",border:"none",cursor:hLoad||!niche.trim()?"not-allowed":"pointer",background:hLoad||!niche.trim()?"rgba(53,61,122,.4)":BTN.bg,color:hLoad||!niche.trim()?IC:BTN.tx,display:"flex",alignItems:"center",gap:7,whiteSpace:"nowrap"}}>
                      {hLoad?<><span style={{width:12,height:12,border:"2px solid rgba(0,0,0,.2)",borderTop:"2px solid #0d1033",borderRadius:"50%",display:"inline-block",animation:"spin 1s linear infinite"}}/>{T.proc}</>:T.hBtn}
                    </button>
                  </div>
                </div>
                {/* Filters */}
                <div style={{display:"flex",flexWrap:"wrap",gap:9,padding:"9px 13px 11px",borderTop:"1px solid rgba(53,61,122,.4)",width:"100%"}}>
                  {[
                    {label:"Type",val:pType,set:setPType,opts:[["BOTH",T.hTypes.both],["PHYSICAL",T.hTypes.physical],["DIGITAL",T.hTypes.digital]]},
                    {label:T.hF.bLabel,val:budget,set:setBudget,opts:[["Any",T.hF.bAny],["Low",T.hF.bLow],["Medium",T.hF.bMed],["High",T.hF.bHigh]]},
                    {label:T.hF.dLabel,val:diff,set:setDiff,opts:[["Any",T.hF.dAny],["Easy",T.hF.dEasy],["Medium",T.hF.dMed],["Hard",T.hF.dHard]]},
                  ].map(f=>(
                    <div key={f.label} style={{flex:1,minWidth:110}}>
                      <label style={{display:"block",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4,color:IC}}>{f.label}</label>
                      <select value={f.val} onChange={e=>f.set(e.target.value)}
                        style={{width:"100%",padding:"6px 9px",borderRadius:7,border:`1px solid ${CHIP.bd}`,background:CHIP.bg,color:HT,fontSize:11,fontWeight:600,cursor:"pointer",outline:"none",appearance:"none"}}>
                        {f.opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Niche suggestion chips */}
            <div style={{marginTop:18,display:"flex",flexWrap:"wrap",justifyContent:"center",alignItems:"center",gap:8,maxWidth:900,animation:"fadeUp .55s ease both"}}>
              <span style={{fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:".12em",color:IC}}>✦ {T.sug}</span>
              {nicheSugs.map((s,i)=>(
                <button key={i} onClick={()=>!hLoad&&doHunt(s)} disabled={hLoad}
                  style={{fontSize:11,padding:"5px 13px",borderRadius:99,border:`1px solid ${CHIP.bd}`,background:CHIP.bg,color:TH.headTxt||HT,cursor:hLoad?"not-allowed":"pointer",fontWeight:500,transition:"all .18s",opacity:hLoad?.6:1}}>
                  {s}
                </button>
              ))}
            </div>
            {hErr&&<div style={{marginTop:14,padding:"11px 16px",background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.22)",borderRadius:9,color:"#f87171",fontSize:12,maxWidth:720,textAlign:"center",animation:"fadeUp .3s ease both"}}>{hErr}</div>}
          </>
        )}

        {/* ── ROADMAP INPUT ── */}
        {isRM&&(
          <>
            <div style={{width:"100%",maxWidth:900,animation:"fadeUp .5s ease both"}}>
              <div style={{...sBar}}>
                <div style={{padding:"0 12px 0 17px",color:"#38406e",display:"flex",alignItems:"center",flexShrink:0}}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <input value={rmIdea} onChange={e=>setRmIdea(e.target.value)}
                  placeholder={isFR?"Décrivez votre idée ou produit à lancer…":"Describe the idea or product to launch…"}
                  onKeyDown={e=>e.key==="Enter"&&!rmLoad&&doRoadmap()}
                  style={{flex:1,padding:"16px 0",background:"transparent",border:"none",outline:"none",fontSize:15,fontWeight:300,color:TH.headTxt||HT}}/>
                <div style={{width:1,height:28,background:"rgba(53,61,122,.6)",flexShrink:0,margin:"0 4px"}}/>
                <div style={{padding:6,flexShrink:0}}>
                  <button onClick={()=>doRoadmap()} disabled={rmLoad||!rmIdea.trim()}
                    style={{padding:"10px 20px",borderRadius:9,fontWeight:700,fontSize:12,letterSpacing:".1em",border:"none",cursor:rmLoad||!rmIdea.trim()?"not-allowed":"pointer",background:rmLoad||!rmIdea.trim()?"rgba(53,61,122,.4)":BTN.bg,color:rmLoad||!rmIdea.trim()?IC:BTN.tx,display:"flex",alignItems:"center",gap:7,whiteSpace:"nowrap"}}>
                    {rmLoad?<><span style={{width:12,height:12,border:"2px solid rgba(0,0,0,.2)",borderTop:"2px solid #0d1033",borderRadius:"50%",display:"inline-block",animation:"spin 1s linear infinite"}}/>{T.proc}</>:isFR?"GÉNÉRER LA ROADMAP":"GENERATE ROADMAP"}
                  </button>
                </div>
              </div>
            </div>
            {rmErr&&<div style={{marginTop:14,padding:"11px 16px",background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.22)",borderRadius:9,color:"#f87171",fontSize:12,maxWidth:720,textAlign:"center",animation:"fadeUp .3s ease both"}}>{rmErr}</div>}
          </>
        )}

        {/* Results */}
        {isA
          ?<ResultCard result={aRes} loading={aLoad} isFR={isFR} idea={idea} onPivot={doPivot} pivots={pivots} pivotLoading={pivLoad} TH={TH}/>
          :isH
            ?<ProductFinder result={hRes} loading={hLoad} isFR={isFR} TH={TH}/>
            :<RoadmapTool result={rmRes} loading={rmLoad} isFR={isFR} TH={TH}/>
        }
      </main>

      <footer style={{position:"relative",zIndex:10,paddingBottom:18,fontSize:11,color:TH.iconCol?TH.iconCol+"99":"rgba(107,125,179,.5)",textAlign:"center"}}>
        © {new Date().getFullYear()} {T.foot}
      </footer>

      <HistoryDrawer open={histO} onClose={()=>setHistO(false)} history={hist} onSelect={doRestore} onClear={()=>{setHist([]);}} isFR={isFR} TH={TH}/>
    </div>
  );
}
