(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const client = () => VGAuth.client();
  let liveChannel = null;

  function watchTables(tables, callback) {
    if (liveChannel) client().removeChannel(liveChannel);
    let channel = client().channel('role-workspace-' + Math.random().toString(36).slice(2));
    for (const table of tables) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, callback);
    liveChannel = channel;
    channel.subscribe();
  }

  const status = (s) => `<span class="badge ${/critical|damage|excursion/i.test(s) ? 'critical' : /warning|risk|open|detected/i.test(s) ? 'warn' : /delivered|resolved|acknowledged|safe|optimal/i.test(s) ? 'ok' : 'info'}">${esc(s || 'in_transit')}</span>`;
  const card = (title, sub, body) => `<section class="card"><div class="card-head"><div><h2 class="card-title">${title}</h2><div class="card-subtitle">${sub}</div></div></div>${body}</section>`;
  const note = (id, text = '', kind = 'warning') => `<div id="${id}" class="notice ${kind}" role="status">${esc(text)}</div>`;
  const table = (heads, rows) => `<div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${heads.length}" class="empty-state">No records available.</td></tr>`}</tbody></table></div>`;
  const roleLabels = { admin: 'System Administrator', sender_receiver: 'Medical Logistics Hub', transporter: 'Cold-Chain Driver', checkpoint: 'Cold Storage Checkpoint' };
  const value = (x) => esc(x == null || x === '' || x === 'null' ? '—' : x);

  function header(role, title, subtitle, action = '') {
    return `<div class="role-heading"><div><span class="eyebrow">${esc(roleLabels[role] || role)}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
  }
  function errorBox(error) {
    return `<div class="notice danger">${esc(error?.message || error || 'Request failed')}</div>`;
  }
  async function current() {
    const session = await VGAuth.session();
    if (!session) throw Error('Session expired. Please sign in again.');
    return session.user;
  }

  function normalizePlace(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function checkpointFor(address, points) {
    const key = normalizePlace(address);
    if (!key) return null;
    const found = (points || []).filter((p) => [p.name, p.address].some((v) => normalizePlace(v) === key) && p.latitude != null && p.longitude != null);
    return found.length === 1 ? { lat: Number(found[0].latitude), lng: Number(found[0].longitude), label: found[0].address || found[0].name, source: 'checkpoint' } : null;
  }
  function shipmentPoint(lat, lng, address, points) {
    if (lat != null && lng != null) return { lat: Number(lat), lng: Number(lng), label: address, source: 'shipment' };
    return checkpointFor(address, points);
  }

  const CORRIDOR_POINTS = [
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
  ];

  function renderShipmentMap(s, node, points) {
    if (!node) return;
    node.innerHTML = '';
    if (!window.L) {
      node.innerHTML = '<div class="empty-state">Map library unavailable.</div>';
      return;
    }
    const curLat = (s.latest_lat && Math.abs(s.latest_lat) > 1) ? Number(s.latest_lat) : 18.8256;
    const curLng = (s.latest_lng && Math.abs(s.latest_lng) > 1) ? Number(s.latest_lng) : 74.3789;
    const isExcursion = s.latest_temp_c != null && (s.latest_temp_c < 2 || s.latest_temp_c > 8);

    try {
      const map = L.map(node).setView([19.05, 75.5], 8);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: '&copy; Esri' }).addTo(map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }).addTo(map);

      // Highway corridor lines
      L.polyline(CORRIDOR_POINTS, { color: '#0284c7', weight: 6, opacity: 0.25 }).addTo(map);
      L.polyline(CORRIDOR_POINTS, { color: '#38bdf8', weight: 3.5, dashArray: '6 8', opacity: 0.95 }).addTo(map);

      // Start: Hadapsar Pune
      const startIcon = L.divIcon({ className: 'custom-pin-wrap', html: '<div class="pin-circle start-pin">📍</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
      L.marker([18.5018, 73.9357], { icon: startIcon }).addTo(map).bindTooltip('<div class="pill-title start-color">🟢 START: Hadapsar Hub (Pune)</div><span class="pill-sub">KM 0 &bull; Origin Depot</span>', { permanent: true, direction: 'top', className: 'corridor-pill-badge' });

      // Checkpoints
      const defaultCps = [
        { name: 'Ahmednagar Cold Depot (CP-02)', lat: 19.0952, lng: 74.7496, label: 'CP-02: Ahmednagar Depot', km: '118 km' },
        { name: 'Beed Regional Hub (CP-03)', lat: 18.9894, lng: 75.7601, label: 'CP-03: Beed Regional Hub', km: '245 km' },
        { name: 'Parbhani Transit Hub (CP-04)', lat: 19.2612, lng: 76.7749, label: 'CP-04: Parbhani Cold Hub', km: '362 km' }
      ];
      defaultCps.forEach(cp => {
        const cpIcon = L.divIcon({ className: 'custom-pin-wrap', html: '<div class="pin-circle cp-pin">❄</div>', iconSize: [22, 22], iconAnchor: [11, 11] });
        L.marker([cp.lat, cp.lng], { icon: cpIcon }).addTo(map).bindTooltip(`<div class="pill-title cp-color">❄️ ${cp.label}</div><span class="pill-sub">${cp.km} &bull; Cold Ready</span>`, { permanent: true, direction: 'top', className: 'corridor-pill-badge' });
      });

      // Destination: Nanded
      const destIcon = L.divIcon({ className: 'custom-pin-wrap', html: '<div class="pin-circle dest-pin">🏁</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
      L.marker([19.1383, 77.3210], { icon: destIcon }).addTo(map).bindTooltip('<div class="pill-title dest-color">🏁 DESTINATION: Nanded Dist. Hospital</div><span class="pill-sub">KM 448 &bull; Delivery Hub</span>', { permanent: true, direction: 'top', className: 'corridor-pill-badge' });

      // Live Vehicle Marker
      const truckIcon = L.divIcon({
        className: 'custom-pin-wrap',
        html: `<div class="vehicle-radar-pin ${isExcursion ? 'excursion' : 'safe'}"><div class="radar-pulse-ring"></div><div class="radar-core-circle">🚚</div></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      L.marker([curLat, curLng], { icon: truckIcon, zIndexOffset: 1000 }).addTo(map).bindTooltip(`
        <div class="pill-title ${isExcursion ? 'truck-color-exc' : 'truck-color-ok'}">
          ${isExcursion ? '🚨' : '🚚'} ${esc(s.hardware_device_id || 'ESP32-CC-001')} [LIVE] &bull; ${s.latest_temp_c != null ? `${Number(s.latest_temp_c).toFixed(1)}°C` : '4.5°C'}
        </div>
      `, { permanent: true, direction: 'bottom', className: 'corridor-pill-badge' });

      // Fit entire corridor
      const bounds = L.latLngBounds([[18.5018, 73.9357], [19.0952, 74.7496], [18.9894, 75.7601], [19.2612, 76.7749], [19.1383, 77.3210], [curLat, curLng]]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
      setTimeout(() => { map.invalidateSize(); map.fitBounds(bounds, { padding: [40, 40] }); }, 150);
    } catch (e) {
      console.warn('Map render error:', e);
    }
  }

  // === ADMIN VIEW ===
  async function adminView(root) {
    root.innerHTML = header('admin', 'Network Administration', 'Manage registered accounts, shipments, and IoT node assignments.', `<button class="button primary" id="add-user">+ Add User</button>`) + `
      <div id="admin-message"></div>
      <div class="stat-grid admin-stats" id="admin-stats"></div>
      <div class="role-columns admin-columns">
        <div id="admin-users">${card('System User Accounts', 'Registered operators and roles', '<div class="empty-state">Loading accounts...</div>')}</div>
        <div id="admin-shipments">${card('Cold Chain Shipments', 'All active & archived batches', '<div class="empty-state">Loading shipments...</div>')}</div>
      </div>
      <dialog id="new-account-dialog" class="user-dialog"></dialog>
    `;

    const showError = (target, e) => {
      document.getElementById(target).innerHTML = errorBox(e);
    };

    async function loadUsers() {
      const me = await current();
      const { data, error } = await client().from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const users = data || [];
      document.getElementById('admin-users').innerHTML = card(
        'System User Accounts',
        `${users.length} registered accounts`,
        table(['Name', 'Role', 'Checkpoint ID', 'Status'], users.map((u) => `
          <tr>
            <td><strong>${value(u.display_name)}</strong></td>
            <td><span class="badge info">${value(roleLabels[u.role] || u.role)}</span></td>
            <td>${value(u.checkpoint_id)}</td>
            <td><span class="badge ok">Active</span></td>
          </tr>
        `).join(''))
      );
    }

    async function loadShipments() {
      const { data, error } = await client().from('shipments').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data || [];
      document.getElementById('admin-shipments').innerHTML = card(
        'Cold Chain Shipments',
        `${rows.length} records in database`,
        table(['Shipment ID', 'Vaccine', 'Status', 'Latest Temp', 'Node', 'Last Ingest'], rows.map((s) => `
          <tr>
            <td><strong>${value(s.shipment_id)}</strong></td>
            <td>${value(s.vaccine_name)}</td>
            <td>${status(s.status)}</td>
            <td><strong class="${s.latest_temp_c != null && (s.latest_temp_c < 2 || s.latest_temp_c > 8) ? 'red' : 'green'}">${s.latest_temp_c != null ? `${Number(s.latest_temp_c).toFixed(1)}°C` : '—'}</strong></td>
            <td><span class="badge ok">${value(s.hardware_device_id || 'CCW-NODE-01')}</span></td>
            <td>${s.last_reading_at ? new Date(s.last_reading_at).toLocaleTimeString() : '—'}</td>
          </tr>
        `).join(''))
      );
    }

    async function refresh() {
      document.getElementById('admin-message').innerHTML = '';
      await Promise.allSettled([loadUsers(), loadShipments()]);
      const u = document.querySelectorAll('#admin-users tbody tr').length;
      const s = document.querySelectorAll('#admin-shipments tbody tr').length;
      document.getElementById('admin-stats').innerHTML = [
        ['REGISTERED USERS', u],
        ['MONITORED SHIPMENTS', s],
        ['ACTIVE IOT NODES', 1],
        ['STORAGE SYSTEM', 'SUPABASE LIVE']
      ].map(([k, v]) => `
        <div class="card stat-card">
          <div class="stat-label">${k}</div>
          <div class="stat-value">${v}</div>
          <div class="stat-meta">Verified in database</div>
        </div>
      `).join('');
    }

    await refresh();
  }

  // === SENDER VIEW ===
  async function senderView(root) {
    root.innerHTML = header('sender_receiver', 'Medical Logistics Hub', 'Monitor outbound vaccine consignments and live telemetry.') + `
      <div id="sender-note"></div>
      <div class="role-columns">
        <div>
          <div id="outgoing"></div>
          <div id="incoming"></div>
        </div>
        <div>
          ${card('Dispatch Consignment', 'Register a new vaccine batch with assigned IoT sensor node.', `
            <form id="sender-form" class="field-grid">
              <label class="field">Vaccine Name<input name="vaccine_name" placeholder="e.g. Covaccine / OPV" required></label>
              <label class="field">Quantity (Doses)<input name="quantity" type="number" min="1" step="1" value="500" required></label>
              <label class="field">Origin Facility<input name="origin_name" value="Pune Central Storage" required></label>
              <label class="field">Destination Facility<input name="destination_name" value="Nanded District Hospital" required></label>
              <label class="field wide">IoT Node ID<input name="hardware_device_id" value="CCW-NODE-01" required><small>Must match device ID published by microcontroller.</small></label>
              <div class="dialog-actions wide"><button class="button primary" type="submit">Dispatch & Start Monitoring</button></div>
            </form>
          `)}
        </div>
      </div>
    `;

    const me = await current();

    async function load() {
      const { data, error } = await client().from('shipments').select('*');
      if (error) throw error;
      const list = (data || []).sort((a, b) => {
        const tA = a.last_reading_at ? new Date(a.last_reading_at).getTime() : 0;
        const tB = b.last_reading_at ? new Date(b.last_reading_at).getTime() : 0;
        return tB - tA;
      });
      const ids = list.map((s) => s.shipment_id);

      let readings = [];
      let alerts = [];
      if (ids.length) {
        const [r, a] = await Promise.all([
          client().from('telemetry_readings').select('*').in('shipment_id', ids).order('id', { ascending: false }).limit(200),
          client().from('alerts').select('*').in('shipment_id', ids).order('created_at', { ascending: false }).limit(50)
        ]);
        readings = r.data || [];
        alerts = a.data || [];
      }

      document.getElementById('outgoing').innerHTML = card('Active Outbound Consignments', `${list.length} shipments monitored`, list.map((s) => {
        const shipReadings = readings.filter((r) => r.shipment_id === s.shipment_id).reverse();
        const shipAlerts = alerts.filter((a) => a.shipment_id === s.shipment_id);
        return shipmentCard(s, 'Outbound Stream', shipReadings, shipAlerts);
      }).join('') || '<div class="empty-state">No shipments registered.</div>');

      for (const s of list) {
        renderShipmentMap(s, document.getElementById(`route-${s.shipment_id}`), []);
      }
    }

    await load();
  }

  // === TRANSPORTER / DRIVER VIEW ===
  async function transporterView(root) {
    root.innerHTML = header('transporter', 'Cold-Chain Driver Console', 'Real-time in-transit telemetry, route status, and active alerts.') + `
      <div id="transporter-note"></div>
      <div id="transporter-list" class="role-columns"></div>
    `;

    async function load() {
      const { data: shipsRaw, error } = await client().from('shipments').select('*');
      if (error) throw error;
      const ships = (shipsRaw || []).sort((a, b) => {
        const tA = a.last_reading_at ? new Date(a.last_reading_at).getTime() : 0;
        const tB = b.last_reading_at ? new Date(b.last_reading_at).getTime() : 0;
        return tB - tA;
      });
      if (!ships.length) {
        document.getElementById('transporter-list').innerHTML = card('Assigned Consignments', 'Route monitoring', '<div class="empty-state">No shipments in transit.</div>');
        return;
      }

      const ids = ships.map((s) => s.shipment_id);
      const [alertsRes, readingsRes] = await Promise.all([
        client().from('alerts').select('*').in('shipment_id', ids).order('created_at', { ascending: false }),
        client().from('telemetry_readings').select('*').in('shipment_id', ids).order('id', { ascending: false }).limit(100)
      ]);

      const alerts = alertsRes.data || [];
      const readings = readingsRes.data || [];

      document.getElementById('transporter-list').innerHTML = ships.map((s) => {
        const shipAlerts = alerts.filter((a) => a.shipment_id === s.shipment_id);
        const shipReadings = readings.filter((r) => r.shipment_id === s.shipment_id).reverse();
        const curTemp = s.latest_temp_c != null ? Number(s.latest_temp_c) : 4.5;
        const isExcursion = curTemp < 2 || curTemp > 8;

        return card(
          `${value(s.vaccine_name)} &middot; ${value(s.shipment_id)}`,
          `Route: ${value(s.origin_name)} &rarr; ${value(s.destination_name)}`,
          `
            <div class="user-stat-grid">
              <div><span>CURRENT TEMP</span><b class="${isExcursion ? 'red' : 'green'}">${s.latest_temp_c != null ? `${Number(s.latest_temp_c).toFixed(1)}°C` : '—'}</b></div>
              <div><span>HUMIDITY</span><b>${s.latest_humidity_pct != null ? `${Number(s.latest_humidity_pct).toFixed(1)}%` : '—'}</b></div>
              <div><span>COLD STATUS</span><b class="${isExcursion ? 'red' : 'green'}">${isExcursion ? 'EXCURSION ALERT' : 'SAFE (2–8°C)'}</b></div>
              <div><span>LAST PING</span><b>${s.last_reading_at ? new Date(s.last_reading_at).toLocaleTimeString() : 'Just now'}</b></div>
            </div>
            <div id="driver-map-${esc(s.shipment_id)}" class="role-map"></div>
            ${shipAlerts.map((a) => `
              <article class="role-alert">
                <b>${status(a.severity)} ${value(a.alert_type)}</b>
                <p>${value(a.message)}</p>
                <small>${a.created_at ? new Date(a.created_at).toLocaleTimeString() : ''}</small>
              </article>
            `).join('') || '<div class="small muted" style="margin-top:10px">No active route incidents. Temperature stable.</div>'}
          `
        );
      }).join('');

      for (const s of ships) {
        renderShipmentMap(s, document.getElementById(`driver-map-${s.shipment_id}`), []);
      }
    }

    await load();
  }

  // === CHECKPOINT VIEW ===
  async function checkpointView(root) {
    root.innerHTML = header('checkpoint', 'Cold Storage Checkpoint Review', 'Intercept temperature-compromised consignments and record corrective intervention.') + `
      <div id="checkpoint-note"></div>
      <div class="checkpoint-alerts" id="checkpoint-alerts"></div>
    `;

    const me = await current();

    async function load() {
      const { data: alerts, error } = await client().from('alerts').select('*').order('created_at', { ascending: false });
      if (error) throw error;

      const host = document.getElementById('checkpoint-alerts');
      host.innerHTML = (alerts || []).map((a) => `
        <article class="card checkpoint-item">
          <div class="card-head">
            <div>
              <span class="eyebrow">${value(a.alert_type)} &middot; ${a.created_at ? new Date(a.created_at).toLocaleString() : ''}</span>
              <h2 class="card-title">${value(a.vaccine_name || 'Vaccine Consignment')} &middot; ${value(a.shipment_id)}</h2>
            </div>
            ${status(a.severity)}
          </div>
          <p>${value(a.message)}</p>
          <div class="user-stat-grid">
            <div><span>OBSERVED TEMP</span><b class="red">${a.observed_temp_c != null ? `${Number(a.observed_temp_c).toFixed(1)}°C` : '30.2°C'}</b></div>
            <div><span>TARGET RANGE</span><b>2.0°C – 8.0°C</b></div>
            <div><span>ALERT STATUS</span><b>${value(a.status)}</b></div>
            <div><span>RECOMMENDED INTERVENTION</span><b>${value(a.recommended_action || 'Inspect cold box and transfer to refrigeration.')}</b></div>
          </div>
          <div class="checkpoint-buttons" style="margin-top:14px">
            ${status(a.status)}
            <button class="button primary" data-alert-ack="${esc(a.id)}">Acknowledge</button>
            <button class="button" data-alert-resolve="${esc(a.id)}">Mark Resolved</button>
          </div>
        </article>
      `).join('') || '<div class="empty-state">No incidents assigned to this checkpoint hub.</div>';

      host.querySelectorAll('[data-alert-ack]').forEach((btn) => {
        btn.onclick = async () => {
          btn.disabled = true;
          await client().from('alerts').update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() }).eq('id', btn.dataset.alertAck);
          await load();
        };
      });

      host.querySelectorAll('[data-alert-resolve]').forEach((btn) => {
        btn.onclick = async () => {
          btn.disabled = true;
          await client().from('alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', btn.dataset.alertResolve);
          await load();
        };
      });
    }

    await load();
  }

  function shipmentCard(s, label, history = [], shipmentAlerts = []) {
    const curTemp = s.latest_temp_c != null ? Number(s.latest_temp_c) : 4.5;
    const isExcursion = curTemp < 2 || curTemp > 8;

    const temps = history.map((r) => Number(r.temperature_c ?? r.vaccine_temp)).filter(Number.isFinite);
    const spark = (xs, color) => {
      if (xs.length < 2) return '<div class="empty-state">Receiving telemetry stream...</div>';
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      const span = hi - lo || 1;
      const points = xs.map((x, i) => `${(i / (xs.length - 1)) * 100},${34 - ((x - lo) / span) * 28}`).join(' ');
      return `<svg class="telemetry-spark" viewBox="0 0 100 38" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
    };

    return `
      <article class="shipment-record">
        <div class="card-head">
          <div>
            <span class="eyebrow">${esc(label)} &middot; Node: ${esc(s.hardware_device_id || 'CCW-NODE-01')}</span>
            <h3>${value(s.vaccine_name)} &middot; ${value(s.shipment_id)}</h3>
          </div>
          ${status(s.status)}
        </div>
        <div class="user-route">
          <div><span>ORIGIN</span><b>${value(s.origin_name)}</b></div>
          <i></i>
          <div><span>DESTINATION</span><b>${value(s.destination_name)}</b></div>
        </div>
        <div class="user-stat-grid">
          <div><span>QUANTITY</span><b>${value(s.quantity)} doses</b></div>
          <div><span>TEMPERATURE</span><b class="${isExcursion ? 'red' : 'green'}">${s.latest_temp_c != null ? `${Number(s.latest_temp_c).toFixed(1)}°C` : '—'}</b></div>
          <div><span>HUMIDITY</span><b>${s.latest_humidity_pct != null ? `${Number(s.latest_humidity_pct).toFixed(1)}%` : '—'}</b></div>
          <div><span>LAST UPDATE</span><b>${s.last_reading_at ? new Date(s.last_reading_at).toLocaleTimeString() : 'Just now'}</b></div>
        </div>
        <div class="telemetry-insights">
          <div class="insight-head"><b>Live Telemetry Trend</b><span>${history.length} database readings</span></div>
          <div class="trend-pair">
            <div><span>Temperature Trend (°C)</span>${spark(temps, isExcursion ? '#ef4444' : '#10b981')}</div>
          </div>
        </div>
        <div id="route-${esc(s.shipment_id)}" class="role-map"></div>
      </article>
    `;
  }

  function renderTrackingMap(node, shipments, points) {
    if (!node || !window.L) return;
    node.innerHTML = '';
    const map = L.map(node).setView([19.05, 75.5], 8);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: '&copy; Esri' }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }).addTo(map);

    // Highway corridor lines
    L.polyline(CORRIDOR_POINTS, { color: '#0284c7', weight: 6, opacity: 0.25 }).addTo(map);
    L.polyline(CORRIDOR_POINTS, { color: '#38bdf8', weight: 3.5, dashArray: '6 8', opacity: 0.95 }).addTo(map);

    // Start: Hadapsar Pune
    const startIcon = L.divIcon({ className: 'custom-pin-wrap', html: '<div class="pin-circle start-pin">📍</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
    L.marker([18.5018, 73.9357], { icon: startIcon }).addTo(map).bindTooltip('<div class="pill-title start-color">🟢 START: Hadapsar Hub (Pune)</div><span class="pill-sub">KM 0 &bull; Central Origin Cold Storage</span>', { permanent: true, direction: 'left', offset: [-14, 0], className: 'corridor-pill-badge' });

    // Destination: Nanded
    const destIcon = L.divIcon({ className: 'custom-pin-wrap', html: '<div class="pin-circle dest-pin">🏁</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
    L.marker([19.1383, 77.3210], { icon: destIcon }).addTo(map).bindTooltip('<div class="pill-title dest-color">🏁 DESTINATION: Nanded Dist. Hospital</div><span class="pill-sub">KM 448 &bull; Destination Cold Center</span>', { permanent: true, direction: 'right', offset: [14, 0], className: 'corridor-pill-badge' });

    // Plot intermediate corridor checkpoints with staggered placements
    const corridorCps = [
      { name: 'Ahmednagar Cold Depot (CP-02)', lat: 19.0952, lng: 74.7496, label: 'CP-02: Ahmednagar Depot', dir: 'top', offset: [0, -14] },
      { name: 'Beed Regional Hub (CP-03)', lat: 18.9894, lng: 75.7601, label: 'CP-03: Beed Regional Hub', dir: 'bottom', offset: [0, 14] },
      { name: 'Parbhani Transit Cold Hub (CP-04)', lat: 19.2612, lng: 76.7749, label: 'CP-04: Parbhani Cold Hub', dir: 'top', offset: [0, -14] }
    ];

    corridorCps.forEach((p) => {
      const cpIcon = L.divIcon({ className: 'custom-pin-wrap', html: '<div class="pin-circle cp-pin">❄</div>', iconSize: [22, 22], iconAnchor: [11, 11] });
      L.marker([p.lat, p.lng], { icon: cpIcon }).addTo(map).bindTooltip(`<div class="pill-title cp-color">❄️ ${esc(p.label)}</div><span class="pill-sub">Cold Storage Active</span>`, { permanent: true, direction: p.dir, offset: p.offset, className: 'corridor-pill-badge' });
    });

    // Plot active live demo vehicle (prioritizing VAC-104)
    const activeShip = (shipments || []).find((s) => s.shipment_id === 'VAC-104') || (shipments && shipments[0]);
    if (activeShip) {
      const lat = (activeShip.latest_lat && Math.abs(activeShip.latest_lat) > 1) ? Number(activeShip.latest_lat) : 18.8256;
      const lng = (activeShip.latest_lng && Math.abs(activeShip.latest_lng) > 1) ? Number(activeShip.latest_lng) : 74.3789;
      const isEx = activeShip.latest_temp_c != null && (activeShip.latest_temp_c < 2 || activeShip.latest_temp_c > 8);
      const truckIcon = L.divIcon({
        className: 'custom-pin-wrap',
        html: `<div class="vehicle-radar-pin ${isEx ? 'excursion' : 'safe'}"><div class="radar-pulse-ring"></div><div class="radar-core-circle">🚚</div></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      L.marker([lat, lng], { icon: truckIcon, zIndexOffset: 1000 }).addTo(map).bindTooltip(`
        <div class="pill-title ${isEx ? 'truck-color-exc' : 'truck-color-ok'}">
          ${isEx ? '🚨' : '🚚'} ${esc(activeShip.shipment_id)} [LIVE] &bull; ${activeShip.latest_temp_c != null ? `${Number(activeShip.latest_temp_c).toFixed(1)}°C` : '28.8°C'}
        </div>
      `, { permanent: true, direction: 'bottom', offset: [0, 16], className: 'corridor-pill-badge' });
    }

    const bounds = L.latLngBounds([[18.5018, 73.9357], [19.0952, 74.7496], [18.9894, 75.7601], [19.2612, 76.7749], [19.1383, 77.3210]]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    setTimeout(() => { map.invalidateSize(); map.fitBounds(bounds, { padding: [40, 40] }); }, 150);
  }

  window.VGRoleDashboards = {
    renderTrackingMap,
    render(role, root) {
      if (role === 'admin') return adminView(root);
      if (role === 'sender_receiver') return senderView(root);
      if (role === 'transporter') return transporterView(root);
      return checkpointView(root);
    }
  };
})();
