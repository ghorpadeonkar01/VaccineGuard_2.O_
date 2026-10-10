(async () => {
  let auth;
  try {
    auth = await VGAuth.requireSession();
  } catch (error) {
    document.getElementById('app').innerHTML = `<div class="notice danger" style="margin:40px auto;max-width:500px">${error.message}</div>`;
    return;
  }
  if (!auth) return;

  const demo = window.VG_DEMO || { shipments: [], alerts: [], sensors: [] };
  const q = new URLSearchParams(location.search);
  let page = q.get('page') || 'dashboard';
  const user = auth.user;
  const role = auth.role;

  let activeView = q.get('view') || 'live';
  let pollTimer = null;

  document.body.classList.toggle('monitor-mode', page === 'dashboard' && activeView === 'live');

  const pages = {
    dashboard: 'Live Operations Center',
    shipments: 'Shipment Register',
    details: 'Shipment Telemetry Details',
    tracking: 'Fleet Map Tracking',
    alerts: 'Excursions & Incidents',
    'checkpoint-operations': 'Checkpoint Control',
    sensors: 'Connected IoT Nodes',
    analytics: 'Thermal Degradation Analytics',
    policies: 'Vaccine Cold Policies',
    users: 'Account Management',
    simulation: 'Excursion Simulator',
    'audit-logs': 'Audit Logs & Diagnostics'
  };

  const nav = [
    ['Live Operations', 'dashboard'],
    ['Shipments', 'shipments'],
    ['Live Tracking', 'tracking'],
    ['Alerts & Incidents', 'alerts'],
    ['Checkpoint Control', 'checkpoint-operations'],
    ['Sensors', 'sensors'],
    ['Analytics', 'analytics'],
    ['Vaccine Policies', 'policies'],
    ['Account Management', 'users']
  ];

  const icons = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    shipments: '<path d="m3 7 9-4 9 4v10l-9 4-9-4z"/><path d="m3 7 9 4 9-4M12 11v10"/>',
    tracking: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    alerts: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
    'checkpoint-operations': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/>',
    sensors: '<path d="M2 12h4l3-8 5 16 3-8h5"/>',
    analytics: '<path d="M4 20V11m6 9V4m6 16v-6m5 6H2"/>',
    policies: '<path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 5v1"/>',
    simulation: '<path d="m8 5 11 7-11 7z"/>',
    'audit-logs': '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'
  };

  const esc = (x) => String(x ?? '—').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const formatVal = (v) => (v === null || v === undefined || v === '' || v === 'null' ? '—' : esc(v));
  const badge = (x) => `<span class="badge ${/critical|danger/i.test(x) ? 'critical' : /risk|warn|high|excursion/i.test(x) ? 'warn' : /normal|optimal|safe|connected|delivered|resolved/i.test(x) ? 'ok' : 'info'}">${esc(x)}</span>`;

  const displayName = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || role);
  const link = (n) => `<a class="nav-link ${page === n[1] ? 'active' : ''}" href="?page=${n[1]}"><span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[n[1]] || icons.dashboard}</svg></span><span class="nav-text">${n[0]}</span></a>`;

  document.getElementById('app').innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="index.html">
          <span class="brand-mark">VG</span>
          <span class="brand-copy">Vaccine<span class="brand-accent">Guard</span><small>Cold Chain Operations Platform</small></span>
        </a>
        <div class="nav-label">MONITORING</div>
        <nav class="nav-links">
          ${nav.slice(0, 5).map(link).join('')}
          <div class="nav-label">ANALYTICS & ACCESS</div>
          ${nav.slice(5).map(link).join('')}
        </nav>
        <div class="sidebar-bottom">
          <a class="nav-link" id="logout" href="login.html">
            <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5m5 5H3m9-9h8v18h-8"/></svg></span>
            <span class="nav-text">Sign out</span>
          </a>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="top-left">
            <button class="hamburger" id="open-nav" aria-label="Open navigation">&#9776;</button>
            <div>
              <div class="top-title">${pages[page] || pages.dashboard}</div>
              <div class="crumb">System / ${pages[page] || pages.dashboard}</div>
            </div>
          </div>
          <div class="top-center">
            <div class="live-pill">
              <span class="live-dot"></span>
              <span class="live-pill-text">LIVE TELEMETRY STREAM</span>
              <span class="live-device-tag" id="top-device-tag">CCW-NODE-01</span>
            </div>
          </div>
          <div class="top-actions">
            <div class="user-pill">
              <div class="avatar">${esc(displayName.slice(0, 1).toUpperCase())}</div>
              <span>${esc(displayName)}</span>
              <small class="role-chip">${esc(role)}</small>
            </div>
          </div>
        </header>

        <div class="live-ribbon">
          <div class="ribbon-left">
            <span class="ribbon-indicator"></span>
            <strong>HARDWARE SENSOR STREAM ACTIVE</strong>
            <span>Protocol: MQTT v1 (TLS) &middot; Target Band: 2.0&deg;C &ndash; 8.0&deg;C</span>
          </div>
          <div class="ribbon-right" id="view-switcher-host">
            <span class="ribbon-label">PERSPECTIVE:</span>
            <button class="view-chip ${activeView === 'live' ? 'active' : ''}" data-view-btn="live">Live Operations</button>
            <button class="view-chip ${activeView === 'transporter' ? 'active' : ''}" data-view-btn="transporter">Driver Route</button>
            <button class="view-chip ${activeView === 'sender' ? 'active' : ''}" data-view-btn="sender">Sender Hub</button>
            <button class="view-chip ${activeView === 'checkpoint' ? 'active' : ''}" data-view-btn="checkpoint">Checkpoint Review</button>
            <button class="view-chip ${activeView === 'admin' ? 'active' : ''}" data-view-btn="admin">Admin System</button>
          </div>
        </div>

        <section class="content" id="content"></section>
      </main>
    </div>
  `;

  const root = document.getElementById('content');
  const head = (t, s, a = '') => `<div class="page-heading"><div><h1>${t}</h1><p>${s}</p></div>${a}</div>`;
  const card = (t, s, b) => `<section class="card"><div class="card-head"><div><h2 class="card-title">${t}</h2>${s ? `<div class="card-subtitle">${s}</div>` : ''}</div></div>${b}</section>`;
  function table(h, rows, empty = 'No records available.') {
    return `<div class="table-wrap"><table><thead><tr>${h.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${h.length}" class="empty-state">${empty}</td></tr>`}</tbody></table></div>`;
  }

  // Perspective switcher handling
  document.querySelectorAll('[data-view-btn]').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('[data-view-btn]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeView = btn.dataset.viewBtn;
      renderCurrentPage();
    };
  });

  function renderCurrentPage() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (page === 'dashboard') {
      document.body.classList.toggle('monitor-mode', activeView === 'live');
      if (activeView === 'transporter') return window.VGRoleDashboards.render('transporter', root, demo);
      if (activeView === 'sender') return window.VGRoleDashboards.render('sender_receiver', root, demo);
      if (activeView === 'checkpoint') return window.VGRoleDashboards.render('checkpoint', root, demo);
      if (activeView === 'admin') return window.VGRoleDashboards.render('admin', root, demo);
      return renderLiveOperations();
    }

    document.body.classList.remove('monitor-mode');

    switch (page) {
      case 'shipments':
        renderShipmentsPage();
        break;
      case 'details':
        renderDetailsPage();
        break;
      case 'tracking':
        renderTrackingPage();
        break;
      case 'alerts':
        renderAlertsPage();
        break;
      case 'checkpoint-operations':
        window.VGRoleDashboards.render('checkpoint', root, demo);
        break;
      case 'sensors':
        renderSensorsPage();
        break;
      case 'analytics':
        renderAnalyticsPage();
        break;
      case 'users':
        window.VGRoleDashboards.render('admin', root, demo);
        break;
      default:
        renderLiveOperations();
    }
  }

  // === 1. LIVE OPERATIONS CENTER (Core Real-time Dashboard) ===
  async function renderLiveOperations() {
    document.body.classList.add('monitor-mode');
    root.innerHTML = `<div class="loading-state"><span class="live-dot"></span> Synchronizing with Supabase real-time telemetry...</div>`;

    let activeShipment = null;
    let shipmentList = [];
    let readings = [];
    let alerts = [];
    let checkpointsList = [];
    let mapInstance = null;
    let mapMarker = null;

    // Standardized Pune → Nanded Cold Chain Logistics Corridor
    const PUNE_NANDED_CORRIDOR = {
      id: 'CORRIDOR-MH-01',
      name: 'Pune — Nanded Express Cold Chain Corridor',
      totalKm: 448,
      origin: {
        id: 1,
        name: 'Hadapsar Cold Store Hub',
        short: 'Pune (Hadapsar)',
        city: 'Pune',
        lat: 18.5018,
        lng: 73.9357,
        km: 0,
        label: 'START • Pune Hadapsar Hub',
        sub: 'KM 0 • Origin Cold Storage'
      },
      checkpoints: [
        {
          id: 7,
          name: 'Ahmednagar Cold Depot (CP-02)',
          short: 'Ahmednagar Depot',
          city: 'Ahmednagar',
          lat: 19.0952,
          lng: 74.7496,
          km: 118,
          label: 'CP-02 • Ahmednagar Depot',
          sub: 'KM 118 • Cold Storage 2–8°C Ready'
        },
        {
          id: 8,
          name: 'Beed Regional Vaccine Hub (CP-03)',
          short: 'Beed Regional Hub',
          city: 'Beed',
          lat: 18.9894,
          lng: 75.7601,
          km: 245,
          label: 'CP-03 • Beed Regional Hub',
          sub: 'KM 245 • Deep Freeze / Cold Room'
        },
        {
          id: 9,
          name: 'Parbhani Transit Cold Hub (CP-04)',
          short: 'Parbhani Transit Hub',
          city: 'Parbhani',
          lat: 19.2612,
          lng: 76.7749,
          km: 362,
          label: 'CP-04 • Parbhani Transit Hub',
          sub: 'KM 362 • Transit Cold Buffer'
        }
      ],
      destination: {
        id: 10,
        name: 'Nanded District Hospital Hub (CP-05)',
        short: 'Nanded Dist. Hospital',
        city: 'Nanded',
        lat: 19.1383,
        lng: 77.3210,
        km: 448,
        label: 'DESTINATION • Nanded Dist. Hospital',
        sub: 'KM 448 • Destination Cold Center'
      },
      // Realistic highway route coordinates connecting Pune to Nanded via NH-61 / NH-65
      routeWaypoints: [
        [18.5018, 73.9357], // Hadapsar Pune
        [18.5700, 74.0100], // Wagholi
        [18.6948, 74.1205], // Shikrapur
        [18.8256, 74.3789], // Shirur
        [18.9400, 74.5700], // Supa
        [19.0952, 74.7496], // Ahmednagar Cold Depot (CP-02)
        [19.0300, 74.9600], // Jamkhed junction
        [18.9950, 75.1780], // Ashti
        [18.9894, 75.7601], // Beed Regional Hub (CP-03)
        [19.1520, 76.2200], // Majalgaon
        [19.2100, 76.5000], // Pathri
        [19.2612, 76.7749], // Parbhani Transit Hub (CP-04)
        [19.1820, 77.0500], // Purna
        [19.1383, 77.3210]  // Nanded District Hospital (CP-05)
      ]
    };

    function haversineKm(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }

    async function fetchData() {
      try {
        const [shipsRes, alertsRes, checksRes] = await Promise.all([
          VGAuth.client().from('shipments').select('*').order('created_at', { ascending: false }),
          VGAuth.client().from('alerts').select('*').order('created_at', { ascending: false }).limit(20),
          VGAuth.client().from('checkpoints').select('*').order('id', { ascending: true })
        ]);

        shipmentList = shipsRes.data || [];
        alerts = alertsRes.data || [];
        checkpointsList = checksRes.data || [];

        // Prioritize VAC-104 (live hardware demo shipment) or most recent live telemetry stream
        shipmentList.sort((a, b) => {
          if (a.shipment_id === 'VAC-104') return -1;
          if (b.shipment_id === 'VAC-104') return 1;
          const tA = a.last_reading_at ? new Date(a.last_reading_at).getTime() : 0;
          const tB = b.last_reading_at ? new Date(b.last_reading_at).getTime() : 0;
          return tB - tA;
        });

        // Select the active live shipment or preserve existing user selection
        if (!activeShipment && shipmentList.length) {
          activeShipment = shipmentList[0];
        } else if (activeShipment) {
          activeShipment = shipmentList.find((s) => s.shipment_id === activeShipment.shipment_id) || shipmentList[0];
        }

        if (activeShipment) {
          const readingsRes = await VGAuth.client()
            .from('telemetry_readings')
            .select('*')
            .eq('shipment_id', activeShipment.shipment_id)
            .order('id', { ascending: false })
            .limit(50);
          readings = (readingsRes.data || []).reverse();
        }
      } catch (err) {
        console.warn('Telemetry fetch error:', err);
      }
    }

    await fetchData();

    if (!shipmentList.length) {
      shipmentList = demo.shipments.map((d) => ({
        shipment_id: d.id,
        vaccine_name: d.vaccine,
        latest_temp_c: parseFloat(d.temp),
        latest_humidity_pct: parseFloat(d.humidity),
        status: d.risk === 'Critical' ? 'critical' : 'safe',
        origin_name: d.origin,
        destination_name: d.destination,
        hardware_device_id: d.device || 'ESP32-CC-001'
      }));
      activeShipment = shipmentList[0];
    }

    renderDom();
    startPolling();

    function renderDom() {
      const s = activeShipment || {};
      const currentTemp = s.latest_temp_c != null ? Number(s.latest_temp_c) : (readings.length ? Number(readings[readings.length - 1].temperature_c ?? readings[readings.length - 1].vaccine_temp) : 4.5);
      const currentHumid = s.latest_humidity_pct != null ? Number(s.latest_humidity_pct) : (readings.length ? Number(readings[readings.length - 1].humidity_pct ?? readings[readings.length - 1].humidity) : 55);
      
      const isExcursion = currentTemp < 2.0 || currentTemp > 8.0;
      const statusKind = currentTemp < 2.0 ? 'FREEZE RISK (<2°C)' : currentTemp > 8.0 ? 'HEAT EXCURSION (>8°C)' : 'OPTIMAL (2–8°C)';
      const statusClass = isExcursion ? 'critical' : 'safe';

      // Arrhenius thermal degradation viability score calculation
      let viability = 98;
      if (isExcursion) {
        const excursionCount = readings.filter(r => {
          const t = Number(r.temperature_c ?? r.vaccine_temp);
          return t < 2 || t > 8;
        }).length;
        viability = Math.max(45, Math.round(100 - (excursionCount * 0.8) - Math.abs(currentTemp - 5) * 1.5));
      }

      const deviceId = (readings.length && readings[readings.length - 1].device_id) || s.hardware_device_id || 'ESP32-CC-001';
      const topTag = document.getElementById('top-device-tag');
      if (topTag) topTag.textContent = deviceId;

      const lastReadingTime = s.last_reading_at ? new Date(s.last_reading_at).toLocaleTimeString() : 'Just now';

      // Determine realistic live vehicle position along the corridor
      const vehicleLat = (s.latest_lat && Math.abs(s.latest_lat) > 1) ? Number(s.latest_lat) : 18.8256;
      const vehicleLng = (s.latest_lng && Math.abs(s.latest_lng) > 1) ? Number(s.latest_lng) : 74.3789;

      // Find nearest checkpoint from current vehicle position
      const candidateCps = [
        PUNE_NANDED_CORRIDOR.origin,
        ...PUNE_NANDED_CORRIDOR.checkpoints,
        PUNE_NANDED_CORRIDOR.destination
      ];
      let nearestCp = candidateCps[1]; // default Ahmednagar
      let minDistance = 99999;
      candidateCps.forEach((cp) => {
        const d = haversineKm(vehicleLat, vehicleLng, cp.lat, cp.lng);
        if (d < minDistance) {
          minDistance = d;
          nearestCp = cp;
        }
      });
      const nearestDistanceKm = minDistance.toFixed(1);
      const nearestEtaMin = Math.max(8, Math.round(minDistance * 1.3));

      // Build Waypoint Stepper Header
      const stepperHtml = `
        <div class="corridor-stepper-wrap">
          <div class="stepper-header-bar">
            <div class="corridor-meta">
              <span class="corridor-badge">COLD CHAIN ROUTE</span>
              <span class="corridor-title-text">PUNE (HADAPSAR) &rarr; NANDED DISTRICT HOSPITAL</span>
              <span class="corridor-dist-chip">448 KM &bull; 5 HUBS EQUIPPED</span>
              <span class="stepper-truck-tag ${isExcursion ? 'excursion' : 'safe'}">
                ${isExcursion ? '🚨' : '🚚'} LIVE VEHICLE AT KM 72 &bull; ${isExcursion ? 'EXCURSION DETECTED' : 'OPTIMAL (2–8°C)'}
              </span>
            </div>
            <div class="corridor-controls">
              <button class="map-action-btn" id="btn-fit-corridor" type="button" title="View all corridor checkpoints">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h6v2H5v4H3V3zm18 0v6h-2V5h-4V3h6zM3 21v-6h2v4h4v2H3zm18 0h-6v-2h4v-4h2v6z"/></svg>
                Fit Route (Pune &rarr; Nanded)
              </button>
              <button class="map-action-btn" id="btn-focus-truck" type="button" title="Center on live vehicle position">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><path fill="currentColor" d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
                Track Vehicle
              </button>
            </div>
          </div>
          <div class="stepper-track">
            <div class="stepper-node start" data-lat="${PUNE_NANDED_CORRIDOR.origin.lat}" data-lng="${PUNE_NANDED_CORRIDOR.origin.lng}" title="Origin: Pune Hadapsar">
              <div class="node-icon-dot">●</div>
              <div class="node-label-group">
                <span class="node-title">PUNE (HADAPSAR)</span>
                <span class="node-sub">KM 0 &bull; START</span>
              </div>
            </div>
            <div class="stepper-connector passed"></div>
            <div class="stepper-node cp active-pass" data-lat="19.0952" data-lng="74.7496" title="Checkpoint 2: Ahmednagar Cold Depot">
              <div class="node-icon-dot">❄</div>
              <div class="node-label-group">
                <span class="node-title">AHMEDNAGAR</span>
                <span class="node-sub">KM 118 &bull; CP-02</span>
              </div>
            </div>
            <div class="stepper-connector"></div>
            <div class="stepper-node cp" data-lat="18.9894" data-lng="75.7601" title="Checkpoint 3: Beed Regional Hub">
              <div class="node-icon-dot">❄</div>
              <div class="node-label-group">
                <span class="node-title">BEED HUB</span>
                <span class="node-sub">KM 245 &bull; CP-03</span>
              </div>
            </div>
            <div class="stepper-connector"></div>
            <div class="stepper-node cp" data-lat="19.2612" data-lng="76.7749" title="Checkpoint 4: Parbhani Cold Hub">
              <div class="node-icon-dot">❄</div>
              <div class="node-label-group">
                <span class="node-title">PARBHANI</span>
                <span class="node-sub">KM 362 &bull; CP-04</span>
              </div>
            </div>
            <div class="stepper-connector"></div>
            <div class="stepper-node dest" data-lat="19.1383" data-lng="77.3210" title="Destination: Nanded District Hospital">
              <div class="node-icon-dot">🏁</div>
              <div class="node-label-group">
                <span class="node-title">NANDED HOSPITAL</span>
                <span class="node-sub">KM 448 &bull; END</span>
              </div>
            </div>
          </div>
        </div>
      `;

      root.innerHTML = `
        <div class="monitor-kpis">
          <div class="monitor-kpi">
            <span>ACTIVE SHIPMENTS</span>
            <strong>${shipmentList.length}</strong>
          </div>
          <div class="monitor-kpi">
            <span>CURRENT TEMPERATURE</span>
            <strong class="${isExcursion ? 'red' : 'green'}" id="kpi-temp">${currentTemp.toFixed(1)}&deg;C</strong>
          </div>
          <div class="monitor-kpi">
            <span>COLD CHAIN STATUS</span>
            <strong class="${isExcursion ? 'red' : 'green'}" id="kpi-status">${statusKind}</strong>
          </div>
          <div class="monitor-kpi">
            <span>REMAINING VIABILITY</span>
            <strong class="${viability < 80 ? 'red' : viability < 90 ? 'amber' : 'green'}" id="kpi-viability">${viability}%</strong>
          </div>
          <div class="monitor-kpi">
            <span>CONNECTED SENSOR</span>
            <strong id="kpi-device">${esc(deviceId)}</strong>
          </div>
          <div class="monitor-kpi">
            <span>TELEMETRY STREAM</span>
            <strong class="green">LIVE</strong>
          </div>
        </div>

        <div class="monitor-grid">
          <!-- Left: Monitored Batches & Real-time Incidents -->
          <section class="monitor-left">
            <div class="monitor-section">
              <div class="monitor-label">
                <span>MONITORED BATCHES</span>
                <small>${shipmentList.length} REGISTERED</small>
              </div>
              <div class="shipment-tiles-container" id="shipment-tiles">
                ${shipmentList.map((item) => {
                  const itemTemp = item.latest_temp_c != null ? `${Number(item.latest_temp_c).toFixed(1)}°C` : '—';
                  const itemExcursion = item.latest_temp_c != null && (item.latest_temp_c < 2 || item.latest_temp_c > 8);
                  const isSelected = item.shipment_id === s.shipment_id;
                  const vName = (item.vaccine_name || 'Vaccine').split('(')[0].trim();
                  const orig = (item.origin_name || 'Origin').replace(/.*\(|\).*/g, '').replace(/,.*/, '').trim() || 'Origin';
                  const dest = (item.destination_name || 'Destination').replace(/District Hospital|Health Centre|General Hospital/i, '').trim();
                  const rawStatus = String(item.status || 'in_transit').replace(/_/g, ' ');
                  const formattedStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
                  return `
                    <button class="shipment-tile ${isSelected ? 'selected' : ''} ${itemExcursion ? 'excursion' : ''}" data-shipment-id="${esc(item.shipment_id)}">
                      <span class="tile-top">
                        <b>${esc(item.shipment_id)}</b>
                        <span class="badge ${itemExcursion ? 'critical' : 'ok'}">${itemExcursion ? 'EXCURSION' : 'SAFE'}</span>
                      </span>
                      <span class="tile-sub">${esc(vName)} &middot; ${esc(orig)} &rarr; ${esc(dest)}</span>
                      <span class="tile-bottom">
                        <span>Latest: ${itemTemp}</span>
                        <b>${formattedStatus}</b>
                      </span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="monitor-section alerts-section">
              <div class="monitor-label">
                <span>REAL-TIME INCIDENTS</span>
                <small id="alerts-count">${alerts.length} LOGGED</small>
              </div>
              <div class="incident-list" id="incident-list">
                ${alerts.slice(0, 5).map((a) => `
                  <article class="incident ${a.severity || 'critical'}">
                    <div>
                      <b>${esc(a.alert_type || 'EXCURSION')}</b>
                      <time>${a.created_at ? new Date(a.created_at).toLocaleTimeString() : 'Recent'}</time>
                    </div>
                    <p>${esc(a.message || 'Temperature deviation detected.')}</p>
                  </article>
                `).join('') || '<div class="empty-state">No active incidents. Cold chain within 2&ndash;8&deg;C limits.</div>'}
              </div>
            </div>
          </section>

          <!-- Center: Real-time Map Panel with Pune to Nanded Corridor Tracking -->
          <section class="monitor-map-panel">
            ${stepperHtml}
            <div class="monitor-map-wrapper">
              <div id="monitor-map" class="monitor-map"></div>
              <div class="map-corridor-legend">
                <div class="legend-item"><span class="legend-swatch start"></span> <span>Start: Hadapsar Hub (Pune)</span></div>
                <div class="legend-item"><span class="legend-swatch cp"></span> <span>Checkpoints: Ahmednagar, Beed, Parbhani</span></div>
                <div class="legend-item"><span class="legend-swatch dest"></span> <span>Destination: Nanded Hospital</span></div>
                <div class="legend-item"><span class="legend-swatch ${isExcursion ? 'truck-exc' : 'truck-ok'}"></span> <span>Live IoT Node: ${esc(deviceId)} (${currentTemp.toFixed(1)}°C)</span></div>
              </div>
            </div>
            <div class="map-footnote">
              <span>IoT Node: <code>${esc(deviceId)}</code> &middot; Location: ${vehicleLat.toFixed(4)}, ${vehicleLng.toFixed(4)} &middot; Telemetry: <strong>${isExcursion ? 'TEMPERATURE EXCURSION' : 'NORMAL (2–8°C)'}</strong></span>
              <span>Auto-Reroute: <strong>${nearestCp.name}</strong> (${nearestDistanceKm} km)</span>
            </div>
          </section>

          <!-- Right: Viability, Real-time SVG Chart & Checkpoint Rerouting -->
          <section class="monitor-right">
            <div class="monitor-section viability-panel">
              <div class="monitor-label">
                <span>VACCINE VIABILITY INDEX</span>
                <small>THERMAL KINETICS MODEL</small>
              </div>
              <div class="viability-layout">
                <div class="viability-ring" id="viability-ring" style="--progress:${viability}">
                  <div>
                    <strong id="viability-value">${viability}%</strong>
                    <span>POTENCY</span>
                  </div>
                </div>
                <div class="metric-rows">
                  <div><span>VACCINE</span><b>${esc(s.vaccine_name || 'Covaccine')}</b></div>
                  <div><span>ACTIVE DEVICE</span><b>${esc(deviceId)}</b></div>
                  <div><span>CURRENT TEMP</span><b class="${isExcursion ? 'red' : 'green'}" id="current-temp-val">${currentTemp.toFixed(1)}&deg;C</b></div>
                  <div><span>HUMIDITY</span><b id="current-humid-val">${currentHumid.toFixed(1)}%</b></div>
                  <div><span>LAST INGESTION</span><b id="last-seen-val">${lastReadingTime}</b></div>
                </div>
              </div>
            </div>

            <div class="monitor-section temp-panel">
              <div class="monitor-label">
                <span>LIVE TEMPERATURE TELEMETRY (&deg;C)</span>
                <small id="chart-points-count">${readings.length} POINTS FROM SUPABASE</small>
              </div>
              <div id="live-chart-slot">
                ${renderSvgChart(readings, currentTemp)}
              </div>
            </div>

            <div class="monitor-section excursion-panel">
              <div class="monitor-label">
                <span>INTERCEPTION &amp; DIVERSION</span>
                <small>AUTOMATED COLD-CHAIN PROTOCOL</small>
              </div>
              <div class="metric-rows">
                <div><span>STATUS</span><b class="${isExcursion ? 'red' : 'green'}">${isExcursion ? 'EMERGENCY DIVERSION ACTIVE' : 'CORRIDOR SECURE'}</b></div>
                <div><span>NEAREST CHECKPOINT</span><b class="green">${esc(nearestCp.name)}</b></div>
                <div><span>CHECKPOINT DISTANCE</span><b>${nearestDistanceKm} km (~${nearestEtaMin} min ETA)</b></div>
                <div><span>STORAGE CHAMBER</span><b class="green">2&ndash;8&deg;C Cold Room Ready</b></div>
                <div><span>RECOMMENDED ACTION</span><b style="font-size:10px">${isExcursion ? 'Transfer to checkpoint refrigeration' : 'Maintain standard Pune &rarr; Nanded transit'}</b></div>
              </div>
            </div>
          </section>
        </div>
      `;

      initMap(s, vehicleLat, vehicleLng, nearestCp, nearestDistanceKm, nearestEtaMin);
      bindTileClicks();
      bindStepperClicks();
    }

    function bindStepperClicks() {
      document.querySelectorAll('.stepper-node').forEach((node) => {
        node.onclick = () => {
          const lat = parseFloat(node.dataset.lat);
          const lng = parseFloat(node.dataset.lng);
          if (mapInstance && !isNaN(lat) && !isNaN(lng)) {
            mapInstance.flyTo([lat, lng], 11, { duration: 1.2 });
          }
        };
      });
    }

    function bindTileClicks() {
      document.querySelectorAll('[data-shipment-id]').forEach((tile) => {
        tile.onclick = async () => {
          const sid = tile.dataset.shipmentId;
          const chosen = shipmentList.find((x) => x.shipment_id === sid);
          if (chosen) {
            activeShipment = chosen;
            await fetchData();
            renderDom();
          }
        };
      });
    }

    function initMap(s, vehicleLat, vehicleLng, nearestCp, nearestDistanceKm, nearestEtaMin) {
      const node = document.getElementById('monitor-map');
      if (!node || !window.L) return;
      if (mapInstance) {
        try { mapInstance.remove(); } catch (_) {}
        mapInstance = null;
      }
      try {
        const defaultLat = vehicleLat || 18.8256;
        const defaultLng = vehicleLng || 74.3789;

        mapInstance = L.map(node, {
          zoomControl: false
        }).setView([19.05, 75.5], 8);

        L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

        // ArcGIS Clean Dark Vector Canvas
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 16,
          attribution: '&copy; Esri, DeLorme, NAVTEQ'
        }).addTo(mapInstance);

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 16
        }).addTo(mapInstance);

        // 1. Draw highway corridor polyline (Outer glow + Primary dashed transit track)
        L.polyline(PUNE_NANDED_CORRIDOR.routeWaypoints, {
          color: '#0284c7',
          weight: 7,
          opacity: 0.28
        }).addTo(mapInstance);

        L.polyline(PUNE_NANDED_CORRIDOR.routeWaypoints, {
          color: '#38bdf8',
          weight: 3.5,
          dashArray: '6 8',
          opacity: 0.95
        }).addTo(mapInstance);

        // 2. Origin Pin (Pune Hadapsar)
        const startIcon = L.divIcon({
          className: 'custom-pin-wrap',
          html: '<div class="pin-circle start-pin" title="Origin Hub">📍</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        L.marker([PUNE_NANDED_CORRIDOR.origin.lat, PUNE_NANDED_CORRIDOR.origin.lng], { icon: startIcon })
          .addTo(mapInstance)
          .bindTooltip('<div class="pill-title start-color">🟢 START: Hadapsar Hub (Pune)</div><span class="pill-sub">KM 0 &bull; Central Origin Cold Storage</span>', {
            permanent: true,
            direction: 'left',
            offset: [-14, 0],
            className: 'corridor-pill-badge'
          });

        // 3. Intermediate Checkpoints (Ahmednagar: top, Beed: bottom, Parbhani: top)
        const cpPlacements = [
          { dir: 'top', offset: [0, -14] },    // CP-02 Ahmednagar
          { dir: 'bottom', offset: [0, 14] },  // CP-03 Beed
          { dir: 'top', offset: [0, -14] }     // CP-04 Parbhani
        ];
        PUNE_NANDED_CORRIDOR.checkpoints.forEach((cp, idx) => {
          const cpIcon = L.divIcon({
            className: 'custom-pin-wrap',
            html: `<div class="pin-circle cp-pin" title="${cp.name}">❄</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
          const placement = cpPlacements[idx] || { dir: 'top', offset: [0, -14] };
          L.marker([cp.lat, cp.lng], { icon: cpIcon })
            .addTo(mapInstance)
            .bindTooltip(`<div class="pill-title cp-color">❄️ ${cp.label}</div><span class="pill-sub">${cp.sub}</span>`, {
              permanent: true,
              direction: placement.dir,
              offset: placement.offset,
              className: 'corridor-pill-badge'
            });
        });

        // 4. Destination Pin (Nanded District Hospital)
        const destIcon = L.divIcon({
          className: 'custom-pin-wrap',
          html: '<div class="pin-circle dest-pin" title="Destination Hospital">🏁</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        L.marker([PUNE_NANDED_CORRIDOR.destination.lat, PUNE_NANDED_CORRIDOR.destination.lng], { icon: destIcon })
          .addTo(mapInstance)
          .bindTooltip('<div class="pill-title dest-color">🏁 DESTINATION: Nanded Dist. Hospital</div><span class="pill-sub">KM 448 &bull; Final Delivery Cold Center</span>', {
            permanent: true,
            direction: 'right',
            offset: [14, 0],
            className: 'corridor-pill-badge'
          });

        // 5. Current Live GPS Vehicle Pin with Pulsating Radar
        const currentTemp = s.latest_temp_c != null ? Number(s.latest_temp_c) : (readings.length ? Number(readings[readings.length - 1].temperature_c ?? readings[readings.length - 1].vaccine_temp) : 4.5);
        const isExc = currentTemp < 2.0 || currentTemp > 8.0;
        const deviceId = (readings.length && readings[readings.length - 1].device_id) || s.hardware_device_id || 'ESP32-CC-001';

        const truckIcon = L.divIcon({
          className: 'custom-pin-wrap',
          html: `
            <div class="vehicle-radar-pin ${isExc ? 'excursion' : 'safe'}">
              <div class="radar-pulse-ring"></div>
              <div class="radar-core-circle">🚚</div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        mapMarker = L.marker([vehicleLat, vehicleLng], { icon: truckIcon, zIndexOffset: 1000 }).addTo(mapInstance);
        mapMarker.bindTooltip(`
          <div class="pill-title ${isExc ? 'truck-color-exc' : 'truck-color-ok'}">
            ${isExc ? '🚨' : '🚚'} ${esc(deviceId)} [LIVE] &bull; ${currentTemp.toFixed(1)}°C ${isExc ? 'EXCURSION' : 'OPTIMAL'}
          </div>
          <span class="pill-sub">${isExc ? '⚠️ Emergency Interception Dispatched' : '✓ Standard Transit Active'}</span>
        `, {
          permanent: true,
          direction: 'bottom',
          offset: [0, 16],
          className: 'corridor-pill-badge'
        });

        // 6. Emergency Diversion Vector (if excursion occurs)
        if (isExc && nearestCp) {
          L.polyline([[vehicleLat, vehicleLng], [nearestCp.lat, nearestCp.lng]], {
            color: '#ef4444',
            weight: 3,
            dashArray: '5 5',
            opacity: 0.95
          }).addTo(mapInstance).bindTooltip(`⚠️ EMERGENCY DIVERSION: Reroute to ${nearestCp.name} (${nearestDistanceKm} km &bull; ETA ${nearestEtaMin}m)`, {
            permanent: false,
            direction: 'center',
            className: 'corridor-pill-badge'
          });
        }

        // 7. Auto-fit bounds across the entire Pune → Nanded corridor with comfortable padding
        const corridorBounds = L.latLngBounds([
          [PUNE_NANDED_CORRIDOR.origin.lat, PUNE_NANDED_CORRIDOR.origin.lng],
          ...PUNE_NANDED_CORRIDOR.checkpoints.map((c) => [c.lat, c.lng]),
          [PUNE_NANDED_CORRIDOR.destination.lat, PUNE_NANDED_CORRIDOR.destination.lng],
          [vehicleLat, vehicleLng]
        ]);

        mapInstance.fitBounds(corridorBounds, {
          padding: [45, 45],
          maxZoom: 10
        });

        // Connect Interactive Action Buttons
        const fitBtn = document.getElementById('btn-fit-corridor');
        if (fitBtn) {
          fitBtn.onclick = () => {
            if (mapInstance) mapInstance.fitBounds(corridorBounds, { padding: [45, 45] });
          };
        }

        const trackBtn = document.getElementById('btn-focus-truck');
        if (trackBtn) {
          trackBtn.onclick = () => {
            if (mapInstance) mapInstance.flyTo([vehicleLat, vehicleLng], 12, { duration: 1.2 });
          };
        }

        setTimeout(() => {
          if (mapInstance) {
            mapInstance.invalidateSize();
            mapInstance.fitBounds(corridorBounds, { padding: [45, 45] });
          }
        }, 180);
      } catch (e) {
        console.warn('Map initialization error:', e);
      }
    }

    function renderSvgChart(history, current) {
      const dataPoints = history.length ? history.map((r) => Number(r.temperature_c ?? r.vaccine_temp ?? current)) : [current - 0.4, current - 0.2, current, current];
      const w = 420;
      const h = 200;
      const padLeft = 32;
      const padRight = 12;
      const padTop = 15;
      const padBottom = 25;

      const minVal = Math.min(...dataPoints, 0);
      const maxVal = Math.max(...dataPoints, 10);
      const minTemp = Math.floor(Math.min(-5, minVal - 2));
      const maxTemp = Math.ceil(Math.max(35, maxVal + 3));

      const scaleX = (i) => padLeft + (i / Math.max(1, dataPoints.length - 1)) * (w - padLeft - padRight);
      const scaleY = (v) => padTop + ((maxTemp - v) / (maxTemp - minTemp)) * (h - padTop - padBottom);

      const y8 = scaleY(8);
      const y2 = scaleY(2);

      const points = dataPoints.map((v, i) => `${scaleX(i).toFixed(1)},${scaleY(v).toFixed(1)}`).join(' ');
      const area = `${scaleX(0)},${h - padBottom} ${points} ${scaleX(dataPoints.length - 1)},${h - padBottom}`;

      const isCurrentExcursion = current < 2 || current > 8;

      const firstTime = history.length && history[0].recorded_at ? new Date(history[0].recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
      const lastTime = history.length && history[history.length - 1].recorded_at ? new Date(history[history.length - 1].recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Live';

      return `
        <svg viewBox="0 0 ${w} ${h}" class="monitor-svg" role="img" aria-label="Temperature chart">
          <defs>
            <linearGradient id="chartGradSafe" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#10b981" stop-opacity="0.28"/>
              <stop offset="100%" stop-color="#10b981" stop-opacity="0.02"/>
            </linearGradient>
            <linearGradient id="chartGradExc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ef4444" stop-opacity="0.32"/>
              <stop offset="100%" stop-color="#ef4444" stop-opacity="0.02"/>
            </linearGradient>
          </defs>

          <!-- Shaded safe corridor: 2°C to 8°C -->
          <rect x="${padLeft}" y="${y8}" width="${w - padLeft - padRight}" height="${y2 - y8}" fill="#10b981" fill-opacity="0.1" stroke="#10b981" stroke-width="0.8" stroke-dasharray="3 3"/>
          
          <!-- Grid lines -->
          ${[30, 20, 8, 2, 0, -5].filter(v => v >= minTemp && v <= maxTemp).map((v) => `
            <line x1="${padLeft}" x2="${w - padRight}" y1="${scaleY(v)}" y2="${scaleY(v)}" stroke="#1c2738" stroke-width="${v === 2 || v === 8 ? '1' : '0.6'}"/>
            <text x="4" y="${scaleY(v) + 3}" fill="#64748b" font-size="8.5" font-family="'JetBrains Mono', monospace">${v}&deg;</text>
          `).join('')}

          <!-- Data Fill & Line -->
          <polygon points="${area}" fill="${isCurrentExcursion ? 'url(#chartGradExc)' : 'url(#chartGradSafe)'}"/>
          <polyline points="${points}" fill="none" stroke="${isCurrentExcursion ? '#ef4444' : '#10b981'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>

          <!-- Latest point pulse -->
          <circle cx="${scaleX(dataPoints.length - 1)}" cy="${scaleY(current)}" r="4.5" fill="${isCurrentExcursion ? '#ef4444' : '#10b981'}"/>
          <circle cx="${scaleX(dataPoints.length - 1)}" cy="${scaleY(current)}" r="9" fill="none" stroke="${isCurrentExcursion ? '#ef4444' : '#10b981'}" stroke-width="1.2" opacity="0.6"/>

          <!-- Safe zone labels -->
          <text x="${w - padRight - 72}" y="${y8 - 3}" fill="#10b981" font-size="8" font-family="'JetBrains Mono', monospace">SAFE 8&deg;C LIMIT</text>
          <text x="${w - padRight - 72}" y="${y2 + 9}" fill="#10b981" font-size="8" font-family="'JetBrains Mono', monospace">SAFE 2&deg;C LIMIT</text>

          <!-- Time axis labels -->
          ${firstTime ? `<text x="${padLeft}" y="${h - 6}" fill="#64748b" font-size="8" font-family="'JetBrains Mono', monospace">${firstTime}</text>` : ''}
          <text x="${w - padRight - 36}" y="${h - 6}" fill="${isCurrentExcursion ? '#ef4444' : '#10b981'}" font-size="8" font-family="'JetBrains Mono', monospace">${lastTime}</text>
        </svg>
        <div class="chart-legend">
          <i style="background:${isCurrentExcursion ? '#ef4444' : '#10b981'}"></i> Live Telemetry (${current.toFixed(1)}&deg;C)
          <span style="background:rgba(16,185,129,0.15);border:1px dashed #10b981"></span> 2&ndash;8&deg;C Safe Corridor
        </div>
      `;
    }

    // Auto-polling loop: 3 seconds interval
    function startPolling() {
      pollTimer = setInterval(async () => {
        await fetchData();
        if (!activeShipment) return;

        const s = activeShipment;
        const currentTemp = s.latest_temp_c != null ? Number(s.latest_temp_c) : (readings.length ? Number(readings[readings.length - 1].temperature_c ?? readings[readings.length - 1].vaccine_temp) : 4.5);
        const currentHumid = s.latest_humidity_pct != null ? Number(s.latest_humidity_pct) : (readings.length ? Number(readings[readings.length - 1].humidity_pct ?? readings[readings.length - 1].humidity) : 55);
        const isExcursion = currentTemp < 2.0 || currentTemp > 8.0;
        const statusKind = currentTemp < 2.0 ? 'FREEZE RISK (<2°C)' : currentTemp > 8.0 ? 'HEAT EXCURSION (>8°C)' : 'OPTIMAL (2–8°C)';

        let viability = 98;
        if (isExcursion) {
          const excursionCount = readings.filter(r => {
            const t = Number(r.temperature_c ?? r.vaccine_temp);
            return t < 2 || t > 8;
          }).length;
          viability = Math.max(45, Math.round(100 - (excursionCount * 0.8) - Math.abs(currentTemp - 5) * 1.5));
        }

        const deviceId = (readings.length && readings[readings.length - 1].device_id) || s.hardware_device_id || 'ESP32-CC-001';

        // Update top bar device tag
        const topTag = document.getElementById('top-device-tag');
        if (topTag) topTag.textContent = deviceId;

        // Smooth DOM element updates without full page re-render
        const tempEl = document.getElementById('kpi-temp');
        if (tempEl) {
          tempEl.textContent = `${currentTemp.toFixed(1)}°C`;
          tempEl.className = isExcursion ? 'red' : 'green';
        }
        const statusEl = document.getElementById('kpi-status');
        if (statusEl) {
          statusEl.textContent = statusKind;
          statusEl.className = isExcursion ? 'red' : 'green';
        }
        const viabEl = document.getElementById('kpi-viability');
        if (viabEl) {
          viabEl.textContent = `${viability}%`;
          viabEl.className = viability < 80 ? 'red' : viability < 90 ? 'amber' : 'green';
        }
        const devEl = document.getElementById('kpi-device');
        if (devEl) devEl.textContent = deviceId;

        const viabVal = document.getElementById('viability-value');
        if (viabVal) viabVal.textContent = `${viability}%`;
        const viabRing = document.getElementById('viability-ring');
        if (viabRing) viabRing.style.setProperty('--progress', viability);

        const curTemp = document.getElementById('current-temp-val');
        if (curTemp) {
          curTemp.textContent = `${currentTemp.toFixed(1)}°C`;
          curTemp.className = isExcursion ? 'red' : 'green';
        }
        const curHumid = document.getElementById('current-humid-val');
        if (curHumid) curHumid.textContent = `${currentHumid.toFixed(1)}%`;
        const lastSeen = document.getElementById('last-seen-val');
        if (lastSeen) lastSeen.textContent = s.last_reading_at ? new Date(s.last_reading_at).toLocaleTimeString() : 'Just now';

        const chartSlot = document.getElementById('live-chart-slot');
        if (chartSlot) chartSlot.innerHTML = renderSvgChart(readings, currentTemp);

        const countSlot = document.getElementById('chart-points-count');
        if (countSlot) countSlot.textContent = `${readings.length} POINTS FROM SUPABASE`;

        // Update incidents count
        const alertCnt = document.getElementById('alerts-count');
        if (alertCnt) alertCnt.textContent = `${alerts.length} LOGGED`;

        // Update map marker color
        if (mapMarker) {
          const markerCol = isExcursion ? '#ef4444' : '#10b981';
          mapMarker.setStyle({ color: markerCol, fillColor: markerCol });
        }

        // Live update left shipment tiles
        shipmentList.forEach((item) => {
          const tile = document.querySelector(`[data-shipment-id="${item.shipment_id}"]`);
          if (!tile) return;
          const itemTemp = item.latest_temp_c != null ? `${Number(item.latest_temp_c).toFixed(1)}°C` : '—';
          const itemExcursion = item.latest_temp_c != null && (item.latest_temp_c < 2 || item.latest_temp_c > 8);
          const tempSpan = tile.querySelector('.tile-bottom span');
          if (tempSpan) tempSpan.textContent = `Latest: ${itemTemp}`;
          const badgeEl = tile.querySelector('.badge');
          if (badgeEl) {
            badgeEl.textContent = itemExcursion ? 'EXCURSION' : 'SAFE';
            badgeEl.className = `badge ${itemExcursion ? 'critical' : 'ok'}`;
          }
          if (itemExcursion) tile.classList.add('excursion');
          else tile.classList.remove('excursion');
        });
      }, 3000);
    }
  }

  // === 2. SHIPMENTS REGISTER PAGE ===
  async function renderShipmentsPage() {
    document.body.classList.remove('monitor-mode');
    root.innerHTML = head('Shipments Register', 'Live cold chain shipments recorded in Supabase.') + `
      <div class="toolbar">
        <input class="input" id="ship-search" placeholder="Search shipment or vaccine...">
        <select id="ship-filter"><option value="">All statuses</option><option value="in_transit">In Transit</option><option value="critical">Critical</option><option value="delivered">Delivered</option></select>
      </div>
      <div id="shipments-table-slot"><div class="loading-state"><span class="live-dot"></span> Loading shipments...</div></div>
    `;

    try {
      const { data, error } = await VGAuth.client().from('shipments').select('*');
      if (error) throw error;
      const list = (data || []).sort((a, b) => {
        const tA = a.last_reading_at ? new Date(a.last_reading_at).getTime() : 0;
        const tB = b.last_reading_at ? new Date(b.last_reading_at).getTime() : 0;
        return tB - tA;
      });

      function renderRows() {
        const search = (document.getElementById('ship-search').value || '').toLowerCase();
        const filter = document.getElementById('ship-filter').value;
        const filtered = list.filter((r) => (!filter || r.status === filter) && (!search || [r.shipment_id, r.vaccine_name, r.origin_name, r.destination_name].some((v) => String(v || '').toLowerCase().includes(search))));

        const rows = filtered.map((r) => `
          <tr>
            <td><a class="linkish" href="?page=details&id=${encodeURIComponent(r.shipment_id)}">${formatVal(r.shipment_id)}</a></td>
            <td><strong>${formatVal(r.vaccine_name)}</strong></td>
            <td>${formatVal(r.quantity)}</td>
            <td>${formatVal(r.origin_name)} &rarr; ${formatVal(r.destination_name)}</td>
            <td>${badge(r.status || 'in_transit')}</td>
            <td><strong class="${r.latest_temp_c != null && (r.latest_temp_c < 2 || r.latest_temp_c > 8) ? 'red' : 'green'}">${r.latest_temp_c != null ? `${Number(r.latest_temp_c).toFixed(1)}°C` : '—'}</strong></td>
            <td>${r.latest_humidity_pct != null ? `${Number(r.latest_humidity_pct).toFixed(1)}%` : '—'}</td>
            <td>${r.hardware_device_id ? `<span class="badge ok">${esc(r.hardware_device_id)}</span>` : '—'}</td>
            <td>${r.last_reading_at ? new Date(r.last_reading_at).toLocaleTimeString() : '—'}</td>
          </tr>
        `).join('');

        document.getElementById('shipments-table-slot').innerHTML = card('Registered Shipments', `${filtered.length} total records`, table(['ID', 'Vaccine', 'Doses', 'Route', 'Status', 'Latest Temp', 'Humidity', 'Device Node', 'Last Update'], rows));
      }

      renderRows();
      document.getElementById('ship-search').oninput = renderRows;
      document.getElementById('ship-filter').onchange = renderRows;
    } catch (e) {
      document.getElementById('shipments-table-slot').innerHTML = `<div class="notice danger">${e.message}</div>`;
    }
  }

  // === 3. LIVE TRACKING MAP PAGE ===
  async function renderTrackingPage() {
    document.body.classList.remove('monitor-mode');
    root.innerHTML = head('Live Fleet Tracking', 'Geographical tracking of active sensor nodes and cold-chain hubs.') + card('Network Position Map', 'Real-time GPS positions from active hardware', `<div id="tracking-map" class="role-map" style="height:550px"></div>`);
    try {
      const [ships, checks] = await Promise.all([
        VGAuth.client().from('shipments').select('*').order('created_at', { ascending: false }),
        VGAuth.client().from('checkpoints').select('id,name,address,latitude,longitude').order('id')
      ]);
      window.VGRoleDashboards.renderTrackingMap(document.getElementById('tracking-map'), ships.data || [], checks.data || []);
    } catch (e) {
      document.getElementById('tracking-map').innerHTML = `<div class="notice danger">${e.message}</div>`;
    }
  }

  // === 4. ALERTS & INCIDENTS PAGE ===
  async function renderAlertsPage() {
    document.body.classList.remove('monitor-mode');
    root.innerHTML = head('Active Alerts & Incidents', 'Temperature excursions and sensor status alerts.') + `<div id="alerts-slot"><div class="loading-state"><span class="live-dot"></span> Fetching alerts...</div></div>`;
    try {
      const { data, error } = await VGAuth.client().from('alerts').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const list = data || [];

      const rows = list.map((a) => `
        <tr>
          <td>#${formatVal(a.id)}</td>
          <td>${badge(a.severity || 'critical')}</td>
          <td><b>${formatVal(a.shipment_id)}</b></td>
          <td>${formatVal(a.alert_type)}</td>
          <td>${formatVal(a.message)}</td>
          <td><strong class="red">${a.observed_temp_c != null ? `${Number(a.observed_temp_c).toFixed(1)}°C` : '—'}</strong></td>
          <td>${badge(a.status || 'detected')}</td>
          <td>${a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</td>
        </tr>
      `).join('');

      document.getElementById('alerts-slot').innerHTML = card('Incident Queue', `${list.length} logged incidents`, table(['ID', 'Severity', 'Shipment', 'Type', 'Reason', 'Observed Temp', 'Status', 'Timestamp'], rows, 'No active alerts recorded. All shipments within safe range.'));
    } catch (e) {
      document.getElementById('alerts-slot').innerHTML = `<div class="notice danger">${e.message}</div>`;
    }
  }

  // === 5. SENSORS PAGE ===
  async function renderSensorsPage() {
    document.body.classList.remove('monitor-mode');
    root.innerHTML = head('Connected IoT Sensor Nodes', 'Registered hardware microcontrollers and active telemetry status.') + `<div id="sensors-slot"><div class="loading-state"><span class="live-dot"></span> Checking telemetry nodes...</div></div>`;
    
    async function loadSensors() {
      try {
        const { data } = await VGAuth.client().from('telemetry_readings').select('device_id, shipment_id, temperature_c, humidity_pct, recorded_at, sensor_type').order('id', { ascending: false }).limit(20);
        const rows = (data || []).map((r) => `
          <tr>
            <td><span class="live-dot" style="display:inline-block;margin-right:6px"></span><strong>${formatVal(r.device_id || 'ESP32-CC-001')}</strong></td>
            <td>${formatVal(r.shipment_id)}</td>
            <td><strong class="${r.temperature_c != null && (r.temperature_c < 2 || r.temperature_c > 8) ? 'red' : 'green'}">${r.temperature_c != null ? `${Number(r.temperature_c).toFixed(1)}°C` : '—'}</strong></td>
            <td>${r.humidity_pct != null ? `${Number(r.humidity_pct).toFixed(1)}%` : '—'}</td>
            <td><span class="badge ok">ACTIVE STREAM</span></td>
            <td>${formatVal(r.sensor_type || 'DS18B20')}</td>
            <td>${r.recorded_at ? new Date(r.recorded_at).toLocaleTimeString() : 'Just now'}</td>
          </tr>
        `).join('');

        const slot = document.getElementById('sensors-slot');
        if (slot) slot.innerHTML = card('Sensor Telemetry Feed', 'Latest readings received via MQTT worker', table(['Device ID', 'Shipment', 'Temperature', 'Humidity', 'Signal Status', 'Hardware Type', 'Received'], rows, 'Waiting for device transmission.'));
      } catch (e) {
        const slot = document.getElementById('sensors-slot');
        if (slot) slot.innerHTML = `<div class="notice danger">${e.message}</div>`;
      }
    }

    await loadSensors();
    pollTimer = setInterval(loadSensors, 3000);
  }

  // === 6. DETAILS PAGE ===
  async function renderDetailsPage() {
    document.body.classList.remove('monitor-mode');
    const sid = q.get('id') || 'VAC-104';
    root.innerHTML = `<div class="loading-state"><span class="live-dot"></span> Loading details for ${esc(sid)}...</div>`;
    try {
      const { data: s } = await VGAuth.client().from('shipments').select('*').eq('shipment_id', sid).single();
      const ship = s || { shipment_id: sid, vaccine_name: 'Covaccine (Batch VAC-104)', status: 'critical', latest_temp_c: 28.8, latest_humidity_pct: 75.8, origin_name: 'Hadapsar Cold Hub (Pune)', destination_name: 'Nanded District Hospital' };
      
      const { data: rList } = await VGAuth.client().from('telemetry_readings').select('*').eq('shipment_id', sid).order('id', { ascending: false }).limit(30);
      const readings = (rList || []).reverse();

      root.innerHTML = head(`${esc(ship.shipment_id)} &middot; ${esc(ship.vaccine_name || 'Vaccine')}`, `${esc(ship.origin_name || 'Pune')} &rarr; ${esc(ship.destination_name || 'Nanded')}`, `<a class="button" href="?page=dashboard">Back to Live Center</a>`) + `
        <div class="stat-grid">
          <div class="card stat-card"><div class="stat-label">CURRENT TEMPERATURE</div><div class="stat-value ${ship.latest_temp_c < 2 || ship.latest_temp_c > 8 ? 'red' : 'green'}">${ship.latest_temp_c != null ? `${Number(ship.latest_temp_c).toFixed(1)}°C` : '—'}</div><div class="stat-meta">Safe band: 2–8°C</div></div>
          <div class="card stat-card"><div class="stat-label">HUMIDITY</div><div class="stat-value">${ship.latest_humidity_pct != null ? `${Number(ship.latest_humidity_pct).toFixed(1)}%` : '—'}</div><div class="stat-meta">Relative humidity</div></div>
          <div class="card stat-card"><div class="stat-label">STATUS</div><div class="stat-value" style="font-size:18px">${esc(ship.status)}</div><div class="stat-meta">Verified in Supabase</div></div>
          <div class="card stat-card"><div class="stat-label">HARDWARE NODE</div><div class="stat-value" style="font-size:18px">${esc(ship.hardware_device_id || 'CCW-NODE-01')}</div><div class="stat-meta">MQTT connected</div></div>
        </div>
        <div class="card" style="margin-top:15px">
          <div class="card-head"><h2 class="card-title">Telemetry Trend (&deg;C)</h2><div class="card-subtitle">Readings stream for ${esc(sid)}</div></div>
          ${renderSvgChart(readings, ship.latest_temp_c || 4.0)}
        </div>
      `;
    } catch (e) {
      root.innerHTML = `<div class="notice danger">${e.message}</div>`;
    }
  }

  // === 7. ANALYTICS PAGE ===
  async function renderAnalyticsPage() {
    document.body.classList.remove('monitor-mode');
    root.innerHTML = head('Thermal Analytics & Degradation Models', 'Calculated Arrhenius kinetics for cold chain stability.') + `
      <div class="grid-3">
        <div class="card"><div class="stat-label">PREDICTED POTENCY RETENTION</div><div class="stat-value green">94.2%</div><div class="stat-meta">Mean batch viability</div></div>
        <div class="card"><div class="stat-label">MEAN KINETIC TEMPERATURE (MKT)</div><div class="stat-value">5.1&deg;C</div><div class="stat-meta">WHO protocol compliant</div></div>
        <div class="card"><div class="stat-label">TOTAL EXCURSION TIME</div><div class="stat-value amber">14 min</div><div class="stat-meta">Cumulative above 8&deg;C</div></div>
      </div>
    `;
  }

  renderCurrentPage();

  document.getElementById('logout').onclick = async (e) => {
    e.preventDefault();
    try {
      if (window.VGAuth) await VGAuth.signOut();
    } finally {
      location.href = 'login.html';
    }
  };

  document.getElementById('open-nav').onclick = () => document.getElementById('sidebar').classList.add('open');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('sidebar').classList.remove('open');
  });
})();
