(function(){
"use strict";
/* ---------------------------------------------------------------
   MR-I READY — MRI TRIGEMINAL NERVE planning simulator (demonstration)
   Set-up (supine, head first, in the head coil) → 3-plane localiser acquired line by line in k-space → protocol →
   SAGITTAL 3D T1 first (whole head, straight on the mid-line) → drag the sagittal into a box → TILT the thin AXIAL
   block square to the brainstem and the thin CORONAL block along it → images → debrief.
   Everything lives in DICOM patient space (LPS, mm): +x patient left, +y posterior, +z superior. Each panel shows an
   image with its real IPP / IOP, and plan boxes are projected onto it, so they line up on localisers and series alike.
   --------------------------------------------------------------- */
var BASE = "./assets/";
var C = window.MRS_CALIB, LN = C.loc.n, SER = C.ser, LM = C.lm, HH = LM.conf, PONS = LM.pons, UP = C.up, BACK = C.back;
var ASSETS = window.SCG_ASSETS || null, LOCIMG = window.MRS_LOCIMG || {};
var PNG = { logo_full:1, logo_mark:1, loc_sag:1, loc_cor:1, loc_ax:1 };
/* the localisers also ship as data URIs in calib.js, so the k-space step works when the page is opened from disk */
function url(n){ return ASSETS ? ASSETS[n] : (n.indexOf("loc_")===0 && LOCIMG[n.slice(4)]) ? LOCIMG[n.slice(4)] : BASE + n + (PNG[n] ? ".png" : ".jpg"); }
function low(s){ return s.charAt(0)+s.slice(1).toLowerCase(); }
function pad2(n){ return (n<10?"0":"")+n; }
function imgName(id, k){ return id+"_"+pad2(k); }
var $ = function(id){ return document.getElementById(id); };
var stage=$("scgStage"), vp=$("scgViewport"), grid=$("mreGrid"), viewEl=$("mreView"), viewCv=$("mreViewCv"),
    acqEl=$("scgAcq"), acqTitle=$("scgAcqTitle"), acqNum=$("scgAcqNum"),
    vpTL=$("scgVpTL"), vpBL=$("scgVpBL"), vpBR=$("scgVpBR"),
    railTitle=$("scgRailTitle"), railDesc=$("scgRailDesc"), railBody=$("scgRailBody"),
    cmds=$("scgCmds"), cliForm=$("scgCliForm"), cli=$("scgCli"), logEl=$("scgLog"), phaseChip=$("scgPhaseChip"),
    titleEl=$("scgTitle"), resultEl=$("scgResult"), room=$("scgRoom"), info=$("mreInfo"),
    stackUI=$("scgStackUI"), stackSlider=$("scgStackSlider"), winBtns=$("scgWinBtns"), achWrap=$("scgAch");
var CELL = {};
Array.prototype.forEach.call(grid.querySelectorAll(".mre-cell"), function(c){
  CELL[c.dataset.p] = { el:c, sq:c.querySelector(".mre-sq"), cv:c.querySelector("canvas"), img:c.querySelector("img"),
                        svg:c.querySelector("svg"), lab:c.querySelector(".mre-lab"), lab2:c.querySelector(".mre-lab2") };
});

$("scgMarkMini").innerHTML = '<img class="scg-mark-ic" src="'+url("logo_mark")+'" alt="Rad-Lad">'+
  '<div class="scg-mark-tx"><b>MR-I&nbsp;READY&nbsp;·&nbsp;TRIGEMINAL&nbsp;NERVE</b><span>Rad-Lad&nbsp;·&nbsp;Illuminate&nbsp;the&nbsp;Invisible</span></div>';
$("scgLogoBig").src = url("logo_full"); $("scgAchLogo").src = url("logo_mark");
$("scgT1").src = url("loc_sag"); $("scgT2").src = url("loc_cor"); $("scgT3").src = url("loc_ax");
["sag","cor","ax"].forEach(function(p){ CELL[p].img.src = url("loc_"+p); });
CELL.x.img.style.display = "none";
function playAchievement(){ achWrap.classList.remove("is-playing"); void achWrap.offsetWidth; achWrap.classList.add("is-playing"); }
$("scgAchReplay").addEventListener("click", playAchievement);

/* ---- small vector kit (3-vectors as arrays) ---- */
function add(a,b){ return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function sub(a,b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function mul(a,s){ return [a[0]*s, a[1]*s, a[2]*s]; }
function dot(a,b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function axpy(a,b,s){ return [a[0]+b[0]*s, a[1]+b[1]*s, a[2]+b[2]*s]; }
var DEG = 180/Math.PI;

/* =============================================================
   ANATOMY + PROTOCOL DATA
   ============================================================= */
var TASKS = ["sag","ax","cor"], PANELS = ["sag","cor","ax"];
/* the four boxes of the planning grid. Any localiser or completed series can be dragged into any of them. */
var SLOTS = ["sag","cor","ax","x"], SLOTNAME = { sag:"top-left", cor:"top-right", ax:"bottom-left", x:"bottom-right" };
var ORI = { sag:["S","I","A","P"], cor:["S","I","R","L"], ax:["A","P","R","L"] };       // top, bottom, left, right
var TYPE = { sag:"sag", ax:"ax", cor:"cor" };
var COLORS = { sag:"#f0a35e", ax:"#5fe08a", cor:"#6fc3ff" };
var NAME = { sag:"SAG", cor:"COR", ax:"AX" };
var EXTRA = [];                                               // no extra localisers in this build
var REF = C.real.tilt;                                        // the lean of the back of the pons on the sagittal (degrees)
var TOL = 5, TOLS = 6;                                        // degrees: tilt on the sagittal · "straight / level"
var X0 = C.x0;                                                // mid-line of the brainstem
var MAT = { sag:256, ax:360, cor:360 };
var LIM = { sag: { nmax:200, tmin:1,   tmax:2, fmin:200, fmax:320, coarse:290, narrow:225, over:190, nstep:10 },
            ax:  { nmax:90,  tmin:0.5, tmax:3, fmin:120, fmax:260, coarse:220, narrow:160, over:62,  nstep:2 },
            cor: { nmax:60,  tmin:1,   tmax:4, fmin:120, fmax:260, coarse:220, narrow:160, over:76,  nstep:1 } };
var SEQ = {
  sag: { name:"SAGITTAL", dirName:"right", ideal:"sag_t1", fov:256, auto:{ n:170, thk:1, gap:0 },
         start:{ c:[14,-4,-30], n:120, thk:1, gap:0, fov:240 },
         spanLab:"Covers", covLab:"side to side", okText:"The whole head, straight on the mid-line.",
         fine:"a 1 mm 3D volume", wrap:"the nose and the back of the head wrap into the image",
         key:[["temp_r","Right side of the brain (right temporal lobe)"],["temp_l","Left side of the brain (left temporal lobe)"],
              ["vertex","Top of the brain"],["fmag","Foramen magnum"],["front","Frontal pole"],["back","Occipital pole"],["pons","Pons · the mid-line"]],
         hint:"Sagittal 3D T1 first: it covers the whole head, and it is what you angle the thin blocks on. On the axial and coronal localisers, centre the stack on the mid-line and keep it straight; add slices until it covers the brain from one side to the other. On the sagittal localiser, place the FOV (≈ 256 mm) so it holds the whole brain, from the top of the brain down to the foramen magnum.",
         seqs:[
           { id:"t1",    name:"3D T1 (TFE / MPRAGE)", why:"whole-brain anatomy at 1 mm, re-sliceable in any plane — and the images you angle the thin blocks on", have:"sag_t1" },
           { id:"flair", name:"3D FLAIR", why:"demyelination and other brain or brainstem lesions that can cause trigeminal pain" },
           { id:"t2w",   name:"T2 whole brain (axial)", why:"a survey of the brain and posterior fossa before the thin blocks" } ] },
  ax:  { name:"AXIAL", dirName:"superior", ideal:"ax_t2", fov:180, auto:{ n:40, thk:1, gap:0 },
         start:{ c:[-2,6,-34], n:20, thk:1, gap:0, fov:220 },
         spanLab:"Slices from", covLab:"along the brainstem", okText:"The whole pons, square to the brainstem.",
         fine:"nerves 2–3 mm across", wrap:"the sides of the head wrap into the image",
         key:[["rez_r","Right trigeminal nerve at the pons (root entry zone)"],["rez_l","Left trigeminal nerve at the pons (root entry zone)"],
              ["mc_r","Right Meckel's cave"],["mc_l","Left Meckel's cave"],["pons_top","Top of the pons"],
              ["pons_bot","Bottom of the pons · level of the internal acoustic meatus"],["v4","Fourth ventricle"]],
         hint:"Thin axial block through the pons. On your sagittal series, tilt the block so its slices lie square to the brainstem — at right angles to the back of the pons (the floor of the fourth ventricle). Cover the whole pons, top to bottom: the trigeminal nerves leave its sides about half-way down and run forward to Meckel's cave. Keep the block level on the coronal, with a FOV of about 180 mm centred on the pons.",
         seqs:[
           { id:"t2",  name:"3D heavily T2-weighted (DRIVE / CISS / FIESTA-C type)", why:"dark nerves and vessels against bright CSF: the nerve from the pons to Meckel's cave, and any vessel lying against it", have:"ax_t2" },
           { id:"t1",  name:"3D T1 thin", why:"the nerve, Meckel's cave and the fat of the skull base before contrast", have:"ax_t1" },
           { id:"tof", name:"3D TOF MRA", why:"arteries bright: which vessel is which, matched slice for slice to the 3D T2", rec:true },
           { id:"gad", name:"3D T1 + gadolinium", why:"an enhancing tumour or inflamed nerve, and the veins near the root entry zone — when the request or the first images call for it" } ] },
  cor: { name:"CORONAL", dirName:"posterior", ideal:"cor_t2", fov:180, auto:{ n:24, thk:2, gap:0 },
         start:{ c:[-2,14,-36], n:14, thk:2, gap:0, fov:220 },
         spanLab:"Slices from", covLab:"front to back", okText:"Meckel's cave to the fourth ventricle, along the brainstem.",
         fine:"nerves 2–3 mm across", wrap:"the sides of the head wrap into the image",
         key:[["mc_r","Right Meckel's cave"],["mc_l","Left Meckel's cave"],["rez_r","Right trigeminal nerve at the pons (root entry zone)"],
              ["rez_l","Left trigeminal nerve at the pons (root entry zone)"],["v4","Fourth ventricle"],["pons_top","Top of the pons"],["pons_bot","Bottom of the pons"]],
         hint:"Thin coronal block. On your sagittal series, tilt the block so its slices lie along the brainstem — parallel to the back of the pons (the floor of the fourth ventricle). Cover from the front of Meckel's cave back to the fourth ventricle, so each nerve is cut in cross-section along its whole course in the CSF. Keep the block square to the mid-line on the axial, with a FOV of about 180 mm.",
         seqs:[
           { id:"t2",  name:"T2 thin", why:"both nerves side by side in cross-section, from Meckel's cave back to the pons — one side against the other", have:"cor_t2" },
           { id:"t1",  name:"T1 thin", why:"Meckel's cave, the cavernous sinus and the foramina of the skull base", have:"cor_t1" },
           { id:"gad", name:"T1 FS + gadolinium", why:"spread along the nerve, or a small enhancing lesion on its course" } ] }
};
var POS = {
  pads: { label:"HEAD STRAIGHT · PADS EITHER SIDE", desc:"Supine, head first, head in the head coil, chin level, foam pads between the head and the coil.",
          cap:"SUPINE · HEAD FIRST · HEAD PADDED", sub:"head straight, pads either side", short:"head straight, padded in the coil",
          fit:"Head <b>straight</b>, chin level, <b>foam pads</b> either side · bolster under the knees",
          note:"Pads either side hold the head still without strain, and a straight head puts both nerves in the same slices, so one side can be compared with the other. A bolster under the knees makes 25 minutes easier to lie through.",
          cls:"ok" },
  loose: { label:"HEAD STRAIGHT · NO PADS", desc:"Supine, head first, head resting in the head coil with nothing either side of it.",
          cap:"SUPINE · HEAD FIRST · NO PADS", sub:"head loose in the coil", short:"head loose in the coil, no pads",
          fit:"Head straight, chin level, nothing between the head and the coil",
          note:"Nothing stops the head rolling. These 3D sequences have half-millimetre pixels and run for minutes: a nod or a swallow that moves the head 1 mm blurs every slice. Pad both sides.",
          cls:"warn" },
  turned: { label:"HEAD TURNED TO ONE SIDE", desc:"Supine, head first, head in the head coil but rolled toward one shoulder.",
          cap:"SUPINE · HEAD FIRST · HEAD TURNED", sub:"head rolled to one side", short:"head turned to one side",
          fit:"Head rolled toward one shoulder, pads either side",
          note:"With the head turned, the two nerves sit in different slices and the brainstem is rotated on every plane — harder to plan, and harder to compare one side with the other. Straighten the head, then pad it.",
          cls:"warn" }
};
function coverage(pl){ return pl.n*pl.thk + (pl.n-1)*pl.gap; }
/* where a plane (point P, normal n) crosses a line (point L0, direction d) */
function crossLine(P, n, L0, d){ var k=dot(d,n); return Math.abs(k) < 0.2 ? L0 : axpy(L0, d, dot(sub(P,L0),n)/k); }
/* a plane's position along the brainstem (mm above the middle of the pons) and across it (mm behind the middle of the pons) */
function alongStem(P, n){ return dot(sub(crossLine(P, n, PONS, UP), PONS), UP); }
function acrossStem(P, n){ return dot(sub(crossLine(P, n, PONS, BACK), PONS), BACK); }
var S_TOP = dot(sub(LM.pons_top, PONS), UP), S_BOT = dot(sub(LM.pons_bot, PONS), UP);
function levelAt(s){
  return s > S_TOP+14 ? "above the midbrain" : s > S_TOP ? "midbrain" : s > 5 ? "upper pons" : s > -9 ? "mid-pons · trigeminal nerve roots"
       : s > S_BOT ? "lower pons · internal acoustic meatus" : s > S_BOT-26 ? "medulla" : "below the medulla";
}
function depthAt(t){
  return t < -30 ? "in front of Meckel's cave" : t < -14 ? "Meckel's cave" : t < -8 ? "prepontine cistern · trigeminal nerves"
       : t < 11 ? "pons · root entry zone" : t < 22 ? "fourth ventricle" : "cerebellum";
}
function sideName(x){
  var s=x-X0, a=Math.abs(s), w = s>0 ? "left" : "right";
  return a<=6 ? "mid-line · brainstem" : a<=26 ? w+" trigeminal nerve + Meckel's cave" : a<=45 ? w+" temporal lobe · inner ear" : w+" temporal lobe";
}
/* plane frame: u = screen-right, v = screen-down, n = slice direction (u × v) */
function frameOf(q){
  return TYPE[q]==="ax" ? { u:[1,0,0], v:[0,1,0], n:[0,0,1] } : TYPE[q]==="cor" ? { u:[1,0,0], v:[0,0,-1], n:[0,1,0] } : { u:[0,1,0], v:[0,0,-1], n:[-1,0,0] };
}
function frame(q){ return S.plan[q].f; }
function rotV(a, k, c, s){ var kd=dot(k,a), kx=cross(k,a); return [a[0]*c+kx[0]*s+k[0]*kd*(1-c), a[1]*c+kx[1]*s+k[1]*kd*(1-c), a[2]*c+kx[2]*s+k[2]*kd*(1-c)]; }
/* rotate frame f by deg about axis k, then keep it reading the right way round on screen */
function rotFrame(q, f, k, deg){
  var L=Math.hypot(k[0],k[1],k[2]); k=mul(k, 1/L);
  var t=deg*Math.PI/180, c=Math.cos(t), s=Math.sin(t), g={ u:rotV(f.u,k,c,s), v:rotV(f.v,k,c,s), n:rotV(f.n,k,c,s) };
  if(TYPE[q]==="ax"){ if(g.u[0]<0){ g.u=mul(g.u,-1); g.v=mul(g.v,-1); } }
  else {
    if(TYPE[q]==="cor" ? g.u[0] < 0 : g.u[1] < 0){ g.u=mul(g.u,-1); g.n=mul(g.n,-1); }
    if(g.v[2] > 0){ g.v=mul(g.v,-1); g.n=mul(g.n,-1); }
  }
  return g;
}
/* angles. Thin blocks: the tilt set on the sagittal (negative = the upper / front end tipped back, like this brainstem) and
   how far the block is turned on the other plane (should stay level). Sagittal stack: rotation on the axial (0 = straight)
   and lean on the coronal. */
function nUp(q){ var n=S.plan[q].f.n; return n[2]<0 ? mul(n,-1) : n; }
function nBack(q){ var n=S.plan[q].f.n; return n[1]<0 ? mul(n,-1) : n; }
function axTilt(q){ var n=nUp(q); return Math.atan2(-n[1], n[2])*DEG; }
function axCor(q){ var n=nUp(q); return Math.atan2(n[0], n[2])*DEG; }
function corTilt(q){ var n=nBack(q); return Math.atan2(n[2], n[1])*DEG; }
function corRot(q){ var n=nBack(q); return Math.atan2(n[0], n[1])*DEG; }
function sagRot(q){ var n=S.plan[q].f.n, a=Math.atan2(-n[0], n[1])*DEG; while(a>=180) a-=180; while(a<0) a+=180; return a-90; }
function sagLean(q){ var n=S.plan[q].f.n; return Math.asin(Math.max(-1, Math.min(1, n[0]<0 ? -n[2] : n[2])))*DEG; }
function tiltOf(q){ return TYPE[q]==="ax" ? axTilt(q) : corTilt(q); }       // the angle that is set on the sagittal
function levelOf(q){ return TYPE[q]==="ax" ? axCor(q) : corRot(q); }       // the angle that should stay at zero
function edges(q){ var pl=S.plan[q], s=dot(sub(pl.c, HH), frame(q).n), h=coverage(pl)/2; return [s-h, s+h]; }
function needsAngle(q){ return q!=="sag"; }                   // the angle that is set on a completed sagittal series
function angErr(q){ return needsAngle(q) ? tiltOf(q)-REF : sagRot(q); }
function angOK(q){
  return needsAngle(q) ? Math.abs(tiltOf(q)-REF) <= TOL && Math.abs(levelOf(q)) <= TOLS
                       : Math.abs(sagRot(q)) <= TOLS && Math.abs(sagLean(q)) <= TOLS;
}
function inBox(q, P){
  var F=frame(q), pl=S.plan[q], d=sub(P, pl.c);
  return Math.abs(dot(d,F.n)) <= coverage(pl)/2 + 1.5 && Math.abs(dot(d,F.u)) <= pl.fov/2 && Math.abs(dot(d,F.v)) <= pl.fov/2;
}
/* what the plan holds: axial = where its top and bottom slices cross the brainstem; coronal = where its front and back
   slices lie; sagittal = how far it reaches either side of the mid-line */
function span(q){
  var pl=S.plan[q], h=coverage(pl)/2, n;
  if(TYPE[q]==="ax"){ n=nUp(q); return [levelAt(alongStem(axpy(pl.c,n,h), n)), levelAt(alongStem(axpy(pl.c,n,-h), n))]; }
  if(TYPE[q]==="cor"){ n=nBack(q); return [depthAt(acrossStem(axpy(pl.c,n,-h), n)), depthAt(acrossStem(axpy(pl.c,n,h), n))]; }
  return [Math.round(pl.c[0]+h-X0)+" mm left", Math.round(X0-(pl.c[0]-h))+" mm right of the mid-line"];
}
function spanText(q){ var s=span(q); return s[0]+" → "+s[1]; }
function analyse(q){
  var pl=S.plan[q], e=edges(q), L=LIM[q], key=SEQ[q].key.map(function(k){ return { id:k[0], name:k[1], ok:inBox(q, LM[k[0]]) }; });
  return { key:key, all:key.every(function(k){ return k.ok; }), cov:coverage(pl), lo:e[0], hi:e[1], res:pl.fov/MAT[q],
           coarse:pl.fov > L.coarse, narrow:pl.fov < L.narrow, ang:angErr(q), angOK:angOK(q), over:coverage(pl) > L.over };
}
function planOK(q){ var a=analyse(q); return a.all && !a.coarse && !a.narrow && a.angOK; }
function canScan(q){ return !needsAngle(q) || angOK(q); }
function imaged(q){                                     // series ids this plan will produce
  var ids=SEQ[q].seqs.filter(function(s){ return s.have && S.chosen[q][s.id]; }).map(function(s){ return s.have; });
  return ids.length ? ids : [SEQ[q].seqs.filter(function(s){ return s.have; })[0].have];
}
function scanTime(id){ var s=SER[id], pl=S.plan[s.task]; return Math.round(30 + pl.n*s.spl); }
function mmss(s){ return Math.floor(s/60)+":"+pad2(s%60); }
function sgn(v){ return (v>=0?"+":"−")+Math.abs(v).toFixed(0); }
function deg1(v){ return (v<0?"−":"")+Math.abs(v).toFixed(0)+"°"; }

/* =============================================================
   STATE
   ============================================================= */
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function startPlan(q){ var p=clone(SEQ[q].start); p.f=frameOf(q); return p; }
function freshState(){
  return { phase:"title", pos:null, loaded:false, loading:false, locDone:false,
           plan:{ sag:startPlan("sag"), ax:startPlan("ax"), cor:startPlan("cor") },
           done:{}, ids:{}, acq:{}, swap:{}, chosen:{ sag:{t1:1}, ax:{t2:1, t1:1}, cor:{t2:1, t1:1} },
           cur:null, viewId:null, viewK:0, list:[] };
}
/* an extra localiser has no plan of its own: it is shown whole, as acquired */
function fixedPlan(x){ var s=SER[x.id]; return { c:seriesCentre(x.id), n:s.n, thk:s.thk, gap:Math.round((s.sp-s.thk)*10)/10, fov:x.fov, f:frameOf(x.task, 90) }; }
function addFixedPlans(){ EXTRA.forEach(function(x){ S.plan[x.task]=fixedPlan(x); }); }
var S = freshState();

/* =============================================================
   SERIES GEOMETRY + IMAGES
   ============================================================= */
function sliceCentre(id, k){ var s=SER[id]; return axpy(axpy(s.ipp[k], s.row, s.ps*s.cols/2), s.col, s.ps*s.rows/2); }
function seriesCentre(id){ var s=SER[id]; return mul(add(sliceCentre(id,0), sliceCentre(id,s.n-1)), 0.5); }
function coveredSlices(id){
  var s=SER[id], q=s.task, F=frame(q), pl=S.plan[q], h=coverage(pl)/2 + s.sp/2, out=[];
  for(var k=0;k<s.n;k++){
    var c=sliceCentre(id,k);
    var P = TYPE[q]==="ax" ? crossLine(c, s.nrm, PONS, UP) : TYPE[q]==="cor" ? crossLine(c, s.nrm, PONS, BACK) : c;   // a thin slice counts where it crosses the brainstem
    if(Math.abs(dot(sub(P, pl.c), F.n)) > h) continue;
    out.push(k);
  }
  return out;
}
function nearestSlice(id, P){
  var s=SER[id], b=0, bd=1e9;
  for(var k=0;k<s.n;k++){ var d=Math.abs(dot(sub(P, s.ipp[k]), s.nrm)); if(d<bd){ bd=d; b=k; } }
  return b;
}
var imgCache = {};
function getImg(name, cb){
  if(imgCache[name] && imgCache[name].complete){ cb(imgCache[name]); return; }
  var im = imgCache[name] || new Image();
  im.addEventListener("load", function(){ cb(im); }, { once:true });
  if(!imgCache[name]){ imgCache[name]=im; im.src=url(name); }
}
/* the crop used to show series slice k inside plan q's FOV (series' own orientation, centred on the plan) */
function cropOf(id, k, N, pl){
  var s=SER[id], d=sub(pl.c, s.ipp[k]);
  return { ic:dot(d,s.row)/s.ps, jc:dot(d,s.col)/s.ps, sc:N/(pl.fov/s.ps), N:N };
}
function cropPt(id, k, cr, P){ var s=SER[id], d=sub(P, s.ipp[k]); return [(dot(d,s.row)/s.ps - cr.ic)*cr.sc + cr.N/2, (dot(d,s.col)/s.ps - cr.jc)*cr.sc + cr.N/2]; }
function renderSeries(id, k, cv, pl, cb){
  var g=cv.getContext("2d"), N=cv.width;
  pl = pl || S.plan[SER[id].task];
  getImg(imgName(id,k), function(im){
    var cr=cropOf(id, k, N, pl);
    g.setTransform(1,0,0,1,0,0); g.globalAlpha=1; g.fillStyle="#000"; g.fillRect(0,0,N,N);
    g.imageSmoothingEnabled=true; g.imageSmoothingQuality="high";
    g.setTransform(cr.sc,0,0,cr.sc, N/2-cr.ic*cr.sc, N/2-cr.jc*cr.sc); g.drawImage(im, -0.5, -0.5);
    g.setTransform(1,0,0,1,0,0);
    if(cb) cb(cr);
  });
}
/* =============================================================
   K-SPACE (the localiser is acquired line by line)
   ============================================================= */
function fft1(re, im, inv){
  var n=re.length, i, j, k, m;
  for(i=1, j=0; i<n; i++){ var bit=n>>1; for(; j&bit; bit>>=1) j^=bit; j^=bit; if(i<j){ var t=re[i]; re[i]=re[j]; re[j]=t; t=im[i]; im[i]=im[j]; im[j]=t; } }
  for(m=2; m<=n; m<<=1){
    var ang=(inv?2:-2)*Math.PI/m, wr=Math.cos(ang), wi=Math.sin(ang);
    for(i=0; i<n; i+=m){ var cr=1, ci=0;
      for(k=0; k<m/2; k++){
        var a=i+k, b=a+m/2, tr=re[b]*cr-im[b]*ci, ti=re[b]*ci+im[b]*cr;
        re[b]=re[a]-tr; im[b]=im[a]-ti; re[a]+=tr; im[a]+=ti;
        var nr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=nr;
      }
    }
  }
}
function fft2(re, im, n, inv){
  var r=new Float64Array(n), i2=new Float64Array(n), x, y;
  for(y=0;y<n;y++){ for(x=0;x<n;x++){ r[x]=re[y*n+x]; i2[x]=im[y*n+x]; } fft1(r,i2,inv); for(x=0;x<n;x++){ re[y*n+x]=r[x]; im[y*n+x]=i2[x]; } }
  for(x=0;x<n;x++){ for(y=0;y<n;y++){ r[y]=re[y*n+x]; i2[y]=im[y*n+x]; } fft1(r,i2,inv); for(y=0;y<n;y++){ re[y*n+x]=r[y]; im[y*n+x]=i2[y]; } }
}
var KS = {};
function prepK(p, cb){
  if(KS[p]){ cb(KS[p]); return; }
  getImg("loc_"+p, function(im){
    var n=LN, c=document.createElement("canvas"); c.width=c.height=n;
    var g=c.getContext("2d", { willReadFrequently:true }); g.drawImage(im,0,0,n,n);
    var d;
    try{ d=g.getImageData(0,0,n,n).data; }catch(e){ KS[p]=null; cb(null); return; }     // blocked (file:// without the inlined localisers)
    var re=new Float64Array(n*n), imv=new Float64Array(n*n), i;
    for(i=0;i<n*n;i++) re[i]=d[i*4];
    fft2(re, imv, n, false);
    var mag=new Float64Array(n*n), mx=0;
    for(i=0;i<n*n;i++){ mag[i]=Math.log(1+Math.hypot(re[i],imv[i])); if(mag[i]>mx) mx=mag[i]; }
    var kc=document.createElement("canvas"); kc.width=kc.height=n;
    var kg=kc.getContext("2d"), id=kg.createImageData(n,n);
    for(var y=0;y<n;y++) for(var x=0;x<n;x++){
      var v=Math.pow(mag[((y+n/2)%n)*n+((x+n/2)%n)]/mx, 2.2)*255, j=(y*n+x)*4;
      id.data[j]=v*0.7; id.data[j+1]=v; id.data[j+2]=v*0.8; id.data[j+3]=255;
    }
    kg.putImageData(id,0,0);
    KS[p]={ re:re, im:imv, kc:kc };
    cb(KS[p]);
  });
}
function partialRecon(p, lines, cv){
  var K=KS[p], n=LN, re=new Float64Array(n*n), im=new Float64Array(n*n), y, x;
  for(var r=0;r<lines;r++){ y=(r+n/2)%n; for(x=0;x<n;x++){ re[y*n+x]=K.re[y*n+x]; im[y*n+x]=K.im[y*n+x]; } }
  fft2(re, im, n, true);
  var g=cv.getContext("2d"), id=g.createImageData(n,n), d=id.data;
  for(var i=0;i<n*n;i++){ var v=Math.hypot(re[i],im[i])/(n*n); v=v>255?255:v; d[i*4]=d[i*4+1]=d[i*4+2]=v; d[i*4+3]=255; }
  g.putImageData(id,0,0);
}

/* =============================================================
   LAYOUT + LOG
   ============================================================= */
function layoutGrid(){
  Object.keys(CELL).forEach(function(p){
    var c=CELL[p], w=c.el.clientWidth, h=c.el.clientHeight, s=Math.max(10, Math.min(w, h));
    c.sq.style.width=s+"px"; c.sq.style.height=s+"px";
  });
}
window.addEventListener("resize", layoutGrid);
if(typeof ResizeObserver!=="undefined") new ResizeObserver(layoutGrid).observe(vp);
function log(msg, cls){
  var d=document.createElement("div");
  if(cls) d.innerHTML='<span class="scg-l-'+cls+'">'+msg+'</span>'; else d.textContent=msg;
  logEl.appendChild(d); logEl.scrollTop=logEl.scrollHeight;
}
function logCmd(c){ log("$ "+c,"cmd"); }

/* =============================================================
   PLANNING OVERLAYS — boxes projected onto each panel's real image plane (SVG units: 256 across the image)
   ============================================================= */
/* what a box shows: a localiser image, or one slice of an acquired series. Left alone, the first three boxes show
   their own localiser (SAG / COR / AX) and the fourth shows the preview (null here). */
function content(p){
  var sw=S.swap[p];
  if(sw) return sw.loc ? { type:"loc", key:sw.loc, plane:sw.loc } : { type:"ser", id:sw.id, i:sw.i, plane:SER[sw.id].plane };
  return p==="x" ? null : { type:"loc", key:p, plane:p };
}
function panelGeo(p){
  var ct=content(p);
  if(ct && ct.type==="ser"){ var s=SER[ct.id], k=S.acq[ct.id][ct.i]; return { ipp:s.ipp[k], row:s.row, col:s.col, mmu:s.ps*s.cols/256 }; }
  var L=C.loc[ct ? ct.key : "sag"]; return { ipp:L.ipp, row:L.row, col:L.col, mmu:L.ps*L.cols/256 };
}
function proj(G, P){ var d=sub(P, G.ipp); return [dot(d,G.row)/G.mmu, dot(d,G.col)/G.mmu]; }
function projDir(G, d){ return [dot(d,G.row)/G.mmu, dot(d,G.col)/G.mmu]; }
function unproj(G, x, y){ return axpy(axpy(G.ipp, G.row, x*G.mmu), G.col, y*G.mmu); }
function f1(v){ return v.toFixed(1); }
/* the axial tilt is set on a completed sagittal series, not on the coarse localiser */
function isDiagSag(p){ var ct=content(p); return !!ct && ct.type==="ser" && SER[ct.id].task==="sag"; }
function sagOn(){ return SLOTS.some(isDiagSag); }                 // a diagnostic sagittal series is in one of the boxes
function canRotate(p, q){ var ct=content(p); return !(needsAngle(q) && ct && ct.plane==="sag" && !isDiagSag(p)); }
/* the drawable shape of plan q on panel p */
function shapeOf(p, q){
  var G=panelGeo(p), F=frame(q), pl=S.plan[q], N=cross(G.row, G.col), t=Math.abs(dot(F.n, N)), half=pl.fov/2, cov=coverage(pl);
  var sh={ G:G, F:F, parallel:t>0.6, edges:[], lines:[] }, c=pl.c;
  function P2(P){ return proj(G, P); }
  if(sh.parallel){                                   // the square FOV of the centre slice
    sh.corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(function(s){ return P2(axpy(axpy(c, F.u, s[0]*half), F.v, s[1]*half)); });
    sh.edges=[["v","lo"],["u","hi"],["v","hi"],["u","lo"]];
  } else {                                           // a stack: slices seen edge-on, along the in-plane axis this panel shows
    var a = Math.abs(dot(F.u,N)) < Math.abs(dot(F.v,N)) ? "u" : "v", A=F[a];
    sh.corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(function(s){ return P2(axpy(axpy(c, F.n, s[0]*cov/2), A, s[1]*half)); });
    sh.edges=[[a,"lo"],["n","hi"],[a,"hi"],["n","lo"]];
    var step=pl.thk+pl.gap, every=Math.max(1, Math.ceil(pl.n/40));
    for(var i=0;i<pl.n;i+=every){ var m=axpy(c, F.n, -cov/2+pl.thk/2+i*step); sh.lines.push([P2(axpy(m,A,-half)), P2(axpy(m,A,half))]); }
    sh.a=a;
  }
  var RA = sh.parallel ? F.u : F[sh.a];
  sh.rot={ c:P2(c), h:[P2(axpy(c, RA, -(half+8))), P2(axpy(c, RA, half+8))], lock:!canRotate(p, q) };
  return sh;
}
function rotLabel(p, q){
  p=content(p).plane;                                   // what the box shows, not where it sits
  if(TYPE[q]==="ax") return p==="sag" ? "tilt "+deg1(axTilt(q)) : p==="cor" ? "lean "+deg1(axCor(q)) : "in-plane";
  if(TYPE[q]==="cor") return p==="sag" ? "tilt "+deg1(corTilt(q)) : p==="ax" ? "rotation "+deg1(corRot(q)) : "in-plane";
  return p==="ax" ? "rotation "+deg1(sagRot(q)) : p==="cor" ? "lean "+deg1(sagLean(q)) : "in-plane";
}
function svgBox(p, q, mode){
  var sh=shapeOf(p, q), plan=mode==="plan", off=plan && !planOK(q), cls=off?" is-off":"", pl=S.plan[q], K=sh.corners, out="";
  var poly=K.map(function(k){ return f1(k[0])+" "+f1(k[1]); });
  if(plan) out+='<path class="mre-mask" fill-rule="evenodd" d="M-400 -400H656V656H-400Z M'+poly.join("L")+'Z"/>';
  var st = plan ? "" : ' style="stroke:'+COLORS[q]+';fill:'+COLORS[q]+'14"';
  out+='<path class="mre-box'+cls+(sh.parallel?" is-fov":"")+'" data-q="'+q+'" data-h="body" d="M'+poly.join("L")+'Z"'+st+(plan?"":' pointer-events="none"')+'/>';
  sh.lines.forEach(function(l){ out+='<line class="mre-sl'+cls+'" x1="'+f1(l[0][0])+'" y1="'+f1(l[0][1])+'" x2="'+f1(l[1][0])+'" y2="'+f1(l[1][1])+'"'+(plan?"":' style="stroke:'+COLORS[q]+'88"')+'/>'; });
  if(plan){
    sh.edges.forEach(function(e, i){
      var a=K[i], b=K[(i+1)%4], mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2;
      out+='<line class="mre-hd" style="cursor:'+(e[0]==="n"?"col-resize":"nwse-resize")+'" data-h="'+e[0]+'|'+e[1]+'" x1="'+f1(a[0])+'" y1="'+f1(a[1])+'" x2="'+f1(b[0])+'" y2="'+f1(b[1])+'"/>'+
           '<circle class="mre-hgrip'+cls+'" cx="'+f1(mx)+'" cy="'+f1(my)+'" r="2.6"/>';
    });
    var rc = sh.rot.lock ? " is-lock" : cls, H=sh.rot.h;
    out+='<line class="mre-rotline'+rc+'" x1="'+f1(H[0][0])+'" y1="'+f1(H[0][1])+'" x2="'+f1(H[1][0])+'" y2="'+f1(H[1][1])+'"/>';
    H.forEach(function(h, i){
      out+='<circle class="mre-rot'+rc+'" data-h="rot|'+(i?1:-1)+'" cx="'+f1(h[0])+'" cy="'+f1(h[1])+'" r="8"/>'+
           '<text class="mre-tx'+rc+'" style="font-size:9px" text-anchor="middle" x="'+f1(h[0])+'" y="'+f1(h[1]+3.2)+'" pointer-events="none">'+(sh.rot.lock?"🔒":"⟳")+'</text>';
    });
    out+='<text class="mre-tx'+rc+'" x="'+f1(Math.max(2, Math.min(190, H[0][0]-10)))+'" y="'+f1(Math.max(18, Math.min(250, H[0][1]-11)))+'">'+(sh.rot.lock?"tilt locked":rotLabel(p, q))+'</text>';
    var top=K.reduce(function(m,k){ return k[1]<m[1]?k:m; }, K[0]);
    var tx = sh.parallel ? "FOV "+pl.fov+" mm" : pl.n+" sl · "+pl.thk+" mm · "+coverage(pl).toFixed(0)+" mm";
    out+='<text class="mre-tx'+cls+'" x="'+f1(Math.max(2, Math.min(150, top[0]+2)))+'" y="'+f1(Math.max(9, Math.min(250, top[1]-3)))+'">'+NAME[q]+' · '+tx+'</text>';
  } else {
    var tp=K.reduce(function(m,k){ return k[1]<m[1]?k:m; }, K[0]);
    out+='<text class="mre-tx" style="fill:'+COLORS[q]+'" x="'+f1(Math.max(2, Math.min(220, tp[0]+2)))+'" y="'+f1(Math.max(9, Math.min(250, tp[1]-3)))+'">'+NAME[q]+'</text>';
  }
  return out;
}
function drawOverlays(){
  SLOTS.forEach(function(p){
    if(!content(p)) return;                               // the fourth box showing the preview
    var svg=CELL[p].svg, out="";
    if(S.phase==="plan") out=svgBox(p, S.cur, "plan");
    else if(S.phase==="dash" || S.phase==="result") Object.keys(S.done).forEach(function(q){ out+=svgBox(p, q, "dash"); });
    svg.innerHTML=out;
    var lab2="", locked=S.phase==="plan" && !canRotate(p, S.cur);
    if(S.phase==="plan"){
      if(locked) lab2="🔒 tilt: set it on a sagittal series";
      else lab2 = "⟳ = angle · box = move · edges = "+(shapeOf(p, S.cur).parallel ? "FOV" : "coverage / FOV");
    }
    CELL[p].lab2.textContent=lab2;
    var want = locked && !sagOn(), tag=CELL[p].el.querySelector(".mre-want");
    CELL[p].lab2.style.color = locked ? "var(--warn)" : "";
    CELL[p].el.classList.toggle("is-want", want);
    if(want && !tag){ tag=document.createElement("div"); tag.className="mre-want"; tag.textContent="⬇ DROP A SAGITTAL SERIES HERE TO TILT"; CELL[p].el.appendChild(tag); }
    if(!want && tag) tag.remove();
  });
}
/* dragging */
var drag=null;
function svgPt(svg, e){ var r=svg.getBoundingClientRect(); return [(e.clientX-r.left)/r.width*256, (e.clientY-r.top)/r.height*256]; }
function along(G, c, d, m){ var c2=proj(G, c), d2=projDir(G, d), L=d2[0]*d2[0]+d2[1]*d2[1]; return L<1e-9 ? 0 : ((m[0]-c2[0])*d2[0]+(m[1]-c2[1])*d2[1])/L; }
function angLog(q){ log(TYPE[q]==="ax" ? "axial tilt: square to the brainstem ✓" : TYPE[q]==="cor" ? "coronal tilt: along the brainstem ✓" : "the sagittal stack is straight on the mid-line again ✓","ok"); }
SLOTS.forEach(function(p){
  var svg=CELL[p].svg;
  svg.addEventListener("pointerdown", function(e){
    if(S.phase!=="plan") return;
    var t=e.target, h=t.getAttribute && t.getAttribute("data-h");
    if(!h) return;
    e.preventDefault();
    var q=S.cur;
    drag={ p:p, h:h, q:q, start:svgPt(svg, e), G:panelGeo(p), pl0:clone(S.plan[q]), F0:frame(q) };
    if(h.indexOf("rot")===0){ var c2=proj(drag.G, S.plan[q].c); drag.c2=c2; drag.a0=Math.atan2(drag.start[1]-c2[1], drag.start[0]-c2[0]); drag.wasOK=angOK(q); }
    try{ svg.setPointerCapture(e.pointerId); }catch(_){}
    CELL[p].el.classList.add("is-active");
  });
  svg.addEventListener("pointermove", function(e){
    if(!drag || drag.p!==p) return;
    var m=svgPt(svg, e), q=drag.q, pl=S.plan[q], G=drag.G, p0=drag.pl0, F=drag.F0, L=LIM[q];
    if(drag.h==="body"){
      var d=unproj(G, m[0], m[1]), d0=unproj(G, drag.start[0], drag.start[1]);
      pl.c=add(p0.c, sub(d, d0));
    } else if(drag.h.indexOf("rot")===0){
      if(!canRotate(p, q)){ if(!drag.warned){ drag.warned=true; log("the tilt unlocks on your real sagittal images — drag a sagittal series from the tray into one of the boxes first.","warn"); } return; }
      var a1=Math.atan2(m[1]-drag.c2[1], m[0]-drag.c2[0]), dd=(a1-drag.a0)*180/Math.PI;
      pl.f=rotFrame(q, drag.F0, cross(G.row, G.col), dd);
      if(angOK(q) && !drag.wasOK){ drag.wasOK=true; angLog(q); }
      if(!angOK(q)) drag.wasOK=false;
    } else {
      var ax=drag.h.split("|")[0], side=drag.h.split("|")[1], s=along(G, p0.c, F[ax], m);
      if(ax==="n"){
        var cov0=coverage(p0), fixed = side==="hi" ? -cov0/2 : cov0/2;
        var n=Math.round((Math.abs(s-fixed)+p0.gap)/(p0.thk+p0.gap));
        pl.n=Math.max(3, Math.min(L.nmax, n));
        var cov=coverage(pl); pl.c=axpy(p0.c, F.n, side==="hi" ? fixed+cov/2 : fixed-cov/2);
      } else {
        pl.fov=Math.max(L.fmin, Math.min(L.fmax, Math.round(2*Math.abs(s)/5)*5));
      }
    }
    clampPlan(q); drawOverlays(); schedulePreview(); renderRail(); renderCmds();
  });
  function end(){ if(drag && drag.p===p){ CELL[p].el.classList.remove("is-active"); drag=null; render(); } }
  svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
});
/* set the axial tilt on the sagittal to a (degrees) */
function setAngle(q, a, quiet){
  if(!needsAngle(q)) return;
  var was=angOK(q);
  a=Math.max(-40, Math.min(40, a));
  S.plan[q].f=rotFrame(q, S.plan[q].f, [1,0,0], a-tiltOf(q));
  if(!quiet){ afterPlan(); }
  if(angOK(q) && !was) angLog(q);
}
function straighten(q){ var pl=S.plan[q]; pl.f=frameOf(q); afterPlan(); log(SEQ[q].name.toLowerCase()+" stack reset to straight.","sys"); }
function clampPlan(q){
  var pl=S.plan[q];
  pl.c=pl.c.map(function(v, i){ return Math.round(Math.max(HH[i]-160, Math.min(HH[i]+160, v))*2)/2; });
}
var prevT=0;
function schedulePreview(){ if(prevT) return; prevT=requestAnimationFrame(function(){ prevT=0; drawPreview(); }); }
var PREV = { sag:"sag_t1", ax:"ax_t2", cor:"cor_t2" };
function drawPreview(){
  if(S.phase!=="plan" || content("x")) return;
  var q=S.cur, pl=S.plan[q], X=CELL.x, a=analyse(q), id=PREV[q], k=nearestSlice(id, pl.c);
  renderSeries(id, k, X.cv, pl);
  X.lab.textContent="PREVIEW · "+SEQ[q].name+" "+SER[id].seq+"\nnearest slice to the box centre · FOV "+pl.fov+" mm";
  X.lab2.textContent = a.narrow ? "FOV too small: wrap-around" : a.coarse ? "FOV too big for the matrix" : "matrix "+MAT[q]+" · "+a.res.toFixed(2)+" mm px";
  X.lab2.style.color = a.narrow || a.coarse ? "var(--warn)" : "";
}

/* =============================================================
   PHASES
   ============================================================= */
var PHASE_LABEL = { title:"STANDBY", setup:"PATIENT SET-UP", loc:"LOCALISER", dash:"PROTOCOL", plan:"PLANNING", acquire:"ACQUIRING", view:"IMAGES", result:"REVIEW" };
function setPhase(p){
  S.phase=p;
  phaseChip.textContent=PHASE_LABEL[p]||p;
  room.classList.toggle("scg-hidden", p!=="setup");
  grid.classList.toggle("scg-hidden", !(p==="loc"||p==="dash"||p==="plan"));
  viewEl.classList.toggle("scg-hidden", !(p==="view"||p==="result"));
  acqEl.classList.add("scg-hidden");
  stackUI.classList.toggle("scg-hidden", !(p==="view"||p==="result"));
  winBtns.classList.toggle("scg-hidden", !(p==="view"||p==="result"));
  syncX();
  vpTL.textContent=""; vpBL.textContent=""; vpBR.textContent="";
  requestAnimationFrame(layoutGrid);
  render();
}

/* =============================================================
   COMMANDS
   ============================================================= */
var COMMANDS = [
  { id:"load", label:"LOAD PATIENT · HEAD FIRST", key:"load", phases:["setup"], needs:"canLoad", primary:true, run:function(){ loadPatient(); } },
  { id:"loc",  label:"RUN 3-PLANE LOCALISER", key:"loc", phases:["setup"], needs:"loaded", primary:true, run:function(){ runLocaliser(); } },
  { id:"auto", label:"AUTO-PLAN (coverage + FOV only)", key:"auto", phases:["plan"], run:function(){ autoPlan(); } },
  { id:"scan", label:"▶ SCAN THIS SEQUENCE", key:"scan", phases:["plan"], needs:"canScan", primary:true, run:function(){ scanSeq(); } },
  { id:"cancel", label:"◀ BACK TO PROTOCOL", key:"back", phases:["plan","view"], run:function(){ gotoDash(); } },
  { id:"finish", label:"FINISH · DEBRIEF", key:"finish", phases:["dash","view"], needs:"allDone", primary:true, run:function(){ showResult(); } },
  { id:"reset", label:"RESET", key:"reset", phases:["dash","plan","view","result"], run:function(){ resetAll(); } }
];
function cmdEnabled(c){
  if(c.phases.indexOf(S.phase)<0) return false;
  if(c.needs==="canLoad") return !!S.pos && !S.loaded && !S.loading;
  if(c.needs==="loaded") return !!S.loaded && !locRunning;
  if(c.needs==="canScan") return !!S.cur && canScan(S.cur);
  if(c.needs==="allDone") return TASKS.every(function(q){ return S.done[q]; });
  return true;
}
function scanBlockReason(q){ return !canScan(q) ? "set the tilt on the sagittal first" : ""; }
function renderCmds(){
  cmds.innerHTML="";
  COMMANDS.forEach(function(c){
    if(c.phases.indexOf(S.phase)<0) return;
    if(c.id==="load" && S.loaded) return;
    if(c.id==="loc" && !S.loaded) return;
    var b=document.createElement("button"), en=cmdEnabled(c);
    var pulse=(c.id==="load"&&S.pos)||(c.id==="loc"&&S.loaded)||(c.id==="scan"&&S.cur&&planOK(S.cur)&&canScan(S.cur))||(c.id==="finish"&&en);
    b.className="scg-btn"+(c.primary?" is-primary":"")+(pulse?" is-pulse":"");
    b.disabled=!en;
    b.innerHTML='<span>'+(c.id==="scan" && S.cur && !canScan(S.cur) ? "▶ SCAN · "+scanBlockReason(S.cur) : c.label)+'</span><span class="scg-key">'+c.key+'</span>';
    b.onclick=function(){ logCmd(c.key); c.run(); };
    cmds.appendChild(b);
  });
}
var BOX = { "1":"sag", "2":"cor", "3":"ax", "4":"x", sag:"sag", cor:"cor", ax:"ax", x:"x" };
function parseCommand(raw){
  var t=raw.trim().toLowerCase(); if(!t) return;
  logCmd(t);
  var w=t.split(/\s+/);
  if(t==="help"){
    log("commands here: "+COMMANDS.filter(function(c){ return c.phases.indexOf(S.phase)>=0; }).map(function(c){ return c.key; }).join(", ")+", help","sys");
    log("workflow: choose the position (pads | loose | turned) → load → loc → plan sag → scan → use sag_t1 → plan ax → tilt → scan → plan cor → tilt → scan → finish.","sys");
    log("while planning: slices <n> · thick <mm> · gap <mm> · fov <mm> · tilt <deg> (axial and coronal, once the sagittal series is in one of the boxes) · straight (sagittal stack) · auto · scan · back","sys");
    log("boxes: drag any localiser or series from the tray into any of the four boxes, or type: use <item> <box> — items: locsag, loccor, locax, a series (e.g. sag_t1); boxes: 1 top-left, 2 top-right, 3 bottom-left, 4 bottom-right · restore <1-4> puts a box back","sys");
    return;
  }
  if(S.phase==="setup" && POS[w[0]]){ choosePos(w[0]); return; }
  var xl=EXTRA.filter(function(x){ return w[0]===x.k+"loc"; })[0];
  if(xl && (S.phase==="dash"||S.phase==="plan")){ runExtra(xl); return; }
  if(w[0]==="use" && (S.phase==="dash"||S.phase==="plan")){
    var slot=BOX[w[2]], lk=/^loc(sag|cor|ax)$/.exec(w[1]||""), xe=EXTRA.filter(function(x){ return w[1]===x.k+"loc"; })[0];
    if(lk){ place("loc:"+lk[1], slot||lk[1]); return; }
    var id = xe ? xe.id : SER[w[1]] ? w[1] : (SEQ[w[1]] ? Object.keys(S.acq).filter(function(i){ return SER[i].task===w[1]; })[0] : null);
    if(id && S.acq[id]) useSeries(id, slot); else log("nothing acquired for '"+(w[1]||"")+"' yet.","warn");
    return;
  }
  if(w[0]==="restore" && BOX[w[1]] && (S.phase==="dash"||S.phase==="plan")){ restoreLoc(BOX[w[1]]); return; }
  if(w[0]==="plan" && SEQ[w[1]] && (S.phase==="dash"||S.phase==="view"||S.phase==="plan")){ gotoPlan(w[1]); return; }
  if(S.phase==="plan" && w[0]==="straight"){
    if(needsAngle(S.cur)) log("'straight' resets the sagittal stack — tilt this block with: tilt <deg>.","warn"); else straighten(S.cur);
    return;
  }
  if(S.phase==="plan" && (w[0]==="tilt"||w[0]==="angle") && !isNaN(parseFloat(w[1]))){
    if(!needsAngle(S.cur)) log("the sagittal stack stays straight on the mid-line — drag ⟳ on the coronal or axial panel if you need to turn it, or type: straight.","warn");
    else if(!sagOn()) log("drag the sagittal series into one of the boxes first — you set the tilt on the real sagittal images.","warn");
    else setAngle(S.cur, parseFloat(w[1]));
    return;
  }
  if(S.phase==="plan" && (w[0]==="slices"||w[0]==="thick"||w[0]==="gap"||w[0]==="fov") && !isNaN(parseFloat(w[1]))){
    var v=parseFloat(w[1]);
    if(w[0]==="slices") setN(S.cur, Math.round(v)); else if(w[0]==="thick") setThk(S.cur, v); else if(w[0]==="gap") setGap(S.cur, v); else setFov(S.cur, v);
    return;
  }
  var c=COMMANDS.filter(function(c){ return c.key===t || c.id===t; })[0];
  if(!c){ log("unknown command: "+t+"  (try: help)","warn"); return; }
  if(c.phases.indexOf(S.phase)<0){ log("'"+t+"' is not available here.","warn"); return; }
  if(!cmdEnabled(c)){ log(c.id==="scan" ? scanBlockReason(S.cur)+"." : "'"+t+"' is locked right now.","warn"); return; }
  c.run();
}
cliForm.addEventListener("submit", function(e){ e.preventDefault(); var v=cli.value; cli.value=""; parseCommand(v); });

/* =============================================================
   RAIL
   ============================================================= */
function kvBlock(rows){ return '<div>'+rows.map(function(r){ return '<div class="scg-kv"><span>'+r[0]+'</span><span>'+r[1]+'</span></div>'; }).join('')+'</div>'; }
function checks(){
  var P=POS[S.pos||"pads"];
  return [ "Request checked: <b>MRI trigeminal nerves</b> — attacks of electric-shock facial pain, trigeminal neuralgia? Thin axial and coronal images of both nerves · MR safety questionnaire done; hearing aids, hair clips and dentures out",
           "Supine, <b>head first</b>, head in the <b>head coil</b>",
           P.fit,
           "Ear plugs + headphones · call bell in the hand",
           "“Keep your head still, and try not to swallow or move your tongue during the noise”",
           "Landmark laser on the <b>nasion</b> (bridge of the nose) · eyes closed",
           "Landmark sent to isocentre" ];
}
function seqList(q){
  return '<div class="mre-seqs">'+SEQ[q].seqs.map(function(s){
    var on=!!S.chosen[q][s.id];
    return '<label class="'+(on?"is-on":"")+'"><input type="checkbox" data-q="'+q+'" data-s="'+s.id+'"'+(on?" checked":"")+'><span><b>'+s.name+'</b>'+
      (s.have?'<em>IMAGES IN THIS DEMO</em>':(s.rec?'<em>RECOMMENDED</em>':''))+'<br>'+s.why+'</span></label>';
  }).join('')+'</div>';
}
function bindSeqList(){
  Array.prototype.forEach.call(railBody.querySelectorAll(".mre-seqs input"), function(cb){
    cb.onchange=function(){ var q=cb.dataset.q, s=cb.dataset.s; if(cb.checked) S.chosen[q][s]=1; else delete S.chosen[q][s]; renderRail(); };
  });
}
function angText(q, ok){
  return TYPE[q]==="ax" ? (ok ? "Tilt: square to the brainstem" : "Tilt: not yet square to the brainstem")
       : TYPE[q]==="cor" ? (ok ? "Tilt: along the brainstem" : "Tilt: not yet along the brainstem")
       : (ok ? "Stack is straight, on the mid-line" : "Stack is turned off the mid-line");
}
function covBlock(q){
  var a=analyse(q);
  return '<div class="mre-cov">'+a.key.map(function(k){ return '<div class="'+(k.ok?"ok":"miss")+'"><i>'+(k.ok?"✓":"✗")+'</i><span>'+k.name+'</span></div>'; }).join('')+
    '<div class="'+(a.angOK?"ok":"miss")+'"><i>'+(a.angOK?"✓":"!")+'</i><span>'+angText(q, a.angOK)+'</span></div>'+
    (a.coarse?'<div class="miss"><i>!</i><span>FOV over '+LIM[q].coarse+' mm — pixels '+a.res.toFixed(2)+' mm, too coarse for '+SEQ[q].fine+'</span></div>':'')+
    (a.narrow?'<div class="miss"><i>!</i><span>FOV under '+LIM[q].narrow+' mm — '+SEQ[q].wrap+'</span></div>':'')+
    (a.over?'<div class="miss"><i>·</i><span>More slices than needed — extra coverage adds scan time</span></div>':'')+'</div>';
}
function angleBlock(q){
  if(!needsAngle(q)){
    var ok=angOK(q);
    return '<div class="mre-angbox '+(ok?"is-ok":"is-bad")+'"><b class="t">STRAIGHT ON THE MID-LINE</b><div class="scg-hint '+(ok?"is-ok":"is-warn")+'">'+
      (ok ? "✓ Straight (rotation "+deg1(sagRot(q))+" on the axial, lean "+deg1(sagLean(q))+" on the coronal). A 3D volume can be re-sliced afterwards, so a degree or two is not critical — but a straight stack keeps the coverage even on both sides."
          : "The stack is turned "+deg1(sagRot(q))+" on the axial and leans "+deg1(sagLean(q))+" on the coronal. Drag ⟳ back, or type <b>straight</b>.")+'</div></div>';
  }
  var a=analyse(q), sw=sagOn(), T=TYPE[q]==="ax", title=(T?"AXIAL":"CORONAL")+" TILT ON THE SAGITTAL";
  function btn(d){ return '<button type="button"'+(sw?'':' class="is-lock"')+' data-d="'+d+'">'+(d<0?"−":"+")+Math.abs(d)+'°</button>'; }
  var row='<div class="mre-ang"><span>TILT</span>'+btn(-5)+btn(-1)+'<output>'+deg1(tiltOf(q))+'</output>'+btn(1)+btn(5)+'</div>';
  if(!sw){
    var ids=Object.keys(S.acq).filter(function(id){ return SER[id].task==="sag"; });
    return '<div class="mre-angbox is-bad"><b class="t">'+title+' · 🔒 LOCKED</b>'+row+
      '<div class="scg-hint is-warn">To unlock the tilt, drag the sagittal below into any box — or tap it to put it top left. You angle the thin blocks on the diagnostic sagittal, where the brainstem is sharp.</div>'+
      '<div class="mre-tray">'+ids.map(function(id){ return '<button type="button" class="mre-thumb" data-id="'+id+'" title="Drag onto the SAG localiser"><canvas width="152" height="152"></canvas><span>SAG · '+SER[id].seq+'</span></button>'; }).join('')+'</div></div>';
  }
  return '<div class="mre-angbox '+(a.angOK?"is-ok":"is-bad")+'"><b class="t">'+title+'</b>'+row+
    '<div class="scg-hint '+(a.angOK?"is-ok":"is-warn")+'">'+(a.angOK ? (T ? "✓ Square to the brainstem — each slice cuts the pons in true cross-section, with both nerves in the same slices."
                                                                     : "✓ Along the brainstem — each slice cuts the nerves square-on as they run forward to Meckel's cave.")
      : Math.abs(levelOf(q)) > TOLS ? "The block is turned "+deg1(levelOf(q))+" on the "+(T?"coronal":"axial")+" — keep it level; only the tilt on the sagittal is needed here."
      : T ? "On the sagittal series, drag ⟳ until the slice lines cross the brainstem at right angles to the back of the pons (the floor of the fourth ventricle). In this patient the brainstem leans back a little toward the top, so the front of the block has to lift."
          : "On the sagittal series, drag ⟳ until the slice lines run along the back of the pons (the floor of the fourth ventricle) — in this patient that is not quite straight up and down.")+'</div></div>';
}
function renderRail(){
  var p=S.phase;
  if(p==="setup"){
    railTitle.textContent="Patient set-up"; railDesc.textContent="Trigeminal nerves · head coil, head first";
    var CH=checks(), done=S.loaded ? CH.length : (S.loading ? S.checkN||1 : 1);
    railBody.innerHTML=(S.loaded||S.loading ? "" :
      '<div class="scg-hint">How should the head lie for 25 minutes of sub-millimetre imaging? Pick a position to see it — you can change it until you load.</div>'+
      '<div class="scg-choice">'+Object.keys(POS).map(function(k){ return '<button type="button" data-p="'+k+'" class="'+(S.pos===k?"is-on":"")+'"><b>'+POS[k].label+'</b><span>'+POS[k].desc+'</span></button>'; }).join('')+'</div>')+
      (S.pos ? '<div class="scg-hint '+(POS[S.pos].cls==="ok"?"is-ok":"is-warn")+'">'+POS[S.pos].note+'</div>'+
        '<div class="scg-check">'+CH.map(function(c,i){ return '<div class="'+(i<done?"is-done":"")+'"><i>'+(i<done?"✓":"○")+'</i><span>'+c+'</span></div>'; }).join('')+'</div>'+
        '<div class="scg-hint">'+(S.loaded?"Nasion at isocentre. Command: <b>loc</b> — 3-plane localiser.":S.loading?"Table moving…":"Command: <b>load</b> — the table moves head first and the landmark is sent to isocentre.")+'</div>' : "");
    Array.prototype.forEach.call(railBody.querySelectorAll(".scg-choice button"), function(b){ b.onclick=function(){ logCmd(b.dataset.p); choosePos(b.dataset.p); }; });
  }
  else if(p==="loc"){
    railTitle.textContent="Localiser"; railDesc.textContent="3-plane gradient echo · "+C.loc.fov.toFixed(0)+" mm FOV";
    railBody.innerHTML=kvBlock([["Sequence","fast GRE · sagittal + coronal + axial"],["FOV",C.loc.fov.toFixed(0)+" mm · 256 matrix · 5 mm"],["Position",POS[S.pos].short]])+
      '<div class="scg-hint">Each image is built line by line: every phase-encode step fills one row of <b>k-space</b> (bottom right). The centre rows carry the contrast, the outer rows the fine detail — watch the image appear, then sharpen.</div>'+
      '<div class="scg-hint">A localiser is coarse: 5 mm slices and 1 mm pixels. Enough to find the head and the mid-line, not to see a nerve 3 mm across — the thin blocks are angled on the sagittal 3D T1 you scan next.</div>';
  }
  else if(p==="dash"){
    railTitle.textContent="Protocol"; railDesc.textContent="Sagittal 3D T1 first — then angle the thin blocks on it";
    railBody.innerHTML='<div class="mre-cards">'+TASKS.map(function(q){
      var d=S.done[q], ok=d && planOK(q), locked=q!=="sag" && !S.done.sag,
          names=SEQ[q].seqs.filter(function(s){ return S.chosen[q][s.id]; }).map(function(s){ return s.name; });
      return '<div class="mre-card'+(d?" is-done":"")+(locked?" is-locked":"")+'"><div class="mre-card-h"><i class="mre-sw" style="background:'+COLORS[q]+'"></i><b>'+SEQ[q].name+'</b>'+
        '<span class="mre-chip '+(d?(ok?"ok":"warn"):"")+'">'+(d?(ok?"✓ SCANNED":"⚠ SCANNED · GAPS"):(locked?"🔒 AFTER THE SAGITTAL":"○ NOT PLANNED"))+'</span></div>'+
        '<p>'+(names.length?names.join(" · "):"no sequence chosen")+'</p>'+
        (d?'<p>'+spanText(q)+' · '+S.plan[q].n+' slices'+(needsAngle(q)?' · tilt '+deg1(tiltOf(q)):'')+'</p>':
          (locked?'<p>Scan the sagittal first — this block is tilted on those images.</p>':''))+
        '<button class="scg-btn'+(d||locked?"":" is-primary")+'" type="button" data-q="'+q+'"'+(locked?" disabled":"")+'><span>'+(d?"RE-PLAN":"PLAN")+' '+SEQ[q].name+'</span><span class="scg-key">plan '+q+'</span></button></div>';
    }).join('')+'</div><div class="scg-hint">The localisers on the left show every stack you have scanned so far, in its colour.</div>'+trayBlock();
    Array.prototype.forEach.call(railBody.querySelectorAll(".mre-card button[data-q]"), function(b){ b.onclick=function(){ logCmd("plan "+b.dataset.q); gotoPlan(b.dataset.q); }; });
    bindTray();
  }
  else if(p==="plan"){
    var q=S.cur, pl=S.plan[q], a=analyse(q), ok=planOK(q), ids=imaged(q), ns=LIM[q].nstep;
    railTitle.textContent="Plan · "+SEQ[q].name; railDesc.textContent= needsAngle(q) ? "Tilt on the sagittal · size on any panel" : "Drag the box on any panel — all three stay linked";
    railBody.innerHTML='<div class="scg-hint '+(ok?"is-ok":"is-warn")+'">'+(ok?SEQ[q].okText+" Command: <b>scan</b>":SEQ[q].hint)+'</div>'+
      angleBlock(q)+
      kvBlock([[SEQ[q].spanLab,'<b style="color:'+(a.all?"var(--accent)":"var(--warn)")+'">'+spanText(q)+'</b>'],
               ["Coverage",a.cov.toFixed(0)+" mm "+SEQ[q].covLab],
               ["FOV / matrix",pl.fov+" mm · "+MAT[q]+" · "+a.res.toFixed(2)+" mm px"],
               ["Est. scan time","≈ "+mmss(ids.reduce(function(t,id){ return t+scanTime(id); },0))+" ("+ids.map(function(id){ return SER[id].seq; }).join(" + ")+")"]])+
      '<div class="mre-step"><span>SLICES</span><button type="button" data-a="n" data-d="-'+ns+'">−</button><output>'+pl.n+'</output><button type="button" data-a="n" data-d="'+ns+'">+</button></div>'+
      '<div class="mre-step"><span>THICK</span><button type="button" data-a="thk" data-d="-0.5">−</button><output>'+pl.thk+' mm</output><button type="button" data-a="thk" data-d="0.5">+</button></div>'+
      '<div class="mre-step"><span>GAP</span><button type="button" data-a="gap" data-d="-0.5">−</button><output>'+pl.gap.toFixed(1)+' mm</output><button type="button" data-a="gap" data-d="0.5">+</button></div>'+
      '<div class="mre-step"><span>FOV</span><button type="button" data-a="fov" data-d="-10">−</button><output>'+pl.fov+' mm</output><button type="button" data-a="fov" data-d="10">+</button></div>'+
      '<div class="scg-hint">Anatomy in this stack:</div>'+covBlock(q)+
      trayBlock()+
      '<div class="scg-hint">Sequences to run with this plan (tick what you would acquire):</div>'+seqList(q);
    Array.prototype.forEach.call(railBody.querySelectorAll(".mre-step button"), function(b){
      b.onclick=function(){ var d=parseFloat(b.dataset.d), pl=S.plan[S.cur];
        if(b.dataset.a==="n") setN(S.cur, pl.n+d); else if(b.dataset.a==="thk") setThk(S.cur, pl.thk+d); else if(b.dataset.a==="gap") setGap(S.cur, pl.gap+d); else setFov(S.cur, pl.fov+d); };
    });
    Array.prototype.forEach.call(railBody.querySelectorAll(".mre-ang button"), function(b){
      b.onclick=function(){ var d=parseFloat(b.dataset.d), a=Math.round(tiltOf(S.cur))+d; logCmd("tilt "+a);
        if(!sagOn()){ log("drag the sagittal series into one of the boxes first — you set the tilt on the real sagittal images.","warn"); return; }
        setAngle(S.cur, a); };
    });
    bindSeqList(); bindTray();
  }
  else if(p==="acquire"){
    var cq=S.cur;
    railTitle.textContent="Acquiring · "+SEQ[cq].name; railDesc.textContent=imaged(cq).map(function(id){ return SER[id].seq; }).join(" + ");
    railBody.innerHTML=kvBlock([["Slices",S.plan[cq].n+" × "+S.plan[cq].thk+" mm"],["Est. time","≈ "+mmss(imaged(cq).reduce(function(t,id){ return t+scanTime(id); },0))+" (shown faster)"],
      ["Patient","“keep your head still, and try not to swallow — this one is noisy”"]]);
  }
  else if(p==="view"){
    var v=S.viewId, vq=SER[v].task, an=analyse(vq);
    railTitle.textContent=SEQ[vq].name+" · images"; railDesc.textContent="Scroll the slices your plan covers";
    railBody.innerHTML=kvBlock([["Series",SER[v].seq+" · "+SER[v].params],["Images",S.list.length+" of the "+SER[v].n+" prepared"],[SEQ[vq].spanLab,spanText(vq)],["Navigate","wheel / drag / ↑ ↓"]])+
      covBlock(vq)+'<div class="scg-hint">'+(an.all?"Everything you need from this plan is in the stack.":"Anything ticked ✗ was outside your stack or FOV — it would need another scan.")+
      (vq==="sag" ? ' Next: <b>back</b> to the protocol; for the axial and coronal blocks, drag the sagittal series into one of the boxes to set the tilt.'
        : ' <b>back</b> returns to the protocol.')+'</div>';
  }
  else if(p==="result"){
    railTitle.textContent="Review"; railDesc.textContent="Every series you acquired · scroll each stack";
    railBody.innerHTML=kvBlock(TASKS.map(function(q){ return [SEQ[q].name, S.plan[q].n+" sl"+(needsAngle(q)?" · tilt "+deg1(tiltOf(q)):"")+" · "+(planOK(q)?"✓":"⚠")]; }).concat([["POSITION",POS[S.pos].short+" · "+(POS[S.pos].cls==="ok"?"✓":"⚠")]]))+
      '<div class="scg-hint">Switch series with the buttons on the image. The full debrief, sequences to consider and credits are below.</div>';
  }
  else { railTitle.textContent="Console"; railDesc.textContent="Awaiting operator"; railBody.innerHTML=""; }
}
function setN(q, n){ var pl=S.plan[q], F=frame(q), lo=edges(q)[0]-dot(sub(pl.c,HH),F.n); pl.n=Math.max(3, Math.min(LIM[q].nmax, Math.round(n))); pl.c=axpy(pl.c, F.n, lo+coverage(pl)/2); afterPlan(); }
function setThk(q, t){ var L=LIM[q]; S.plan[q].thk=Math.max(L.tmin, Math.min(L.tmax, Math.round(t*2)/2)); afterPlan(); }
function setGap(q, g){ S.plan[q].gap = Math.max(0, Math.min(5, Math.round(g*10)/10)); afterPlan(); }
function setFov(q, f){ var L=LIM[q]; S.plan[q].fov=Math.max(L.fmin, Math.min(L.fmax, Math.round(f/5)*5)); afterPlan(); }
function afterPlan(){ clampPlan(S.cur); drawOverlays(); schedulePreview(); render(); }
function render(){ renderCmds(); renderRail(); if(S.phase==="dash"||S.phase==="plan"||S.phase==="result") drawOverlays(); if(S.phase==="dash") renderInfo(); }
function renderInfo(){
  CELL.x.lab.textContent=""; CELL.x.lab2.textContent="";
  info.innerHTML='<b>PROTOCOL · TRIGEMINAL NERVES</b><div>Position: '+POS[S.pos].short+' · head first · head coil</div>'+
    TASKS.map(function(q){ var d=S.done[q];
      return '<div class="mre-row"><i class="mre-sw" style="background:'+COLORS[q]+'"></i><span><b>'+SEQ[q].name+'</b> · '+(d?(S.plan[q].n+" slices · "+(planOK(q)?"✓":"⚠")):(q!=="sag"&&!S.done.sag?"after the sagittal":"not planned yet"))+'</span></div>'; }).join('')+
    '<div style="margin-top:6px">Order matters: the <b>sagittal 3D T1</b> goes first, straight on the mid-line, covering the whole head. The thin <b>axial</b> block is then tilted on those images, square to the brainstem through the pons; the thin <b>coronal</b> block is tilted along the brainstem, from Meckel\'s cave back to the fourth ventricle.</div>'+
    '<div>Every localiser and completed series is in the tray on the right: drag any of them into any of the four boxes (this one too) to plan on several at once.</div>';
}

/* =============================================================
   SET-UP
   ============================================================= */
function choosePos(p){
  if(S.loaded || S.loading || S.pos===p) return;
  S.pos=p;
  log(POS[p].note, POS[p].cls==="ok"?"ok":"warn");
  if(room3d) room3d.setPose(p);
  setRoomCaption(); render();
  log("Command: <b>load</b>","sys");
}
function setRoomCaption(){
  room.querySelector(".scg-roomcap b").textContent = S.pos ? POS[S.pos].cap : "PATIENT ON THE TABLE";
  $("scgRoomStep").textContent = S.pos ? POS[S.pos].sub+" · in the head coil" : "supine, head first, in the head coil — choose how the head lies";
}
var THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";
var room3d=null, room3dTried=false;
window.__room=function(){ return room3d; };
function init3D(){
  if(room3dTried){ if(room3d){ room3d.setPose(S.pos||"pads"); room3d.reset(); room3d.start(); } return; }
  room3dTried=true;
  if(!window.SCG_ROOM3D) return;
  import(THREE_URL).then(function(THREE){
    try{
      room3d=window.SCG_ROOM3D(THREE, $("scgRoom3d"));
      room3d.setPose(S.pos||"pads");
      room.classList.add("is-3d"); room3d.start();
      if(S.loading) room3d.finish();
    }catch(e){ room3d=null; room.classList.remove("is-3d"); if(window.console) console.error(e); }
  }).catch(function(){ room3d=null; });
}
function gotoSetup(){
  setPhase("setup"); setRoomCaption(); init3D();
  log("MRI trigeminal nerves requested — attacks of electric-shock facial pain. Thin axial and coronal images of both trigeminal nerves, from the brainstem to Meckel's cave. The patient is on the table, supine, head first, with the head in the head coil.","sys");
}
function loadPatient(){
  if(S.loaded||S.loading||!S.pos) return;
  S.loading=true; S.checkN=3; render();
  var stepTx=$("scgRoomStep");
  function finishLoad(){ S.checkN=checks().length; S.loading=false; S.loaded=true;
    stepTx.textContent="nasion at isocentre";
    log("landmark at isocentre. Command: <b>loc</b>","ok"); render(); }
  if(room3d){
    log("table moving — head first toward the magnet…","sys");
    room3d.play(function(step){
      if(step===1){ S.checkN=5; stepTx.textContent="table moving head first"; }
      if(step===2){ S.checkN=6; stepTx.textContent="landmark laser on the nasion"; log("laser on — nasion landmarked, eyes closed.","sys"); }
      if(step===3){ stepTx.textContent="sending the landmark to isocentre"; }
      if(step===4){ stepTx.textContent="in the bore: the head coil sits at isocentre"; }
      render();
    }, finishLoad);
    return;
  }
  var iv=setInterval(function(){ S.checkN++; render(); if(S.checkN>=checks().length){ clearInterval(iv); finishLoad(); } }, 700);
}

/* =============================================================
   LOCALISER (k-space fill of the 3-plane localiser)
   ============================================================= */
var locRunning=false;
function runLocaliser(){
  if(locRunning||!S.loaded) return;
  locRunning=true;
  if(room3d) room3d.stop();
  setPhase("loc");
  PANELS.forEach(function(p){ var c=CELL[p]; c.img.style.display="none"; c.svg.innerHTML=""; c.cv.width=c.cv.height=256; c.el.classList.add("is-wait"); c.lab.textContent=NAME[p]+" LOCALISER\nwaiting"; c.lab2.textContent=""; });
  CELL.x.cv.width=CELL.x.cv.height=256; CELL.x.lab.textContent="K-SPACE"; CELL.x.lab2.textContent="";
  log("3-plane localiser: fast gradient echo, "+C.loc.fov.toFixed(0)+" mm FOV — “keep still, about 20 seconds”.","sys");
  var order=["sag","cor","ax"], i=0;
  (function next(){
    if(S.phase!=="loc") return;
    if(i>=order.length){ locRunning=false; S.locDone=true; log("localiser complete — 3 images stored.","ok"); gotoDash(); return; }
    var p=order[i++];
    prepK(p, function(){ acquireLoc(p, next); });
  })();
}
function acquireLoc(p, done){
  var c=CELL[p], K=KS[p], kg=CELL.x.cv.getContext("2d"), dur=2300, t0=performance.now(), last=-1;
  c.el.classList.remove("is-wait"); c.el.classList.add("is-active");
  var bar=document.createElement("i"); bar.className="mre-acqbar"; c.el.appendChild(bar);
  function frame(now){
    if(S.phase!=="loc"){ bar.remove(); return; }
    var f=Math.min(1,(now-t0)/dur), lines=Math.round(f*LN);
    if(lines-last>=6 || f>=1){
      last=lines;
      if(K){
        partialRecon(p, lines, c.cv);
        kg.fillStyle="#000"; kg.fillRect(0,0,256,256);
        if(lines>0) kg.drawImage(K.kc, 0, 0, 256, lines, 0, 0, 256, lines);
        kg.fillStyle="rgba(95,224,138,.9)"; kg.fillRect(0, Math.min(255,lines), 256, 1.5);
      }
      c.lab.textContent=NAME[p]+" LOCALISER\nphase-encode "+lines+" / 256";
      CELL.x.lab.textContent="K-SPACE · "+NAME[p]+"\nline "+lines+" / 256";
      bar.style.width=(f*100)+"%";
    }
    if(f<1){ requestAnimationFrame(frame); return; }
    bar.remove(); c.el.classList.remove("is-active");
    c.img.style.display=""; c.lab.textContent=NAME[p]+" LOCALISER\nGRE · 5 mm";
    setTimeout(done, 250);
  }
  requestAnimationFrame(frame);
}

/* =============================================================
   PROTOCOL DASHBOARD + PLANNING
   ============================================================= */
function gotoDash(){
  setPhase("dash");
  refreshCells();
  render();
  if(!Object.keys(S.done).length) log("start with the <b>sagittal 3D T1</b> (<b>plan sag</b>); the thin axial and coronal blocks unlock once it is scanned.","sys");
}
function gotoPlan(q){
  if(!S.plan[q] || TASKS.indexOf(q)<0) return;
  if(q!=="sag" && !S.done.sag){ log("scan the sagittal first — the thin blocks are tilted on those images.","warn"); return; }
  S.cur=q;
  CELL.x.cv.width=CELL.x.cv.height=384;
  setPhase("plan");
  refreshCells();
  drawPreview();
  log("planning the <b>"+SEQ[q].name.toLowerCase()+"</b>: "+SEQ[q].hint,"sys");
  if(needsAngle(q) && !sagOn()) log("drag the sagittal series from the tray into one of the boxes to unlock the tilt handle.","warn");
}
/* ---- extra localisers (none in this build): one click, no planning; the images then sit in the tray ---- */
function extraBlock(){
  return EXTRA.map(function(x){
    var d=!!S.acq[x.id];
    return '<div class="mre-card'+(d?" is-done":"")+'"><div class="mre-card-h"><i class="mre-sw" style="background:'+COLORS.cnt+'"></i><b>'+x.name+'</b>'+
      '<span class="mre-chip '+(d?"ok":"")+'">'+(d?"✓ ACQUIRED":"○ OPTIONAL")+'</span></div>'+
      '<p>Large-FOV mid-line sagittal ('+x.fov+' mm). Shows '+x.tells+'.'+(d?' It is in the tray: drag it into any box to plan on it.':'')+'</p>'+
      '<button class="scg-btn" type="button" data-x="'+x.k+'"><span>'+(d?"RE-RUN ":"RUN ")+x.name+'</span><span class="scg-key">'+x.k+'loc</span></button></div>';
  }).join('');
}
var extraRunning=false;
function runExtra(x){
  if(extraRunning || !(S.phase==="dash"||S.phase==="plan")) return;
  extraRunning=true;
  var back=S.phase, s=SER[x.id], t0=performance.now(), dur=2200, secs=Math.round(30 + s.n*s.spl);
  acqEl.classList.remove("scg-hidden"); acqTitle.textContent="ACQUIRING · "+x.name;
  log(low(x.name)+": a fast, large-FOV sagittal — “keep still, about a minute”.","sys");
  (function tick(now){
    var f=Math.max(0, Math.min(1,((now||performance.now())-t0)/dur));
    acqNum.textContent=s.seq+" · "+s.n+" slices · "+mmss(Math.round(secs*(1-f)))+" remaining";
    if(f<1 && S.phase===back){ requestAnimationFrame(tick); return; }
    acqEl.classList.add("scg-hidden"); extraRunning=false;
    if(S.phase!==back) return;
    var all=[]; for(var k=0;k<s.n;k++) all.push(k);
    S.acq[x.id]=all;
    log(low(x.name)+" acquired — "+s.n+" images. It shows "+x.tells+".","ok");
    useSeries(x.id, "x");                               // bottom-right box: beside the localisers, not instead of one
  })();
}
/* ---- the boxes: localisers and completed series, dragged in from the tray ---- */
function itemPlane(it){ return it.indexOf("loc:")===0 ? it.slice(4) : SER[it].plane; }
function itemName(it){ return it.indexOf("loc:")===0 ? NAME[it.slice(4)]+" LOC" : thumbName(it); }
function cellLabel(p){
  var ct=content(p); if(!ct) return "";
  if(ct.type==="loc") return NAME[ct.key]+" LOCALISER";
  var s=SER[ct.id], list=S.acq[ct.id];
  return NAME[s.plane]+" · "+s.seq+" (series)\nIM "+(ct.i+1)+"/"+list.length+" · scroll";
}
function refreshCells(){
  SLOTS.forEach(function(p){
    var c=CELL[p], ct=content(p), ser=!!ct && ct.type==="ser", moved=!!S.swap[p];
    c.el.classList.toggle("is-series", ser);
    if(ct && ct.type==="loc"){ var u=url("loc_"+ct.key); if(c.img.getAttribute("src")!==u) c.img.src=u; c.img.style.display=""; }
    else c.img.style.display="none";
    var rb=c.el.querySelector(".mre-restore"), sc=c.el.querySelector(".mre-scroll");
    if(moved && !rb){
      rb=document.createElement("button"); rb.type="button"; rb.className="mre-restore"; rb.textContent = p==="x" ? "↺ PREVIEW" : "↺ "+NAME[p]+" LOC";
      rb.onclick=function(){ logCmd("restore "+(SLOTS.indexOf(p)+1)); restoreLoc(p); }; c.el.appendChild(rb);
    }
    if(!moved && rb) rb.remove();
    if(ser && !sc){
      sc=document.createElement("div"); sc.className="mre-scroll";
      sc.innerHTML='<button type="button" aria-label="previous slice">▲</button><button type="button" aria-label="next slice">▼</button>';
      sc.children[0].onclick=function(){ scrollCell(p, -1); }; sc.children[1].onclick=function(){ scrollCell(p, 1); };
      c.el.appendChild(sc);
    }
    if(!ser && sc) sc.remove();
    if(ser) drawCellSeries(p);
    else if(ct){ if(c.cv.width!==256){ c.cv.width=c.cv.height=256; } c.cv.getContext("2d").clearRect(0,0,256,256); }
    if(ct){ c.lab.textContent=cellLabel(p); if(p==="x"){ c.lab2.textContent=""; c.lab2.style.color=""; } }
    var o=ct ? ORI[ct.plane] : ["","","",""];
    ["t","b","l","r"].forEach(function(k, i){ var e=c.el.querySelector(".mre-ori."+k); if(e) e.textContent=o[i]; });
  });
  syncX();
}
/* the fourth box: the protocol summary (protocol screen) or the preview (planning) until something is dropped into it */
function syncX(){
  var has=!!content("x"), X=CELL.x;
  info.classList.toggle("scg-hidden", S.phase!=="dash" || has);
  X.cv.style.display = (S.phase==="dash" && !has) ? "none" : "";
  if(has) return;
  X.svg.innerHTML=""; X.el.classList.remove("is-want"); var tag=X.el.querySelector(".mre-want"); if(tag) tag.remove();
  if(S.phase==="plan"){ if(X.cv.width!==384){ X.cv.width=X.cv.height=384; } schedulePreview(); }
  else if(S.phase==="dash"){ X.lab.textContent=""; X.lab2.textContent=""; }
}
function drawCellSeries(p){
  var c=CELL[p], cv=c.cv, sw=S.swap[p], k=S.acq[sw.id][sw.i];
  if(cv.width!==512){ cv.width=cv.height=512; }
  getImg(imgName(sw.id, k), function(im){
    var w=S.swap[p]; if(!w || w.id!==sw.id || S.acq[w.id][w.i]!==k) return;
    var g=cv.getContext("2d"); g.setTransform(1,0,0,1,0,0); g.imageSmoothingEnabled=true; g.imageSmoothingQuality="high";
    g.drawImage(im, 0, 0, 512, 512);
  });
}
var MID = PONS;                                                // the middle of the pons: where a series opens
function closestIn(id, list, P){ var b=0; list.forEach(function(k, j){ if(Math.abs(dot(sub(P, SER[id].ipp[k]), SER[id].nrm)) < Math.abs(dot(sub(P, SER[id].ipp[list[b]]), SER[id].nrm))) b=j; }); return b; }
/* put item it ("loc:sag" | "loc:cor" | "loc:ax" | a series id) into box p */
function place(it, p){
  if(!CELL[p]) return;
  if(it.indexOf("loc:")===0){ var key=it.slice(4); if(key===p) delete S.swap[p]; else S.swap[p]={ loc:key }; }
  else { if(!S.acq[it]) return; S.swap[p]={ id:it, i:closestIn(it, S.acq[it], MID) }; }
  var t = it.indexOf("loc:")===0 ? "loc" : SER[it].task;
  log(itemName(it)+" is now in the "+SLOTNAME[p]+" box"+
    (t==="sag" ? " — opened on the mid-line. Tilt the thin blocks here: axial slices square to the back of the pons, coronal slices along it."
     : " — your plan boxes are drawn on it in their true position."),"ok");
  refreshCells(); render(); schedulePreview();
}
function useSeries(id, slot){ if(S.acq[id]) place(id, slot || SER[id].plane); }
function restoreLoc(p){ delete S.swap[p]; log(p==="x" ? "bottom-right box: preview restored." : NAME[p]+" localiser restored.","sys"); refreshCells(); render(); schedulePreview(); }
function scrollCell(p, d){
  var sw=S.swap[p]; if(!sw || !sw.id) return;
  var i=Math.max(0, Math.min(S.acq[sw.id].length-1, sw.i+d)); if(i===sw.i) return;
  sw.i=i; drawCellSeries(p); CELL[p].lab.textContent=cellLabel(p); drawOverlays();
}
SLOTS.forEach(function(p){
  CELL[p].el.addEventListener("wheel", function(e){ if(!S.swap[p] || !S.swap[p].id || !(S.phase==="plan"||S.phase==="dash")) return; e.preventDefault(); scrollCell(p, e.deltaY>0?1:-1); }, { passive:false });
});
function thumbName(id){ return NAME[SER[id].plane]+' · '+SER[id].seq; }
function inUse(it){ return SLOTS.some(function(p){ var ct=content(p); return !!ct && (ct.type==="loc" ? "loc:"+ct.key : ct.id)===it; }); }
function trayBlock(){
  var its=(S.locDone ? PANELS.map(function(k){ return "loc:"+k; }) : []).concat(Object.keys(S.acq));
  if(!its.length) return "";
  return '<div class="scg-hint">Localisers and completed series — <b>drag any of them into any of the four boxes</b> to plan on several at once (tap one to put it in its usual box; ↺ puts a box back):</div><div class="mre-tray">'+
    its.map(function(it){ return '<button type="button" class="mre-thumb'+(inUse(it)?" is-used":"")+'" data-id="'+it+'" title="Drag into any box"><canvas width="152" height="152"></canvas><span>'+itemName(it)+'</span></button>'; }).join('')+'</div>';
}
var tdrag=null;
function bindTray(){
  Array.prototype.forEach.call(railBody.querySelectorAll(".mre-thumb"), function(b){
    var id=b.dataset.id, cv=b.querySelector("canvas");
    if(id.indexOf("loc:")===0) getImg("loc_"+id.slice(4), function(im){ cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height); });
    else { var list=S.acq[id]; renderSeries(id, list[closestIn(id, list, MID)], cv); }
    b.addEventListener("pointerdown", function(e){
      e.preventDefault();
      tdrag={ id:id, x:e.clientX, y:e.clientY, moved:false, ghost:null, src:cv };
      try{ b.setPointerCapture(e.pointerId); }catch(_){}
    });
    b.addEventListener("pointermove", function(e){
      if(!tdrag) return;
      if(!tdrag.moved && Math.hypot(e.clientX-tdrag.x, e.clientY-tdrag.y) < 6) return;
      if(!tdrag.moved){
        tdrag.moved=true;
        var g=document.createElement("canvas"); g.className="mre-ghost"; g.width=g.height=76;
        try{ g.getContext("2d").drawImage(tdrag.src, 0, 0, 76, 76); }catch(_){}
        document.body.appendChild(g); tdrag.ghost=g;
      }
      tdrag.ghost.style.left=e.clientX+"px"; tdrag.ghost.style.top=e.clientY+"px";
      var over=dropCell(e.clientX, e.clientY);
      SLOTS.forEach(function(q){ CELL[q].el.classList.toggle("is-drop", q===over); });
    });
    function end(e){
      if(!tdrag) return;
      var d=tdrag; tdrag=null;
      if(d.ghost) d.ghost.remove();
      SLOTS.forEach(function(q){ CELL[q].el.classList.remove("is-drop","is-nodrop"); });
      var to = !d.moved ? (e.type==="pointerup" ? itemPlane(d.id) : null) : (e.type==="pointerup" ? dropCell(e.clientX, e.clientY) : null);
      if(!to) return;
      logCmd("use "+d.id.replace("loc:","loc")+" "+(SLOTS.indexOf(to)+1));
      place(d.id, to);
    }
    b.addEventListener("pointerup", end); b.addEventListener("pointercancel", end);
  });
}
function dropCell(x, y){
  var el=document.elementFromPoint(x, y), cell=el && el.closest ? el.closest(".mre-cell") : null;
  return cell ? cell.dataset.p : null;
}
function autoPlan(){
  var q=S.cur, id=SEQ[q].ideal, A=SEQ[q].auto, pl=S.plan[q];
  pl.c=seriesCentre(id).map(function(v){ return Math.round(v*2)/2; });
  pl.n=A.n; pl.thk=A.thk; pl.gap=A.gap;
  pl.fov=SEQ[q].fov;
  log("auto-plan: a typical coverage and FOV for the "+SEQ[q].name.toLowerCase()+(needsAngle(q)?" block — the tilt is still yours to set.":"."),"sys");
  afterPlan();
}

/* =============================================================
   ACQUIRE + VIEW
   ============================================================= */
function scanSeq(){
  var q=S.cur, a=analyse(q);
  if(!canScan(q)){ log(scanBlockReason(q)+".","warn"); return; }
  if(!a.all) log("scanning with gaps: "+a.key.filter(function(k){ return !k.ok; }).map(function(k){ return k.name.toLowerCase(); }).join("; ")+" not covered.","warn");
  var ids=imaged(q);
  if(!SEQ[q].seqs.some(function(s){ return s.have && S.chosen[q][s.id]; })) log("no imaged sequence ticked — acquiring "+SER[ids[0]].seq+" so there is something to look at.","sys");
  setPhase("acquire");
  acqEl.classList.remove("scg-hidden"); acqTitle.textContent="ACQUIRING · "+SEQ[q].name;
  var t0=performance.now(), dur=2400*ids.length, total=ids.reduce(function(t,id){ return t+scanTime(id); },0);
  (function tick(now){
    if(S.phase!=="acquire") return;
    var f=Math.max(0, Math.min(1,((now||performance.now())-t0)/dur)), cur=ids[Math.min(ids.length-1, Math.floor(f*ids.length))];
    acqNum.textContent=SER[cur].seq+" · "+S.plan[q].n+" slices · "+mmss(Math.round(total*(1-f)))+" remaining";
    if(f<1){ requestAnimationFrame(tick); return; }
    S.done[q]=true;
    Object.keys(S.acq).forEach(function(id){ if(SER[id].task===q) delete S.acq[id]; });
    ids.forEach(function(id){ var l=coveredSlices(id); S.acq[id]= l.length ? l : [nearestSlice(id, S.plan[q].c)]; });
    S.ids[q]=ids;
    Object.keys(S.swap).forEach(function(p){ var sw=S.swap[p]; if(sw.loc) return; if(!S.acq[sw.id]) delete S.swap[p]; else sw.i=Math.min(sw.i, S.acq[sw.id].length-1); });
    if(q==="sag") log("tip: for the axial and coronal blocks, drag the sagittal series into one of the boxes — that is where you set their tilt.","sys");
    log(SEQ[q].name.toLowerCase()+" acquired — "+ids.map(function(id){ return SER[id].seq+" "+S.acq[id].length+" images"; }).join(", ")+".", planOK(q)?"ok":"warn");
    showSeries(ids[0], "view");
  })();
}
function viewIds(){ return S.phase==="result" ? Object.keys(S.acq) : (S.ids[SER[S.viewId].task]||[S.viewId]); }
function showButtons(){
  var id=S.viewId;
  winBtns.innerHTML=viewIds().map(function(i){ var t=SER[i].task; return '<button type="button" data-id="'+i+'" class="'+(i===id?"is-on":"")+'">'+NAME[t]+' '+SER[i].seq+'</button>'; }).join('');
  Array.prototype.forEach.call(winBtns.querySelectorAll("button"), function(b){ b.onclick=function(){ showSeries(b.dataset.id, null); }; });
}
function showSeries(id, phase){
  S.viewId=id; S.list=S.acq[id];
  if(phase) setPhase(phase);
  stackSlider.max=S.list.length-1; S.viewK=closestIn(id, S.list, MID); stackSlider.value=S.viewK;
  showButtons();
  drawView(); render();
}
function drawView(){
  var id=S.viewId, s=SER[id], q=s.task, k=S.list[S.viewK], c=sliceCentre(id,k), where, pos, d;
  renderSeries(id, k, viewCv);
  if(TYPE[q]==="ax"){ d=alongStem(c, s.nrm); where=levelAt(d); pos=Math.abs(d).toFixed(0)+" mm "+(d>=0?"above":"below")+" mid-pons"; }
  else if(TYPE[q]==="cor"){ d=acrossStem(c, s.nrm); where=depthAt(d); pos=Math.abs(d).toFixed(0)+" mm "+(d>=0?"behind":"in front of")+" mid-pons"; }
  else { where=sideName(c[0]); pos=(c[0]-X0>=0?"left ":"right ")+Math.abs(c[0]-X0).toFixed(0)+" mm"; }
  vpTL.textContent=SEQ[q].name+" · "+s.seq+"\nIM "+(S.viewK+1)+" / "+S.list.length+"  ·  "+pos;
  vpBL.textContent=where;
  vpBR.textContent="FOV "+S.plan[q].fov+" mm\nBRAIN · 3 T";
}
stackSlider.addEventListener("input", function(){ S.viewK=+stackSlider.value; drawView(); });
viewEl.addEventListener("wheel", function(e){ if(!(S.phase==="view"||S.phase==="result")) return; e.preventDefault(); stepView(e.deltaY>0?1:-1); }, { passive:false });
var vdrag=null;
viewEl.addEventListener("pointerdown", function(e){ vdrag={ y:e.clientY, k:S.viewK }; try{ viewEl.setPointerCapture(e.pointerId); }catch(_){} });
viewEl.addEventListener("pointermove", function(e){ if(!vdrag) return; var k=vdrag.k+Math.round((e.clientY-vdrag.y)/12); k=Math.max(0, Math.min(S.list.length-1, k)); if(k!==S.viewK){ S.viewK=k; stackSlider.value=k; drawView(); } });
viewEl.addEventListener("pointerup", function(){ vdrag=null; });
function stepView(d){ var k=Math.max(0, Math.min(S.list.length-1, S.viewK+d)); if(k!==S.viewK){ S.viewK=k; stackSlider.value=k; drawView(); } }
document.addEventListener("keydown", function(e){
  if(!(S.phase==="view"||S.phase==="result") || document.activeElement===cli) return;
  if(e.key==="ArrowDown"||e.key==="ArrowRight"){ e.preventDefault(); stepView(1); }
  if(e.key==="ArrowUp"||e.key==="ArrowLeft"){ e.preventDefault(); stepView(-1); }
});

/* =============================================================
   RESULT
   ============================================================= */
function showResult(){
  var planes=TASKS.every(planOK), posOK=POS[S.pos].cls==="ok", all=planes && posOK;
  setPhase("result");
  showSeries(S.ids.sag[0], null);
  var rows=TASKS.map(function(q){
    var a=analyse(q), ok=planOK(q), A=needsAngle(q);
    return '<div class="scg-drow"><i class="scg-d-'+(ok?"ok":"warn")+'">'+(ok?"✓":"⚠")+'</i><div><b>'+SEQ[q].name+'</b><em>'+S.plan[q].n+' × '+S.plan[q].thk+' mm · FOV '+S.plan[q].fov+(A?' · tilt '+deg1(tiltOf(q)):'')+'</em>'+
      '<p>'+SEQ[q].spanLab+' '+spanText(q)+' ('+a.cov.toFixed(0)+' mm '+SEQ[q].covLab+'). '+
      (A ? (a.angOK ? "Tilt within "+Math.abs(a.ang).toFixed(0)+"° of the brainstem line ("+deg1(REF)+"). " : "Tilt "+Math.abs(a.ang).toFixed(0)+"° away from "+(TYPE[q]==="ax"?"square to":"the line of")+" the brainstem. ")
         : (a.angOK ? "Straight, on the mid-line. " : "Turned "+deg1(sagRot(q))+" / leaning "+deg1(sagLean(q))+" off the mid-line. "))+
      (a.all?"All key structures covered.":"Missed: "+a.key.filter(function(k){ return !k.ok; }).map(function(k){ return k.name; }).join("; ")+".")+
      (a.narrow?" FOV too small: wrap-around.":"")+(a.coarse?" FOV too coarse.":"")+
      (a.over?" More slices than needed — extra coverage adds scan time.":"")+'</p></div></div>';
  }).join('');
  var seqRows=TASKS.map(function(q){
    return SEQ[q].seqs.map(function(s, i){
      var on=!!S.chosen[q][s.id];
      return '<tr class="'+(on?"is-on":"")+'"><td>'+(i===0?'<b>'+SEQ[q].name+'</b>':'')+'</td><td><b>'+s.name+'</b>'+(s.have?" ·&nbsp;shown here":"")+'</td><td>'+s.why+'</td><td>'+(on?"✓ in your protocol":(s.rec?"recommended":"optional"))+'</td></tr>';
    }).join('');
  }).join('');
  var heroLab={ sag:"your thin blocks", ax:SER[S.ids.ax[0]].seq+" · at the nerves", cor:SER[S.ids.cor[0]].seq+" · at the nerves" };
  resultEl.innerHTML=
    '<div><h2'+(all?'':' class="is-bad"')+'>'+(all?"Both nerves, pons to Meckel\'s cave":"Planning debrief")+'</h2>'+
    '<div class="scg-cap">Demonstration only: how much of the trigeminal nerves your plans cover and how well the thin blocks are tilted. Position: <b>'+POS[S.pos].short+'</b> — '+POS[S.pos].note+'</div>'+
    '<div class="mre-heroes">'+TASKS.map(function(q){ return '<div class="scg-hero"><canvas width="320" height="320" data-q="'+q+'"></canvas><div class="scg-hero-lab">'+SEQ[q].name+'\n'+heroLab[q]+'</div></div>'; }).join('')+'</div>'+
    '<div class="scg-cap" style="margin-top:6px">On the sagittal: the first and last slices of your axial block (green) and of your coronal block (blue), with the brainstem line each is graded against dashed. On the axial and coronal: the slice of your block nearest the nerves.</div>'+
    '<h2 style="margin-top:16px">Sequences to consider</h2><div class="scg-cap">A trigeminal neuralgia protocol pairs a survey of the whole brain (T2 / FLAIR, for demyelination or a mass) with thin, heavily T2-weighted 3D images through the pons and a 3D TOF MRA of the same block, so a vessel lying against the nerve at the root entry zone can be seen; thin T1 before and after gadolinium when a tumour or inflammation is in question. Local protocols differ. Highlighted rows are the ones you ticked.</div>'+
    '<table class="mre-tbl"><tr><th>Plan</th><th>Sequence</th><th>Shows</th><th></th></tr>'+seqRows+'</table></div>'+
    '<div class="scg-debrief">'+rows+
    '<div class="scg-drow"><i class="scg-d-'+(posOK?"ok":"warn")+'">'+(posOK?"✓":"⚠")+'</i><div><b>Position</b><p>'+POS[S.pos].note+(posOK?"":" The marker needs the head straight and padded either side.")+'</p></div></div>'+
    '<button class="scg-again" type="button" id="mreAgain">↺ Plan again</button></div>'+
    '<div class="scg-credits">'+CREDITS+'</div>';
  TASKS.forEach(function(q){
    var cv=resultEl.querySelector('canvas[data-q="'+q+'"]'), id=S.ids[q][0], list=S.acq[id], pl=clone(S.plan[q]), k;
    pl.c=PONS.slice();
    if(q==="sag"){ k=list[closestIn(id, list, MID)]; pl.fov=150; renderSeries(id, k, cv, pl, function(cr){ heroLines(cv, id, k, cr); }); }
    else { k=list[closestIn(id, list, q==="ax" ? LM.rez_r : [X0, -6, LM.rez_r[2]])]; pl.fov=120; renderSeries(id, k, cv, pl); }
  });
  $("mreAgain").onclick=function(){ logCmd("plan again"); S.done={}; S.ids={}; S.acq={}; S.swap={}; resultEl.classList.add("scg-hidden"); achWrap.classList.add("scg-hidden"); gotoDash(); };
  resultEl.classList.remove("scg-hidden");
  achWrap.classList.toggle("scg-hidden", !all);
  if(all) playAchievement();
  log(all?"both nerves from the pons to Meckel's cave, axials square to the brainstem, coronals along it — marker unlocked.":"debrief ready — "+(planes?"the planning is right; the patient position is not.":"some plans have gaps or the tilt is off."), all?"ok":"warn");
  drawOverlays();
}
var CREDITS = '<b>Imaging:</b> adapted from Filimonova E, Pashkov A, Martirosyan A, Kurilov V, Moysak G, Rzaev J (2024), <i>A large-scale dataset of pre- and post-surgical MRI data in patients with chronic trigeminal neuralgia</i> (Version 2.0.3) [dataset], OpenNeuro, '+
  '<a href="https://doi.org/10.18112/openneuro.ds005713.v2.0.3" target="_blank" rel="noopener">doi:10.18112/openneuro.ds005713.v2.0.3</a> (CC0). Described in: Filimonova E, Pashkov A, Tiutiunnik A, et al. A large-scale dataset of pre- and postsurgical MRI data from patients with chronic trigeminal neuralgia. <i>Sci Data</i> (2025), '+
  '<a href="https://doi.org/10.1038/s41597-025-06311-y" target="_blank" rel="noopener">doi:10.1038/s41597-025-06311-y</a>. One de-identified research participant (sub-050), brain MRI at 3 T: a sagittal 3D T1 (TFE) and a 3D T2 (TSE, TE 300 ms), both with 1 mm slices, defaced by the dataset authors. The clinical request shown in the simulator is fictional, and nothing here describes or interprets what the images show. '+
  '<b>Changes made:</b> every image is <b>cut out of one of those two volumes by interpolation</b> — the dataset holds no scout and no separate axial or coronal series. The localiser is three 5 mm images through the T1 volume; the sagittal series shows one 1 mm image every 2.5 mm; the axial images are 1 mm thick, square to the brainstem, and the coronal images 2 mm thick, along it; pixel values are windowed to 8-bit JPEG / PNG. '+
  'The brainstem line (the back of the pons, '+deg1(REF)+' on the sagittal) and the landmarks behind the coverage ticks and the read-outs were marked by hand (± 3 mm) — <b>not yet checked by a radiologist or radiographer</b>. Each scan shows the prepared images that fall inside your stack, cropped to your FOV; your tilt doesn\'t re-slice the images — it is graded against that line (± '+TOL+'°). The patient position doesn\'t change the images. The 3-D room shows a generic closed-bore magnet and head coil. '+
  'Sequences without images are listed for teaching only. Educational simulation — not a medical device.';
/* on the sagittal hero image: the first and last slices of each thin block (solid) and the brainstem line it is graded against (dashed) */
function heroLines(cv, id, k, cr){
  var g=cv.getContext("2d"), L=34;
  function line(c, u, col, dash){
    var a=cropPt(id, k, cr, axpy(c,u,-L)), b=cropPt(id, k, cr, axpy(c,u,L));
    g.save(); g.strokeStyle=col; g.lineWidth=dash?1.5:2.2; g.setLineDash(dash?[6,5]:[]); g.globalAlpha=dash?0.9:1;
    g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); g.restore();
  }
  [["ax", nUp, BACK], ["cor", nBack, UP]].forEach(function(e){
    var q=e[0]; if(!S.done[q]) return;
    var pl=S.plan[q], n=e[1](q), h=coverage(pl)/2, c=[X0, pl.c[1], pl.c[2]], u=cross(n, [1,0,0]);   // the block's in-plane direction on the sagittal
    u=mul(u, 1/Math.hypot(u[0],u[1],u[2]));
    line(c, e[2], "#ffffff", true);
    line(axpy(c, n, h), u, COLORS[q], false);
    line(axpy(c, n, -h), u, COLORS[q], false);
  });
}
function resetAll(){
  S=freshState(); addFixedPlans();
  resultEl.classList.add("scg-hidden"); achWrap.classList.add("scg-hidden");
  logEl.innerHTML=""; gotoSetup();
}

/* =============================================================
   BOOT
   ============================================================= */
$("scgStart").onclick=function(){ titleEl.classList.add("scg-hidden"); gotoSetup(); };
window.__mrs={ S:function(){ return S; }, parse:parseCommand, useSeries:useSeries, analyse:analyse, planOK:planOK, gotoPlan:gotoPlan,
               autoPlan:autoPlan, setAngle:setAngle, place:place, content:content, runExtra:runExtra, EXTRA:EXTRA, angErr:angErr, axTilt:axTilt, tiltOf:tiltOf, shapeOf:shapeOf, REF:REF, scanSeq:scanSeq, showResult:showResult };
addFixedPlans();
setPhase("title");
})();
