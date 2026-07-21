// Vercel serverless function — runs on the server only.
// Uses the SUPABASE_SERVICE_ROLE_KEY (secret, never sent to the browser)
// to create a real auth account, then adds the matching profiles row.
//
// The caller must send their own Supabase access token in the
// Authorization header. We verify that token, then check the caller
// is an Owner for the target app before creating anyone.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.replace('Bearer ', '');
  if (!callerToken) {
    return res.status(401).json({ error: 'Missing authorization token.' });
  }

  const { name, role, app, pin, customLabel, pages } = req.body || {};
  if (!name || !pin || !role || !app) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (!['proptrack', 'biztrack'].includes(app)) {
    return res.status(400).json({ error: 'Invalid app.' });
  }
  if (!['owner', 'manager', 'maintenance', 'clerk', 'custom'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  if (String(pin).length < 4) {
    return res.status(400).json({ error: 'PIN must be at least 4 characters.' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Verify the caller's token and identity.
  const { data: callerData, error: callerErr } = await admin.auth.getUser(callerToken);
  if (callerErr || !callerData?.user) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  // 2. Confirm the caller is an Owner for this app.
  const { data: callerProfile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', callerData.user.id)
    .eq('app', app)
    .single();

  if (profileErr || !callerProfile || callerProfile.role !== 'owner') {
    return res.status(403).json({ error: 'Only an Owner can add team members.' });
  }

  // 3. Create a real auth account with an internal, unmemorable email —
  //    nobody types or sees this; the PIN is what people actually use to sign in.
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'user';
  const email = `${slug}-${Date.now().toString(36)}@blueharbor.internal`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: String(pin),
    email_confirm: true,
  });

  if (createErr) {
    return res.status(400).json({ error: createErr.message });
  }

  const targetUserId = created.user.id;

  // 4. Insert the profile row for this app.
  const { error: insertErr } = await admin.from('profiles').insert({
    user_id: targetUserId,
    app,
    name,
    role,
    custom_label: role === 'custom' ? (customLabel || null) : null,
    pages: role === 'custom' ? (pages || []) : [],
  });

  if (insertErr) {
    return res.status(400).json({ error: insertErr.message });
  }

  return res.status(200).json({ ok: true });
};
