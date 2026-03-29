// ─── STORAGE ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'transport_dashboard_data';

const DEFAULT_DATA = {
  monthly: {
    2024: {
      labels: ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      gross:  [18000,24000,23000,23000,22000,51000,56000,82000,86000],
      exp:    [120,4300,3500,9120,9500,32600,3120,9020,46550],
    },
    2025: {
      labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      gross:  [66000,73000,83500,60000,60000,97000,81000,104000,109000,130000,180500,155500],
      exp:    [5310,76500,30300,30540,3300,5600,7310,130150,0,14960,51020,9250],
    },
    2026: {
      labels: ['Jan','Feb','Mar'],
      gross:  [128500,140000,183000],
      exp:    [44550,47700,21450],
    },
  },
  trucks: {
    'GT 6350-19': {
      2024:{ gross:219000, exp:81260, net:137740, weeks:38 },
      2025:{ gross:29000,  exp:6270,  net:22730,  weeks:6  },
    },
    'GN 4106-18': {
      2024:{ gross:101000, exp:19720, net:81280,  weeks:17 },
      2025:{ gross:329000, exp:151230, net:177770, weeks:51 },
      2026:{ gross:59000,  exp:1770,  net:57230,  weeks:9  },
    },
    'GW 1568-22 OLD': {
      2024:{ gross:65000,  exp:16850, net:48150,  weeks:10 },
      2025:{ gross:372000, exp:126030, net:245970, weeks:51 },
      2026:{ gross:23000,  exp:28070, net:-5070,  weeks:4  },
    },
    'GN 1674-21': {
      2025:{ gross:257000, exp:71490, net:185510, weeks:33 },
      2026:{ gross:166500, exp:39420, net:127080, weeks:11 },
    },
    'GN 4394-25': {
      2025:{ gross:166500, exp:5070,  net:161430, weeks:16 },
      2026:{ gross:113000, exp:39420, net:73580,  weeks:11 },
    },
    'GX 4502-22 NEW': {
      2025:{ gross:46000,  exp:4150,  net:41850,  weeks:6  },
      2026:{ gross:90000,  exp:5020,  net:84980,  weeks:11 },
    },
    'GN 626-26 BLUE': {
      2026:{ gross:0, exp:0, net:0, weeks:0 },
    },
    'GN 4107-26 GREEN': {
      2026:{ gross:0, exp:0, net:0, weeks:0 },
    },
  },
  drivers: {
    'GT 6350-19':'Paapa',
    'GN 4106-18':'Issac/Alfred',
    'GW 1568-22 OLD':'Oliver',
    'GN 1674-21':'JAT',
    'GN 4394-25':'ATL Isaac',
    'GX 4502-22 NEW':'Agoe',
    'GN 626-26 BLUE':'',
    'GN 4107-26 GREEN':'',
  },
  expBreakdown: {
    2024: { maint:12000,  other:105830 },
    2025: { maint:46200,  other:318040 },
    2026: { maint:28050,  other:85650  },
  },
};

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch(e) { /* ignore corrupt data */ }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function migrateLegacyPurchasePrice(data) {
  if (!data || !data.purchasePrice) return false;
  if (!data.truckCost) data.truckCost = {};

  Object.keys(data.purchasePrice).forEach(id => {
    const pp = parseFloat(data.purchasePrice[id]) || 0;
    if (pp <= 0) return;
    if (!data.truckCost[id]) {
      data.truckCost[id] = { initialValue: pp, pricePaid: pp, maintenanceCost: 0 };
    }
  });

  delete data.purchasePrice;
  return true;
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}

// ─── TRASH / RECOVERY ────────────────────────────────────────────────────────
const TRASH_KEY = 'transport_dashboard_trash';

function loadTrash() {
  try { return JSON.parse(localStorage.getItem(TRASH_KEY)) || []; }
  catch(e) { return []; }
}
function saveTrash(trash) {
  localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
}
function purgeOldTrash() {
  const trash = loadTrash();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  saveTrash(trash.filter(item => item.deletedAt > cutoff));
}
function trashItem(type, label, data) {
  const trash = loadTrash();
  trash.push({ type, label, data, deletedAt: Date.now() });
  saveTrash(trash);
}
purgeOldTrash();

let DATA = loadData();
if (migrateLegacyPurchasePrice(DATA)) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}
if (!DATA.entryMeta) DATA.entryMeta = {};

function ensureYearData(year) {
  if (!DATA.monthly[year]) DATA.monthly[year] = { labels: [], gross: [], exp: [] };
  if (!DATA.expBreakdown[year]) DATA.expBreakdown[year] = { maint: 0, other: 0 };
}

function ensureEntryMeta(truckId, year) {
  if (!DATA.entryMeta) DATA.entryMeta = {};
  if (!DATA.entryMeta[truckId]) DATA.entryMeta[truckId] = {};
  if (!DATA.entryMeta[truckId][year]) DATA.entryMeta[truckId][year] = {};
  return DATA.entryMeta[truckId][year];
}

function touchEntryMeta(truckId, year, isCreate) {
  const meta = ensureEntryMeta(truckId, year);
  const now = Date.now();
  if (isCreate && !meta.createdAt) meta.createdAt = now;
  if (!meta.createdAt) meta.createdAt = now;
  meta.updatedAt = now;
}

function clearEntryMeta(truckId, year) {
  if (!DATA.entryMeta || !DATA.entryMeta[truckId]) return;
  if (year === undefined) {
    delete DATA.entryMeta[truckId];
    return;
  }
  delete DATA.entryMeta[truckId][year];
  if (Object.keys(DATA.entryMeta[truckId]).length === 0) delete DATA.entryMeta[truckId];
}

function getEntryMeta(truckId, year) {
  return DATA.entryMeta?.[truckId]?.[year] || null;
}


// ─── TRUCK COST & BREAK-EVEN HELPERS ─────────────────────────────────────────
// New schema: DATA.truckCost[id] = { initialValue, pricePaid, maintenanceCost }
// Legacy: DATA.purchasePrice[id] = number  (migrated transparently)
function getTruckCost(id) {
  const c = DATA.truckCost?.[id];
  if (c) return c;
  const pp = DATA.purchasePrice?.[id];
  if (pp) return { initialValue: pp, pricePaid: pp, maintenanceCost: 0 };
  return null;
}

// Break-even target = price paid + initial maintenance/repairs
function getTruckBreakEvenTotal(id) {
  const c = getTruckCost(id);
  return c ? ((c.pricePaid || 0) + (c.maintenanceCost || 0)) : 0;
}

function getTruckTotalAmount(id) {
  const c = getTruckCost(id);
  return c ? ((c.initialValue || 0) + (c.pricePaid || 0) + (c.maintenanceCost || 0)) : 0;
}

// Year in which the truck's cumulative net first reached the break-even target
function getBreakEvenYear(id) {
  const target = getTruckBreakEvenTotal(id);
  if (!target) return null;
  const years = Object.keys(DATA.trucks[id] || {}).map(Number).sort();
  let cumNet = 0;
  for (const y of years) {
    cumNet += (DATA.trucks[id][y]?.net) || 0;
    if (cumNet >= target) return y;
  }
  return null;
}

// Number of years from first operational year to break-even year (inclusive)
function getBreakEvenDuration(id) {
  const years = Object.keys(DATA.trucks[id] || {}).map(Number).sort();
  const beYear = getBreakEvenYear(id);
  if (!beYear || !years.length) return null;
  return beYear - years[0] + 1;
}

// ─── DERIVED DATA ────────────────────────────────────────────────────────────
function recalcYearlyTotals() {
  DATA.yearlyTotals = {};
  for (const truckId in DATA.trucks) {
    for (const year in DATA.trucks[truckId]) {
      const e = DATA.trucks[truckId][year];
      if (!DATA.yearlyTotals[year]) DATA.yearlyTotals[year] = { gross:0, exp:0, net:0 };
      DATA.yearlyTotals[year].gross += e.gross;
      DATA.yearlyTotals[year].exp   += e.exp;
      DATA.yearlyTotals[year].net   += e.net;
    }
  }
}

function recalcExpBreakdownAll() {
  let maint = 0, other = 0;
  for (const y in DATA.expBreakdown) {
    if (y === 'all') continue;
    maint += DATA.expBreakdown[y].maint || 0;
    other += DATA.expBreakdown[y].other || 0;
  }
  DATA.expBreakdown.all = { maint, other };
}

function getMonthlyAll() {
  const allLabels = [];
  const allGross = [];
  const allExp = [];
  const yearKeys = Object.keys(DATA.monthly).sort();
  yearKeys.forEach(y => {
    const m = DATA.monthly[y];
    if (m) {
      const suffix = " '" + String(y).slice(-2);
      allLabels.push(...m.labels.map(l => l + suffix));
      allGross.push(...m.gross);
      allExp.push(...m.exp);
    }
  });
  return { labels: allLabels, gross: allGross, exp: allExp };
}

function getAllYears() {
  const yrs = new Set();
  for (const t in DATA.trucks) {
    for (const y in DATA.trucks[t]) yrs.add(Number(y));
  }
  for (const y in DATA.monthly) yrs.add(Number(y));
  return [...yrs].sort();
}

function getTotalWeeks(year) {
  let weeks = 0;
  for (const t in DATA.trucks) {
    if (year === 'all') {
      for (const y in DATA.trucks[t]) weeks += DATA.trucks[t][y].weeks;
    } else if (DATA.trucks[t][year]) {
      weeks += DATA.trucks[t][year].weeks;
    }
  }
  return weeks;
}

// ─── CHART DEFAULTS ──────────────────────────────────────────────────────────
Chart.defaults.color = '#6b7a96';
Chart.defaults.font.family = 'DM Sans';
Chart.defaults.plugins.legend.display = false;

const TRUCK_COLOR_MAP = {
  'GT 6350-19':  '#f5a623',  // Gold
  'GN 4106-18':  '#4a9eff',  // Blue
  'GW 1568-22 OLD': '#2de08a', // Green
  'GN 1674-21':  '#9b72ff',  // Purple
  'GN 4394-25':  '#e0443a',  // Red
  'GX 4502-22 NEW':  '#22d3ee',  // Cyan
  'GN 626-26':  '#f472b6',  // Pink
  'GN 4107-26':  '#ff8c42',  // Orange
};
const TRUCK_COLORS_FALLBACK = ['#f472b6','#ff8c42','#36cfc9','#b8b8ff','#ffd666','#95de64'];
function getTruckColor(id) {
  if (TRUCK_COLOR_MAP[id]) return TRUCK_COLOR_MAP[id];
  const ids = Object.keys(DATA.trucks).filter(k => !TRUCK_COLOR_MAP[k]);
  return TRUCK_COLORS_FALLBACK[ids.indexOf(id) % TRUCK_COLORS_FALLBACK.length] || '#6b7a96';
}
const TRUCK_COLORS = Object.values(TRUCK_COLOR_MAP);

let currentYear = 'all';
let charts = {};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmt(n) {
  if(n >= 1000000) return 'GHS ' + (n/1000000).toFixed(2) + 'M';
  if(n >= 1000) return 'GHS ' + (n/1000).toFixed(0) + 'K';
  return 'GHS ' + n.toLocaleString();
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString();
}

function getISOWeeksInYear(year) {
  const y = parseInt(year);
  const jan1 = new Date(y, 0, 1);
  const dec31 = new Date(y, 11, 31);
  // ISO: year has 53 weeks if Jan 1 is Thursday, or Dec 31 is Thursday
  return (jan1.getDay() === 4 || dec31.getDay() === 4) ? 53 : 52;
}

function getWeeksForYear(year) {
  const y = parseInt(year);
  const now = new Date();
  const currentYear = now.getFullYear();
  const totalWeeksInYear = getISOWeeksInYear(y);
  if (y < currentYear) return totalWeeksInYear;
  if (y > currentYear) return 0;
  const start = new Date(y, 0, 1);
  const diff = now - start;
  return Math.min(totalWeeksInYear, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
}

function populateYearSelect(selectId, selectedYear) {
  const sel = document.getElementById(selectId);
  let html = '';
  for (let y = 2024; y <= 2040; y++) {
    const wks = getISOWeeksInYear(y);
    html += `<option value="${y}"${y === selectedYear ? ' selected' : ''}>${y} (${wks} weeks)</option>`;
  }
  sel.innerHTML = html;
}

function isTruckEndOfTerm(truckId) {
  return !!(DATA.endOfTerm && DATA.endOfTerm[truckId]);
}

function getTruckData(year) {
  const trucks = DATA.trucks;
  return Object.keys(trucks).map(id => {
    let gross=0,exp=0,net=0,weeks=0;
    const years = year === 'all' ? Object.keys(trucks[id]) : [String(year)];
    years.forEach(y => {
      if(trucks[id][y]) {
        gross  += trucks[id][y].gross;
        exp    += trucks[id][y].exp;
        net    += trucks[id][y].net;
        weeks  += trucks[id][y].weeks;
      }
    });
    // Break-even is a lifetime metric — always use cumulative net across all years
    let cumulativeNet = 0;
    for (const cy in trucks[id]) cumulativeNet += trucks[id][cy].net;
    const truckCost = getTruckCost(id);
    const beTotal = getTruckBreakEvenTotal(id);
    const brokenEven = beTotal > 0 && cumulativeNet >= beTotal;
    const profitAfterBE = beTotal > 0 ? cumulativeNet - beTotal : null;
    const breakEvenDuration = brokenEven ? getBreakEvenDuration(id) : null;
    const totalAmount = getTruckTotalAmount(id);
    return { id, gross, exp, net, weeks, eff: gross ? Math.round(net/gross*100) : 0, endOfTerm: isTruckEndOfTerm(id), truckCost, beTotal, totalAmount, brokenEven, profitAfterBE, cumulativeNet, breakEvenDuration };
  }).filter(t => t).sort((a,b) => b.net - a.net);
}

function getYearlyKPIs(year) {
  recalcYearlyTotals();
  if(year === 'all') {
    const gross = Object.values(DATA.yearlyTotals).reduce((s,y)=>s+y.gross,0);
    const exp   = Object.values(DATA.yearlyTotals).reduce((s,y)=>s+y.exp,0);
    const net   = gross - exp;
    const weeks = getTotalWeeks('all');
    return { gross, exp, net, weeks };
  }
  const y = DATA.yearlyTotals[year];
  if (!y) return { gross:0, exp:0, net:0, weeks:0 };
  const weeks = getTotalWeeks(year);
  return { gross:y.gross, exp:y.exp, net:y.gross-y.exp, weeks };
}

// ─── KPIs ────────────────────────────────────────────────────────────────────
function renderKPIs(year) {
  const {gross,exp,net,weeks} = getYearlyKPIs(year);
  const eff = gross ? Math.round(net/gross*100) : 0;
  const avgWeek = weeks ? Math.round(gross/weeks) : 0;

  // Build per-truck weeks breakdown
  let truckWeeksHtml = '';
  const trucks = Object.keys(DATA.trucks);
  trucks.forEach(t => {
    let tw = 0;
    if (year === 'all') { for (const y in DATA.trucks[t]) tw += DATA.trucks[t][y].weeks; }
    else if (DATA.trucks[t][year]) tw = DATA.trucks[t][year].weeks;
    if (tw > 0) truckWeeksHtml += `<span style="display:inline-block;font-size:0.62rem;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.05);border:1px solid ${isTruckEndOfTerm(t) ? 'rgba(224,68,58,0.3)' : 'var(--border)'};margin:2px;color:var(--label)">${t} <b style="color:${isTruckEndOfTerm(t) ? 'var(--red)' : 'var(--accent)'}">${tw}w</b>${isTruckEndOfTerm(t) ? ' <span style="font-size:0.5rem;color:var(--red)">EOT</span>' : ''}</span>`;
  });

  const el = document.getElementById('kpiStrip');
  el.innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Total Gross Income</div>
      <div class="kpi-value">${fmt(gross)}</div>
      <div class="kpi-sub">${weeks} operational weeks</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Net Income</div>
      <div class="kpi-value">${fmt(net)}</div>
      <span class="kpi-badge badge-up">▲ ${eff}% efficiency</span>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Expenditure</div>
      <div class="kpi-value">${fmt(exp)}</div>
      <div class="kpi-sub">${gross ? Math.round(exp/gross*100) : 0}% of gross income</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Avg Weekly Gross</div>
      <div class="kpi-value">${fmt(avgWeek)}</div>
      <div class="kpi-sub">Per week across all trucks</div>
    </div>
  `;
  if (truckWeeksHtml) {
    el.innerHTML += `<div style="grid-column:1/-1;padding:0 4px;display:flex;flex-wrap:wrap;align-items:center;gap:4px">
      <span style="font-size:0.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-right:4px"><i class="fa-solid fa-truck" style="margin-right:3px"></i>Weeks per Truck:</span>
      ${truckWeeksHtml}
    </div>`;
  }
}

// ─── MONTHLY CHART ────────────────────────────────────────────────────────────
function renderMonthly(year) {
  const d = year === 'all' ? getMonthlyAll() : (DATA.monthly[year] || { labels:[], gross:[], exp:[] });
  const net = d.gross.map((g,i) => g - (d.exp[i]||0));
  const ctx = document.getElementById('monthlyChart').getContext('2d');
  if(charts.monthly) charts.monthly.destroy();
  charts.monthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: d.labels,
      datasets: [
        {
          label:'Gross Income', data:d.gross,
          backgroundColor:'rgba(245,166,35,0.75)', borderColor:'#f5a623',
          borderWidth:1, borderRadius:4, order:2,
        },
        {
          label:'Expenditure', data:d.exp,
          backgroundColor:'rgba(224,68,58,0.65)', borderColor:'#e0443a',
          borderWidth:1, borderRadius:4, order:2,
        },
        {
          label:'Net Income', data:net,
          type:'line', borderColor:'#2de08a', backgroundColor:'rgba(45,224,138,0.1)',
          borderWidth:2.5, pointBackgroundColor:'#2de08a', pointRadius:4,
          tension:0.4, fill:true, order:1,
        },
      ]
    },
    options: {
      responsive:true, interaction:{mode:'index',intersect:false},
      plugins:{
        tooltip:{
          backgroundColor:'#1a1f2b', borderColor:'#252d3d', borderWidth:1,
          callbacks:{
            label: ctx => ` ${ctx.dataset.label}: GHS ${ctx.parsed.y.toLocaleString()}`
          }
        }
      },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#6b7a96'} },
        y:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#6b7a96',
          callback: v => 'GHS '+(v/1000)+'K' } }
      }
    }
  });
}

// ─── TRUCK INCOME CHART ───────────────────────────────────────────────────────
function renderTruckIncome(year) {
  const trucks = getTruckData(year);
  const ctx = document.getElementById('truckIncomeChart').getContext('2d');
  if(charts.truckIncome) charts.truckIncome.destroy();
  charts.truckIncome = new Chart(ctx, {
    type:'bar',
    data:{
      labels: trucks.map(t=>t.id),
      datasets:[
        { label:'Gross', data:trucks.map(t=>t.gross),
          backgroundColor: trucks.map(t=>getTruckColor(t.id)+'99'),
          borderColor: trucks.map(t=>getTruckColor(t.id)),
          borderWidth:1.5, borderRadius:5 },
        { label:'Net', data:trucks.map(t=>t.net),
          backgroundColor: trucks.map(t=>getTruckColor(t.id)+'44'),
          borderColor: trucks.map(t=>getTruckColor(t.id)+'88'),
          borderWidth:1, borderRadius:5 },
      ]
    },
    options:{
      responsive:true, indexAxis:'y',
      plugins:{ tooltip:{ backgroundColor:'#1a1f2b', borderColor:'#252d3d', borderWidth:1,
        callbacks:{ label: ctx => ` ${ctx.dataset.label}: GHS ${ctx.parsed.x.toLocaleString()}` }
      }},
      scales:{
        x:{ stacked:false, grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#6b7a96',callback:v=>'GHS '+(v/1000)+'K'} },
        y:{ grid:{display:false}, ticks:{color:'#9aa4b8', font:{family:'JetBrains Mono',size:11}} }
      }
    }
  });
}

// ─── EXPENDITURE BREAKDOWN ────────────────────────────────────────────────────
function renderExpBreakdown(year) {
  recalcExpBreakdownAll();
  const d = year === 'all' ? DATA.expBreakdown.all : (DATA.expBreakdown[year] || {maint:0,other:0});
  const total = (d.maint||0) + (d.other||0);
  const ctx = document.getElementById('expBreakdownChart').getContext('2d');
  if(charts.expBreak) charts.expBreak.destroy();
  charts.expBreak = new Chart(ctx, {
    type:'doughnut',
    data:{
      labels:['Maintenance (Oil Changes)','Other Expenses (Parts)'],
      datasets:[{
        data:[d.maint||0, d.other||0],
        backgroundColor:['rgba(45,224,138,0.8)','rgba(224,68,58,0.8)'],
        borderColor:['#2de08a','#e0443a'],
        borderWidth:2, hoverOffset:8
      }]
    },
    options:{
      responsive:true, cutout:'68%',
      plugins:{
        legend:{ display:true, position:'bottom',
          labels:{color:'#9aa4b8', padding:16, usePointStyle:true} },
        tooltip:{ backgroundColor:'#1a1f2b', borderColor:'#252d3d', borderWidth:1,
          callbacks:{ label: ctx => ` GHS ${ctx.parsed.toLocaleString()} (${total ? Math.round(ctx.parsed/total*100) : 0}%)` }
        }
      }
    }
  });
}

// ─── YEARLY CHART ─────────────────────────────────────────────────────────────
function renderYearly() {
  recalcYearlyTotals();
  const years = getAllYears();
  const ctx = document.getElementById('yearlyChart').getContext('2d');
  if(charts.yearly) charts.yearly.destroy();
  charts.yearly = new Chart(ctx, {
    type:'bar',
    data:{
      labels: years,
      datasets:[
        { label:'Gross', data:years.map(y=>(DATA.yearlyTotals[y]||{}).gross||0),
          backgroundColor:'rgba(245,166,35,0.7)', borderColor:'#f5a623', borderWidth:1.5, borderRadius:5 },
        { label:'Net', data:years.map(y=>{ const t=DATA.yearlyTotals[y]; return t?(t.gross-t.exp):0; }),
          backgroundColor:'rgba(45,224,138,0.6)', borderColor:'#2de08a', borderWidth:1.5, borderRadius:5 },
        { label:'Exp', data:years.map(y=>(DATA.yearlyTotals[y]||{}).exp||0),
          backgroundColor:'rgba(224,68,58,0.6)', borderColor:'#e0443a', borderWidth:1.5, borderRadius:5 },
      ]
    },
    options:{
      responsive:true,
      plugins:{ legend:{display:true,position:'bottom',labels:{color:'#9aa4b8',padding:12,usePointStyle:true}},
        tooltip:{ backgroundColor:'#1a1f2b', borderColor:'#252d3d', borderWidth:1,
          callbacks:{label:ctx=>` ${ctx.dataset.label}: GHS ${ctx.parsed.y.toLocaleString()}`} }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#9aa4b8'} },
        y:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#6b7a96',callback:v=>'GHS '+(v/1000)+'K'} }
      }
    }
  });
}

// ─── EFFICIENCY RADAR / BAR ───────────────────────────────────────────────────
function renderEfficiency(year) {
  const trucks = getTruckData(year);
  const ctx = document.getElementById('efficiencyChart').getContext('2d');
  if(charts.eff) charts.eff.destroy();
  charts.eff = new Chart(ctx, {
    type:'bar',
    data:{
      labels: trucks.map(t=>t.id),
      datasets:[{
        label:'Efficiency %',
        data: trucks.map(t=>t.eff),
        backgroundColor: trucks.map(t =>
          t.eff > 80 ? 'rgba(45,224,138,0.75)' :
          t.eff > 60 ? 'rgba(245,166,35,0.75)' :
          'rgba(224,68,58,0.75)'
        ),
        borderColor: trucks.map(t =>
          t.eff > 80 ? '#2de08a' : t.eff > 60 ? '#f5a623' : '#e0443a'
        ),
        borderWidth:1.5, borderRadius:5
      }]
    },
    options:{
      responsive:true, indexAxis:'y',
      plugins:{ tooltip:{ backgroundColor:'#1a1f2b', borderColor:'#252d3d', borderWidth:1,
        callbacks:{ label: ctx => ` Net efficiency: ${ctx.parsed.x}%` }
      }},
      scales:{
        x:{ max:100, grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#6b7a96',callback:v=>v+'%'} },
        y:{ grid:{display:false}, ticks:{color:'#9aa4b8',font:{family:'JetBrains Mono',size:11}} }
      }
    }
  });
}

// ─── BREAK-EVEN CHART ────────────────────────────────────────────────────────
function renderBreakEvenChart() {
  const allTrucks = getTruckData('all');
  const trucks = allTrucks.filter(t => t.beTotal > 0);
  const card = document.getElementById('breakEvenCard');
  if (!trucks.length) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

  const brokenCount = trucks.filter(t => t.brokenEven).length;
  const sub = document.getElementById('breakEvenSubtitle');
  if (sub) sub.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--green);margin-right:4px"></i><strong style="color:var(--green)">${brokenCount}</strong> of ${trucks.length} tracked trucks have broken even. Green bars = profit after break-even · Red bars = shortfall remaining. Costs = Price Paid + Initial Maintenance.`;

  const labels  = trucks.map(t => t.id);
  const data    = trucks.map(t => t.profitAfterBE);
  const bgColors = data.map(v => v >= 0 ? 'rgba(45,224,138,0.75)' : 'rgba(224,68,58,0.75)');
  const bdColors = data.map(v => v >= 0 ? '#2de08a' : '#e0443a');

  const ctx = document.getElementById('breakEvenChart').getContext('2d');
  if (charts.breakEven) charts.breakEven.destroy();
  charts.breakEven = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Profit / Shortfall vs Break-Even',
        data,
        backgroundColor: bgColors,
        borderColor: bdColors,
        borderWidth: 1.5,
        borderRadius: 5,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1f2b', borderColor: '#252d3d', borderWidth: 1,
          callbacks: {
            title: ctx => ctx[0].label,
            label: ctx => {
              const v = ctx.parsed.y;
              const truck = trucks.find(t => t.id === ctx.label);
              const cost = truck?.truckCost;
              const beTarget = truck?.beTotal || 0;
              const cn = truck ? truck.cumulativeNet : 0;
              const dur = truck?.breakEvenDuration;
              return v >= 0
                ? [` ✓ Broken Even${dur ? ' in ' + dur + ' yr' + (dur !== 1 ? 's' : '') : ''}`, ` Profit after BE: +GHS ${v.toLocaleString()}`, ` Cumulative Net: GHS ${cn.toLocaleString()}`, ` BE Target: GHS ${beTarget.toLocaleString()}`, ...(cost ? [` Initial Value: GHS ${(cost.initialValue||0).toLocaleString()}`, ` Price Paid: GHS ${(cost.pricePaid||0).toLocaleString()}`, ` Maint/Repairs: GHS ${(cost.maintenanceCost||0).toLocaleString()}`, ` Total Amount: GHS ${((cost.initialValue||0) + (cost.pricePaid||0) + (cost.maintenanceCost||0)).toLocaleString()}`] : [])]
                : [` ✗ Not yet broken even`, ` Shortfall: GHS ${Math.abs(v).toLocaleString()}`, ` Cumulative Net: GHS ${cn.toLocaleString()}`, ` BE Target: GHS ${beTarget.toLocaleString()}`, ...(cost ? [` Initial Value: GHS ${(cost.initialValue||0).toLocaleString()}`, ` Price Paid: GHS ${(cost.pricePaid||0).toLocaleString()}`, ` Maint/Repairs: GHS ${(cost.maintenanceCost||0).toLocaleString()}`, ` Total Amount: GHS ${((cost.initialValue||0) + (cost.pricePaid||0) + (cost.maintenanceCost||0)).toLocaleString()}`] : [])];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9aa4b8', font: { family: 'JetBrains Mono', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#6b7a96', callback: v => 'GHS ' + (v / 1000).toFixed(0) + 'K' }
        }
      }
    }
  });
}

// ─── HEATMAP ──────────────────────────────────────────────────────────────────
function renderHeatmap() {
  const trucks = Object.keys(DATA.trucks);
  const years  = getAllYears();
  const allNets = trucks.flatMap(t => years.map(y => DATA.trucks[t][y]?.net || 0));
  const maxNet  = Math.max(...allNets, 1);

  let html = `<div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
      <tr>
        <th style="padding:6px 8px;color:var(--muted);text-align:left;font-weight:500;font-size:0.68rem;text-transform:uppercase;letter-spacing:1px">Truck</th>
        ${years.map(y=>`<th style="padding:6px 10px;color:var(--muted);text-align:center;font-weight:500;font-size:0.68rem;letter-spacing:1px">${y}</th>`).join('')}
      </tr>`;
  trucks.forEach(t => {
    const eot = isTruckEndOfTerm(t);
    // Calculate break-even for heatmap label
    let totalNet = 0;
    for (const y in DATA.trucks[t]) totalNet += DATA.trucks[t][y].net;
    const beTotal = getTruckBreakEvenTotal(t);
    const be = beTotal > 0 && totalNet >= beTotal;
    html += `<tr>
      <td style="padding:6px 8px;font-family:'JetBrains Mono',monospace;font-size:0.72rem;white-space:nowrap"><a href="truck.html?id=${encodeURIComponent(t)}" style="color:${eot ? 'var(--red)' : getTruckColor(t)};text-decoration:none;font-weight:600${eot ? ';opacity:0.7' : ''}" title="${eot ? t + ' (End of Term)' : 'View ' + t + ' details'}">${t}</a>${eot ? ' <span style="font-size:0.55rem;color:var(--red)">EOT</span>' : ''}${be ? ' <span style="font-size:0.5rem;color:var(--green)">BE</span>' : ''}</td>`;
    years.forEach(y => {
      const d = DATA.trucks[t][y];
      const net = d?.net || 0;
      const ratio = maxNet ? net/maxNet : 0;
      const alpha = net > 0 ? (0.15 + ratio * 0.75).toFixed(2) : '0.08';
      const textColor = net > 0 ? (ratio > 0.5 ? '#fff' : '#e8ecf4') : 'var(--muted)';
      const bg = net > 0
        ? `rgba(45,224,138,${alpha})`
        : net < 0
          ? `rgba(224,68,58,0.3)`
          : `rgba(255,255,255,0.04)`;
      const label = d ? `GHS ${(net/1000).toFixed(0)}K` : '—';
      html += `<td onclick="openEditEntry('${t}',${y})" style="padding:7px 8px;text-align:center;background:${bg};color:${textColor};border-radius:4px;font-weight:600;letter-spacing:0.3px;cursor:pointer" title="Click to edit">${label}</td>`;
    });
    html += `</tr>`;
  });
  html += `</table></div>`;
  document.getElementById('heatmapContainer').innerHTML = html;
}

// ─── TRUCK TABLE ──────────────────────────────────────────────────────────────
function renderTable(year) {
  const trucks = getTruckData(year);
  const maxNet = Math.max(...trucks.map(t=>t.net), 1);
  const rankClasses = ['r1','r2','r3','r4','r5','r6','r1','r2','r3','r4'];
  document.getElementById('tableYearPill').textContent =
    year === 'all' ? 'All Years Combined' : `Year ${year}`;

  const showEntryMeta = year !== 'all';
  let html = `
    <thead><tr>
      <th>Rank</th><th>Truck ID</th><th>Driver</th>
      <th>Gross (GHS)</th><th>Expenditure (GHS)</th><th>Net Income (GHS)</th>
      <th>Weeks Operated</th><th>Efficiency</th><th>Net Income Bar</th>
      ${showEntryMeta ? '<th>Last Input / Last Edit</th>' : ''}
      ${isAdmin() ? '<th>Actions</th>' : ''}
    </tr></thead><tbody>`;

  trucks.forEach((t,i) => {
    const pct = maxNet ? Math.round(t.net/maxNet*100) : 0;
    const effColor = t.eff>80?'var(--green)':t.eff>60?'var(--accent)':'var(--red)';
    const driver = DATA.drivers[t.id] || '—';
    const meta = showEntryMeta ? getEntryMeta(t.id, year) : null;
    const createdText = showEntryMeta ? fmtDateTime(meta?.createdAt) : '';
    const updatedText = showEntryMeta ? fmtDateTime(meta?.updatedAt) : '';
    html += `<tr>
      <td><span class="rank-badge ${rankClasses[i%rankClasses.length]}">${i+1}</span></td>
      <td>
        <a href="truck.html?id=${encodeURIComponent(t.id)}" class="truck-id" style="text-decoration:none;color:${getTruckColor(t.id)}">${t.id}</a>
        ${t.truckCost ? `<span style="display:inline-block;font-size:0.5rem;padding:1px 5px;border-radius:3px;background:rgba(74,158,255,0.15);color:var(--blue);border:1px solid rgba(74,158,255,0.28);margin-left:6px;font-weight:700;letter-spacing:0.45px;vertical-align:middle">TOTAL GHS ${(t.totalAmount||0).toLocaleString()}</span>` : ''}
        ${t.endOfTerm ? '<span style="display:inline-block;font-size:0.55rem;padding:1px 5px;border-radius:3px;background:rgba(224,68,58,0.15);color:var(--red);border:1px solid rgba(224,68,58,0.3);margin-left:6px;font-weight:700;letter-spacing:0.5px;vertical-align:middle">END OF TERM</span>' : ''}
        ${t.brokenEven ? '<span style="display:inline-block;font-size:0.55rem;padding:1px 5px;border-radius:3px;background:rgba(45,224,138,0.15);color:var(--green);border:1px solid rgba(45,224,138,0.3);margin-left:6px;font-weight:700;letter-spacing:0.5px;vertical-align:middle">BROKEN EVEN</span>' : ''}
        ${t.brokenEven && t.breakEvenDuration ? `<span style="display:inline-block;font-size:0.5rem;padding:1px 5px;border-radius:3px;background:rgba(45,224,138,0.08);color:var(--green);border:1px solid rgba(45,224,138,0.2);margin-left:4px;font-weight:600;vertical-align:middle">in ${t.breakEvenDuration} yr${t.breakEvenDuration !== 1 ? 's' : ''}</span>` : ''}
        ${t.profitAfterBE !== null ? `<div style="margin-top:4px;font-size:0.65rem;font-weight:600;${t.profitAfterBE >= 0 ? 'color:var(--green)' : 'color:var(--red)'}"><i class="fa-solid fa-${t.profitAfterBE >= 0 ? 'arrow-trend-up' : 'arrow-trend-down'}" style="margin-right:2px"></i>${t.profitAfterBE >= 0 ? '+' + fmt(t.profitAfterBE) + ' profit after BE' : fmt(Math.abs(t.profitAfterBE)) + ' away from BE'}${t.truckCost ? ` <span style="font-weight:400;color:var(--muted)">(Total GHS ${(t.totalAmount||0).toLocaleString()} = init GHS ${(t.truckCost.initialValue||0).toLocaleString()} + paid GHS ${(t.truckCost.pricePaid||0).toLocaleString()} + maint GHS ${(t.truckCost.maintenanceCost||0).toLocaleString()})</span>` : ''}</div>` : ''}
      </td>
      <td style="color:var(--label)">${driver}</td>
      <td style="color:var(--accent);font-weight:600">${t.gross.toLocaleString()}</td>
      <td style="color:var(--red)">${t.exp.toLocaleString()}</td>
      <td style="color:var(--green);font-weight:700">${t.net.toLocaleString()}</td>
      <td style="color:var(--muted);text-align:center">${t.weeks}</td>
      <td style="color:${effColor};font-weight:600;font-family:'JetBrains Mono',monospace">${t.eff}%</td>
      <td style="min-width:100px">
        <div class="bar-cell">
          <div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${pct}%"></div></div>
          <span style="font-size:0.7rem;color:var(--muted);min-width:28px">${pct}%</span>
        </div>
      </td>
      ${showEntryMeta ? `<td style="font-size:0.68rem;line-height:1.35;color:var(--muted);min-width:150px"><div><strong style="color:var(--label)">Input:</strong> ${createdText}</div><div><strong style="color:var(--label)">Edit:</strong> ${updatedText}</div></td>` : ''}
      ${isAdmin() ? `<td>
        <button class="mgmt-btn" onclick="openEditEntry('${t.id}',${year})" title="Edit entry" style="padding:3px 7px;font-size:0.72rem">✎</button>
        ${!t.endOfTerm ? `<button class="mgmt-btn" onclick="openAddEntryFor('${t.id}')" title="Add year entry" style="padding:3px 7px;font-size:0.72rem">＋</button>` : ''}
        <button class="mgmt-btn" onclick="toggleEndOfTerm('${t.id}')" title="${t.endOfTerm ? 'Remove end of term' : 'Mark end of term'}" style="padding:3px 7px;font-size:0.72rem;background:${t.endOfTerm ? 'rgba(45,224,138,0.15);border-color:var(--green)' : 'rgba(245,166,35,0.15);border-color:var(--accent)'}">${t.endOfTerm ? '↺' : '⏹'}</button>
        <button class="mgmt-btn" onclick="openDeleteTruck('${t.id}')" title="Delete truck" style="padding:3px 7px;font-size:0.72rem;background:rgba(224,68,58,0.2);border-color:var(--red)">✕</button>
      </td>` : ''}
    </tr>`;
  });
  html += `</tbody>`;
  document.getElementById('truckTable').innerHTML = html;
}

// ─── YEAR SWITCH ──────────────────────────────────────────────────────────────
function setYear(year) {
  currentYear = year;
  document.querySelectorAll('.year-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.year === String(year));
  });
  // Hide management buttons & spreadsheet on 'All Years', show on individual years (only for admins)
  const mgmt = document.getElementById('mgmtBar');
  const spread = document.getElementById('spreadBar');
  const spreadCard = document.getElementById('spreadsheetCard');
  if (mgmt) mgmt.style.display = (year === 'all' || !isAdmin()) ? 'none' : '';
  if (spread) spread.style.display = (year === 'all' || !isAdmin()) ? 'none' : '';
  if (spreadCard) spreadCard.style.display = (year === 'all') ? 'none' : '';

  renderKPIs(year);
  renderMonthly(year);
  renderTruckIncome(year);
  renderExpBreakdown(year);
  renderEfficiency(year);
  renderTable(year);
  if (typeof renderSpreadsheetEditor === 'function') renderSpreadsheetEditor();

  // Show only the selected year's spreadsheet link
  const linksEl = document.getElementById('spreadsheetLinks');
  if (linksEl) {
    linksEl.querySelectorAll('.spread-link').forEach(a => {
      const linkYear = new URL(a.href).searchParams.get('year');
      a.style.display = (year === 'all' || linkYear === String(year)) ? '' : 'none';
    });
  }
}

// ─── DYNAMIC YEAR TABS ───────────────────────────────────────────────────────
function renderYearTabs() {
  const container = document.querySelector('.year-tabs');
  if (!container) return;
  const years = getAllYears();
  let html = `<button class="year-tab active" data-year="all" onclick="setYear('all')">All Years</button>`;
  years.forEach(y => {
    html += `<button class="year-tab" data-year="${y}" onclick="setYear(${y})">${y}</button>`;
  });
  container.innerHTML = html;

  // Update header subtitle with dynamic year range
  const sub = document.getElementById('headerSubtitle');
  if (sub && years.length) {
    sub.textContent = `Truck Transport Business · ${years[0]} – ${years[years.length - 1]} · All Trucks`;
  }

  // Render spreadsheet links
  const linksEl = document.getElementById('spreadsheetLinks');
  if (linksEl) {
    linksEl.innerHTML = years.map(y =>
      `<a href="year.html?year=${y}" class="spread-link">📊 ${y}</a>`
    ).join('');
  }
}

// ─── REFRESH ALL ─────────────────────────────────────────────────────────────
function refreshAll() {
  recalcYearlyTotals();
  recalcExpBreakdownAll();
  renderYearTabs();
  setYear(currentYear);
  renderYearly();
  renderHeatmap();
  renderBreakEvenChart();
}

// ─── MODAL HELPERS ───────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => t.className = 'toast', 2600);
}

// ─── END OF TERM ─────────────────────────────────────────────────────────────
function toggleEndOfTerm(truckId) {
  if (!isAdmin()) return showToast('View only — contact admin to edit', true);
  if (!DATA.endOfTerm) DATA.endOfTerm = {};
  if (DATA.endOfTerm[truckId]) {
    delete DATA.endOfTerm[truckId];
    showToast(`${truckId} is back in service`);
  } else {
    DATA.endOfTerm[truckId] = { date: new Date().toISOString().split('T')[0] };
    showToast(`${truckId} marked as end of term`);
  }
  saveData();
  refreshAll();
}

// ─── ADD TRUCK ───────────────────────────────────────────────────────────────
function openAddTruck() {
  document.getElementById('newTruckId').value = '';
  document.getElementById('newTruckDriver').value = '';
  document.getElementById('newTruckInitialValue').value = '';
  document.getElementById('newTruckPricePaid').value = '';
  document.getElementById('newTruckMaintCost').value = '';
  updateNewTruckTotalAmount();
  const thisYear = new Date().getFullYear();
  populateYearSelect('newTruckYear', thisYear);
  document.getElementById('newTruckWeeks').value = getWeeksForYear(thisYear);
  document.getElementById('newTruckGross').value = '';
  document.getElementById('newTruckExp').value = '';
  openModal('addTruckModal');
}
function submitAddTruck() {
  if (!isAdmin()) return showToast('View only — contact admin to edit', true);
  const id = document.getElementById('newTruckId').value.trim().toUpperCase();
  const driver = document.getElementById('newTruckDriver').value.trim();
  if (!id) return showToast('Please enter a truck ID', true);
  if (DATA.trucks[id]) return showToast('Truck already exists', true);
  DATA.trucks[id] = {};
  if (driver) DATA.drivers[id] = driver;
  const initVal = parseFloat(document.getElementById('newTruckInitialValue').value) || 0;
  const pricePaid = parseFloat(document.getElementById('newTruckPricePaid').value) || 0;
  const maintCost = parseFloat(document.getElementById('newTruckMaintCost').value) || 0;
  if (initVal > 0 || pricePaid > 0 || maintCost > 0) {
    if (!DATA.truckCost) DATA.truckCost = {};
    DATA.truckCost[id] = { initialValue: initVal, pricePaid, maintenanceCost: maintCost };
  }
  const year = parseInt(document.getElementById('newTruckYear').value);
  const gross = parseFloat(document.getElementById('newTruckGross').value) || 0;
  const exp = parseFloat(document.getElementById('newTruckExp').value) || 0;
  const weeks = parseInt(document.getElementById('newTruckWeeks').value) || 0;
  if (year) {
    DATA.trucks[id][year] = { gross, exp, net: gross - exp, weeks };
    ensureYearData(year);
  }
  saveData();
  closeModal('addTruckModal');
  showToast(`Truck ${id} added`);
  refreshAll();
}

function updateNewTruckTotalAmount() {
  const initVal = parseFloat(document.getElementById('newTruckInitialValue')?.value) || 0;
  const pricePaid = parseFloat(document.getElementById('newTruckPricePaid')?.value) || 0;
  const maintCost = parseFloat(document.getElementById('newTruckMaintCost')?.value) || 0;
  const total = initVal + pricePaid + maintCost;
  const el = document.getElementById('newTruckTotalAmount');
  if (el) {
    el.textContent = `Total Amount: GHS ${total.toLocaleString()} (init GHS ${initVal.toLocaleString()} + paid GHS ${pricePaid.toLocaleString()} + maint GHS ${maintCost.toLocaleString()})`;
  }
}

// ─── ADD YEAR ENTRY ──────────────────────────────────────────────────────────
function populateTruckSelect() {
  const sel = document.getElementById('entryTruckSelect');
  const trucks = Object.keys(DATA.trucks).filter(id => !isTruckEndOfTerm(id));
  sel.innerHTML = trucks.map(id =>
    `<option value="${id}">${id} (${DATA.drivers[id]||'—'})</option>`
  ).join('');
}

function openAddEntry() {
  populateTruckSelect(); }
  // const thisYear = new Date().getFullYear(); // Removed duplicate or stray line 