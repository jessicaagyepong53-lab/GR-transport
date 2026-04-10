// ─── DRIVER PERFORMANCE PAGE ─────────────────────────────────────────────────

let driverData = null;
let truckId = '';
let charts = {};

function fmt(n) {
  if (n >= 1000000) return 'GHS ' + (n/1000000).toFixed(2) + 'M';
  if (n >= 1000) return 'GHS ' + (n/1000).toFixed(0) + 'K';
  return 'GHS ' + n.toLocaleString();
}

async function loadDriver() {
  const params = new URLSearchParams(window.location.search);
  truckId = params.get('id') || '';
  if (!truckId) {
    document.getElementById('driverName').textContent = 'No truck specified';
    return;
  }

  try {
    driverData = await API.get(`/api/trucks/${encodeURIComponent(truckId)}`);
  } catch {
    document.getElementById('driverName').textContent = 'Truck not found';
    return;
  }

  document.getElementById('driverName').textContent = driverData.driver || 'Unknown Driver';
  document.getElementById('driverSubtitle').textContent = `Assigned to ${truckId} · Driver Performance`;

  renderKPIs();
  renderYearlyChart();
  renderEffChart();
  renderYearTable();
}

function getYears() {
  if (!driverData?.years) return [];
  return Object.keys(driverData.years).map(Number).sort();
}

function getTotals() {
  const years = driverData?.years || {};
  let gross = 0, exp = 0, net = 0, weeks = 0;
  for (const y in years) {
    gross += years[y].gross || 0;
    exp += years[y].exp || 0;
    net += years[y].net || 0;
    weeks += years[y].weeks || 0;
  }
  return { gross, exp, net, weeks };
}

function renderKPIs() {
  const { gross, exp, net, weeks } = getTotals();
  const eff = gross ? Math.round(net / gross * 100) : 0;
  const avgWeek = weeks ? Math.round(gross / weeks) : 0;

  document.getElementById('kpiStrip').innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Total Gross Earned</div>
      <div class="kpi-value">${fmt(gross)}</div>
      <div class="kpi-sub">${weeks} weeks operated</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Net Income</div>
      <div class="kpi-value">${fmt(net)}</div>
      <div class="kpi-sub">${eff}% efficiency</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Expenditure</div>
      <div class="kpi-value">${fmt(exp)}</div>
      <div class="kpi-sub">${gross ? Math.round(exp/gross*100) : 0}% of gross</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Avg Weekly Gross</div>
      <div class="kpi-value">${fmt(avgWeek)}</div>
      <div class="kpi-sub">Per week average</div>
    </div>
  `;
}

function renderYearlyChart() {
  const years = getYears();
  const data = driverData.years;
  const ctx = document.getElementById('yearlyChart').getContext('2d');
  if (charts.yearly) charts.yearly.destroy();
  charts.yearly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        { label: 'Gross', data: years.map(y => data[y]?.gross || 0), backgroundColor: 'rgba(155,114,255,0.7)', borderColor: '#9b72ff', borderWidth: 1.5, borderRadius: 5 },
        { label: 'Net', data: years.map(y => data[y]?.net || 0), backgroundColor: 'rgba(45,224,138,0.6)', borderColor: '#2de08a', borderWidth: 1.5, borderRadius: 5 },
        { label: 'Exp', data: years.map(y => data[y]?.exp || 0), backgroundColor: 'rgba(224,68,58,0.6)', borderColor: '#e0443a', borderWidth: 1.5, borderRadius: 5 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: '#9aa4b8', padding: 12, usePointStyle: true } },
        tooltip: { backgroundColor: '#1a1f2b', borderColor: '#252d3d', borderWidth: 1, callbacks: { label: ctx => ` ${ctx.dataset.label}: GHS ${ctx.parsed.y.toLocaleString()}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9aa4b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7a96', callback: v => 'GHS ' + (v/1000) + 'K' } }
      }
    }
  });
}

function renderEffChart() {
  const years = getYears();
  const data = driverData.years;
  const ctx = document.getElementById('effChart').getContext('2d');
  if (charts.eff) charts.eff.destroy();
  charts.eff = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: 'Efficiency %',
        data: years.map(y => {
          const g = data[y]?.gross || 0;
          const n = data[y]?.net || 0;
          return g ? Math.round(n / g * 100) : 0;
        }),
        borderColor: '#9b72ff',
        backgroundColor: 'rgba(155,114,255,0.1)',
        borderWidth: 2.5,
        pointBackgroundColor: '#9b72ff',
        pointRadius: 5,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#1a1f2b', borderColor: '#252d3d', borderWidth: 1 }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9aa4b8' } },
        y: { max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7a96', callback: v => v + '%' } }
      }
    }
  });
}

function renderYearTable() {
  const years = getYears();
  const data = driverData.years;
  let html = `<thead><tr><th>Year</th><th>Gross</th><th>Expenditure</th><th>Net</th><th>Weeks</th><th>Efficiency</th></tr></thead><tbody>`;

  let totGross = 0, totExp = 0, totNet = 0, totWeeks = 0;
  years.forEach(y => {
    const e = data[y] || {};
    const eff = e.gross ? Math.round(e.net / e.gross * 100) : 0;
    totGross += e.gross || 0; totExp += e.exp || 0; totNet += e.net || 0; totWeeks += e.weeks || 0;
    html += `<tr>
      <td style="color:var(--label);font-weight:600">${y}</td>
      <td style="color:var(--accent);font-weight:600">${(e.gross||0).toLocaleString()}</td>
      <td style="color:var(--red)">${(e.exp||0).toLocaleString()}</td>
      <td style="color:var(--green);font-weight:700">${(e.net||0).toLocaleString()}</td>
      <td style="color:var(--muted)">${e.weeks||0}</td>
      <td style="color:${eff>80?'var(--green)':eff>60?'var(--accent)':'var(--red)'};font-weight:600">${eff}%</td>
    </tr>`;
  });

  const totEff = totGross ? Math.round(totNet / totGross * 100) : 0;
  html += `<tr style="border-top:2px solid var(--border);font-weight:700">
    <td style="color:var(--text)">TOTAL</td>
    <td style="color:var(--accent)">${totGross.toLocaleString()}</td>
    <td style="color:var(--red)">${totExp.toLocaleString()}</td>
    <td style="color:var(--green)">${totNet.toLocaleString()}</td>
    <td style="color:var(--muted)">${totWeeks}</td>
    <td style="color:${totEff>80?'var(--green)':totEff>60?'var(--accent)':'var(--red)'}">${totEff}%</td>
  </tr></tbody>`;

  document.getElementById('yearTable').innerHTML = html;
}

document.addEventListener('DOMContentLoaded', loadDriver);

// Auto-refresh when tab gains focus
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadDriver();
});
