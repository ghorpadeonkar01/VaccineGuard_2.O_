document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('login-root');
  root.innerHTML = `
    <main class="login-screen">
      <header class="login-top">
        <a class="brand" href="index.html">
          <span class="brand-mark">VG</span>
          <span class="brand-copy">
            <span class="brand-title">Vaccine<span class="brand-accent">Guard</span></span>
            <span class="brand-sub">Mission-Critical Cold Chain Platform</span>
          </span>
        </a>
        <span class="login-top-label"><i></i> LIVE IOT TELEMETRY ACTIVE</span>
      </header>
      <div class="login-body">
        <section class="login-panel">
          <div class="eyebrow">OPERATIONAL CONSOLE</div>
          <h1>Operations Sign In</h1>
          <p class="login-lead">Access real-time cold-chain monitoring, dual sensor telemetry, Arrhenius kinetics, and automated checkpoint dispatch.</p>
          
          <div class="demo-quick-login">
            <div class="demo-quick-header">
              <span class="demo-quick-title">⚡ EVALUATION ACCESS</span>
              <span class="demo-quick-sub">1-Click Role Login</span>
            </div>
            <div class="demo-quick-grid">
              <button type="button" class="quick-role-btn" data-quick="admin@vaccineguard.demo">
                <div class="quick-role-top">
                  <span class="quick-role-name">Operations Admin</span>
                  <span class="quick-role-tag tag-admin">ADMIN</span>
                </div>
                <span class="quick-role-desc">Full system overview &amp; fleet control</span>
              </button>
              <button type="button" class="quick-role-btn" data-quick="driver@vaccineguard.demo">
                <div class="quick-role-top">
                  <span class="quick-role-name">Fleet Driver</span>
                  <span class="quick-role-tag tag-driver">DRIVER</span>
                </div>
                <span class="quick-role-desc">In-transit route &amp; live excursion alerts</span>
              </button>
              <button type="button" class="quick-role-btn" data-quick="sender@vaccineguard.demo">
                <div class="quick-role-top">
                  <span class="quick-role-name">Medical Logistics Hub</span>
                  <span class="quick-role-tag tag-sender">SENDER</span>
                </div>
                <span class="quick-role-desc">Origin dispatch &amp; batch creation</span>
              </button>
              <button type="button" class="quick-role-btn" data-quick="checkpoint@vaccineguard.demo">
                <div class="quick-role-top">
                  <span class="quick-role-name">Checkpoint Station</span>
                  <span class="quick-role-tag tag-hub">HUB</span>
                </div>
                <span class="quick-role-desc">Cold store emergency rerouting</span>
              </button>
            </div>
          </div>

          <form id="login-form" novalidate>
            <label class="login-field">
              Operational Email
              <input type="email" name="email" autocomplete="username" placeholder="name@organization.org" value="admin@vaccineguard.demo" required>
            </label>
            <label class="login-field">
              Password
              <span class="login-password">
                <input id="password" type="password" name="password" autocomplete="current-password" placeholder="Enter password" value="Password@123" required>
                <button class="text-button" id="toggle-password" type="button" aria-label="Show password">Show</button>
              </span>
            </label>
            <div class="login-options">
              <span>TLS 1.3 &middot; Supabase Authenticated</span>
              <button type="button" id="forgot-password" class="forgot-link">Reset Password</button>
            </div>
            <div id="login-message" role="status" aria-live="polite"></div>
            <button class="login-submit" type="submit">
              <span>Enter Operations Console</span>
              <b aria-hidden="true">&rarr;</b>
            </button>
          </form>
        </section>

        <aside class="login-side">
          <div class="hero-backdrop-glow"></div>
          <div>
            <div class="hero-tech-badge">
              <span class="dot"></span>
              <span>HARDWARE-IN-THE-LOOP IoT PLATFORM</span>
            </div>
            <h2>Zero Silent Failures.<br><em>Guaranteed Potency.</em></h2>
            <p>End-to-end biological preservation pipeline combining physical sensor telemetry with continuous Arrhenius thermal degradation modelling and autonomous checkpoint diversion.</p>
            
            <div class="hero-pillars">
              <div class="pillar-item">
                <div class="pillar-icon green">📡</div>
                <div class="pillar-content">
                  <strong>Hardware Microcontroller Feed</strong>
                  <span>DS18B20 digital core probe + DHT22 ambient &amp; GPS via EMQX broker</span>
                </div>
              </div>
              <div class="pillar-item">
                <div class="pillar-icon blue">⚡</div>
                <div class="pillar-content">
                  <strong>Bi-Directional Actuation Feedback</strong>
                  <span>Cloud triggers ESP32 physical buzzer &amp; tri-color status LEDs</span>
                </div>
              </div>
              <div class="pillar-item">
                <div class="pillar-icon amber">🛡️</div>
                <div class="pillar-content">
                  <strong>Autonomous Rerouting Corridor</strong>
                  <span>Dynamic geo-intercept to nearest certified cold store on excursion</span>
                </div>
              </div>
            </div>
          </div>

          <div class="side-status">
            <span><i></i> CONNECTED BROKER: EMQX TLS</span>
            <b>NODE: CCW-NODE-01 (ONLINE)</b>
          </div>
        </aside>
      </div>
      <footer class="login-footer">
        <span>VaccineGuard Platform &middot; WHO-Standard Cold Chain Integrity Management</span>
        <span>Supabase Realtime Engine &middot; MQTT PubSubClient Protocol</span>
      </footer>
    </main>
  `;

  const form = document.getElementById('login-form');
  const password = document.getElementById('password');
  const message = document.getElementById('login-message');

  document.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.onclick = () => {
      form.elements.email.value = btn.dataset.quick;
      form.elements.password.value = 'Password@123';
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    };
  });

  document.getElementById('toggle-password').onclick = (e) => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'Hide' : 'Show';
    e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  };

  const showMessage = (text, type = 'warning') => {
    message.className = `notice ${type} login-notice`;
    message.textContent = text;
  };
  if (new URLSearchParams(location.search).get('error') === 'role') {
    showMessage('Your account does not have an approved application role. Contact an administrator.', 'danger');
  }

  async function finishLogin(session) {
    const role = await VGAuth.getRole(session.user);
    if (!role) {
      await VGAuth.signOut();
      showMessage('Account verified but no application role found in profiles.', 'danger');
      return false;
    }
    location.href = 'index.html?page=dashboard';
    return true;
  }

  try {
    VGAuth.client();
    VGAuth.onChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) showRecovery();
    });
    const existing = await VGAuth.session();
    if (existing) await finishLogin(existing);
  } catch (e) {
    showMessage(e.message, 'warning');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    message.className = '';
    message.textContent = '';
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.querySelector('span').textContent = 'Connecting...';
    try {
      const { data, error } = await VGAuth.signIn(form.elements.email.value.trim(), form.elements.password.value);
      if (error) throw error;
      if (!data.session) throw new Error('Sign-in needs confirmation.');
      await finishLogin(data.session);
    } catch (err) {
      showMessage(err.message || 'Sign-in failed. Check credentials.', 'danger');
    } finally {
      if (document.body.contains(submit)) {
        submit.disabled = false;
        submit.querySelector('span').textContent = 'Enter Operations Console';
      }
    }
  });

  document.getElementById('forgot-password').onclick = async () => {
    const email = form.elements.email.value.trim();
    if (!email) {
      form.elements.email.focus();
      showMessage('Enter email first.');
      return;
    }
    try {
      const { error } = await VGAuth.requestPasswordReset(email, location.origin + location.pathname);
      if (error) throw error;
      showMessage('Password reset instructions sent.', 'success');
    } catch (e) {
      showMessage(e.message, 'danger');
    }
  };

  function showRecovery() {
    const oldForm = document.getElementById('login-form');
    const f = document.createElement('form');
    f.id = 'login-form';
    f.innerHTML = `
      <label class="login-field">New password<input name="new-password" type="password" minlength="8" required></label>
      <label class="login-field">Confirm password<input name="confirm-password" type="password" minlength="8" required></label>
      <div id="recovery-message" role="status"></div>
      <button class="button primary full login-submit" type="submit"><span>Update password</span><b>&rarr;</b></button>
    `;
    oldForm.replaceWith(f);
  }
});
