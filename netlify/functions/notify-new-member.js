// New member signup notification → sends email to admin via Resend
// Triggered by Supabase Database Webhook on public.member_log INSERT.
// After migration 033, member_log includes: full_name, role, signup_method,
// access_code, tier. The Netlify function reads them straight from the payload.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  // Verify this is genuinely from Supabase (shared secret)
  const secret = event.headers['x-webhook-secret'];
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let payload;
  try { payload = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const r = payload.record || {};
  const email         = r.email         || '(not provided)';
  const userId        = r.user_id       || r.id || '—';
  const fullName      = r.full_name     || '—';
  const role          = r.role          || '—';
  const signupMethod  = r.signup_method || 'email';
  const accessCode    = r.access_code   || null;
  const tier          = r.tier          || 'starter (default)';

  const joinedAt = r.created_at
    ? new Date(r.created_at).toLocaleString('en-US', { timeZone:'America/Los_Angeles', dateStyle:'medium', timeStyle:'short' })
    : new Date().toLocaleString('en-US', { timeZone:'America/Los_Angeles', dateStyle:'medium', timeStyle:'short' });

  const methodLabel = signupMethod === 'google' ? 'Google OAuth' : 'Email & password';
  const profileLink = `https://pegasuscapitalnetwork.com/public-profile.html?id=${encodeURIComponent(userId)}`;
  const adminLink   = `https://pegasuscapitalnetwork.com/admin.html`;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;color:#1d1d1b">
      <div style="background:#13314e;padding:22px 28px;border-radius:10px 10px 0 0">
        <span style="color:#cda748;font-size:13px;letter-spacing:.12em;font-weight:600">PEGASUS CAPITAL NETWORK</span>
      </div>
      <div style="background:#ffffff;border:1px solid #e2ded5;border-top:none;padding:28px;border-radius:0 0 10px 10px">
        <h2 style="margin:0 0 18px;font-size:20px;font-weight:400;color:#13314e">New Pegasus Member Joined</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#9a978f;width:140px">Full name</td>
              <td style="padding:8px 0;font-weight:500">${escapeHtml(fullName)}</td></tr>
          <tr><td style="padding:8px 0;color:#9a978f">Email</td>
              <td style="padding:8px 0;font-weight:500">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:8px 0;color:#9a978f">Role</td>
              <td style="padding:8px 0">${escapeHtml(role)}</td></tr>
          <tr><td style="padding:8px 0;color:#9a978f">Signup method</td>
              <td style="padding:8px 0">${escapeHtml(methodLabel)}</td></tr>
          ${accessCode ? `
          <tr><td style="padding:8px 0;color:#9a978f">Access code used</td>
              <td style="padding:8px 0;font-family:monospace">${escapeHtml(accessCode)}</td></tr>` : `
          <tr><td style="padding:8px 0;color:#9a978f">Access code used</td>
              <td style="padding:8px 0;color:#9a978f">—</td></tr>`}
          <tr><td style="padding:8px 0;color:#9a978f">Membership tier</td>
              <td style="padding:8px 0;font-weight:500">${escapeHtml(tier)}</td></tr>
          <tr><td style="padding:8px 0;color:#9a978f">Joined</td>
              <td style="padding:8px 0">${escapeHtml(joinedAt)} PT</td></tr>
          <tr><td style="padding:8px 0;color:#9a978f">User ID</td>
              <td style="padding:8px 0;font-family:monospace;font-size:12px;color:#6b6b66">${escapeHtml(userId)}</td></tr>
        </table>
        <div style="margin-top:22px;padding-top:18px;border-top:1px solid #e2ded5;display:flex;gap:10px;flex-wrap:wrap">
          <a href="${profileLink}"
             style="display:inline-block;background:#ffffff;color:#13314e;border:1px solid #c8c4ba;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px">
            View profile
          </a>
          <a href="${adminLink}"
             style="display:inline-block;background:#13314e;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px">
            Open Admin Console →
          </a>
        </div>
        <p style="margin-top:20px;font-size:11px;color:#b0ada6">
          Pegasus Capital Network · Admin notification · This email was sent because a new member joined.
        </p>
      </div>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'notifications@pegasuslendersgroup.com',
        to:   ['pegasuslendersgroup@gmail.com'],
        subject: `New Pegasus Member Joined — ${fullName !== '—' ? fullName + ' (' + email + ')' : email}`,
        html
      })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
    }
  } catch(e) {
    console.error('Notify (admin) error:', e.message);
  }

  // 2) Warm personal welcome to the NEW MEMBER, from Anatoliy.
  //    Non-blocking: a failure here never fails the webhook.
  try {
    if (email && /@/.test(email)) {
      const first = (fullName && fullName !== '—') ? String(fullName).trim().split(/\s+/)[0] : 'there';
      const pegKey = process.env.PEGASUS_RESEND_API_KEY || process.env.RESEND_API_KEY;
      const welcomeHtml = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#1d1d1b;line-height:1.6">
      <div style="background:#0e1e36;padding:20px 26px;border-radius:10px 10px 0 0">
        <span style="color:#c9a45c;font-size:12px;letter-spacing:.14em;font-weight:700">PEGASUS CAPITAL NETWORK</span>
      </div>
      <div style="background:#ffffff;border:1px solid #e2ded5;border-top:none;padding:26px 28px;border-radius:0 0 10px 10px;font-size:15px;color:#2a2a26">
        <p style="margin:0 0 14px">Hi ${escapeHtml(first)},</p>
        <p style="margin:0 0 14px">It's Anatoliy, I founded Pegasus. I wanted to say welcome personally. You're one of the early members, and that actually matters here: this network is only as good as the people in it, and right now that's you.</p>
        <p style="margin:0 0 14px">Two quick things to get going. Say hello to the network so people know who you are, and grab your personal invite link to bring in the people you'd want to do business with.</p>
        <p style="margin:0 0 22px"><a href="https://pegasuscapitalnetwork.com/welcome" style="display:inline-block;background:#c9a45c;color:#1a1205;padding:12px 24px;border-radius:9px;text-decoration:none;font-size:14px;font-weight:700">Open your welcome &rarr;</a></p>
        <p style="margin:0 0 14px">Just reply to this email if you need anything at all. It comes straight to us.</p>
        <p style="margin:0 0 2px">Glad you're here.</p>
        <p style="margin:0;font-weight:600">Anatoliy Kanevsky</p>
        <p style="margin:0;font-size:13px;color:#777">Founder, Pegasus Capital Network</p>
      </div>
      <p style="font-size:11px;color:#b0ada6;margin:14px 2px 0">Pegasus Capital Network · Los Angeles · hello@pegasuscapitalnetwork.com</p>
    </div>`;
      const welcomeText = `Hi ${first},\n\nIt's Anatoliy, I founded Pegasus. Welcome personally. You're one of the early members, and that matters here.\n\nTwo things to get going: say hello to the network, and grab your personal invite link to bring in the people you'd want to do business with.\n\nOpen your welcome: https://pegasuscapitalnetwork.com/welcome\n\nJust reply to this email if you need anything.\n\nGlad you're here.\nAnatoliy Kanevsky\nFounder, Pegasus Capital Network`;
      if (pegKey) {
        const wres = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pegKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': 'welcome-' + String(userId)
          },
          body: JSON.stringify({
            from: 'Anatoliy at Pegasus <hello@pegasuscapitalnetwork.com>',
            to: [email],
            reply_to: 'hello@pegasuscapitalnetwork.com',
            subject: `Welcome to Pegasus, ${first}`,
            html: welcomeHtml,
            text: welcomeText
          })
        });
        if (!wres.ok) { const t = await wres.text().catch(()=> ''); console.error('Welcome email failed:', wres.status, t.slice(0,200)); }
      } else {
        console.error('Welcome email skipped: no PEGASUS_RESEND_API_KEY / RESEND_API_KEY');
      }
    }
  } catch(e) {
    console.error('Welcome email error:', e.message);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
