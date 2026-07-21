// Vercel serverless function — runs on the server only.
// The browser never sees anyone's email. It sends the profile card
// they clicked plus the PIN they typed; this function looks up which
// account that profile belongs to and performs a real password
// sign-in against it (the PIN IS the account's password).

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { app, profileId, pin } = req.body || {};
  if (!app || !profileId || !pin) {
    return res.status(400).json({ error: 'Missing fields.' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('user_id, app')
    .eq('id', profileId)
    .single();

  if (profileErr || !profile || profile.app !== app) {
    return res.status(401).json({ error: 'Profile not found.' });
  }

  const { data: userLookup, error: userErr } = await admin.auth.admin.getUserById(profile.user_id);
  if (userErr || !userLookup?.user?.email) {
    return res.status(401).json({ error: 'Account not found.' });
  }

  const { data: signInData, error: signInErr } = await admin.auth.signInWithPassword({
    email: userLookup.user.email,
    password: pin,
  });

  if (signInErr || !signInData?.session) {
    return res.status(401).json({ error: 'Incorrect PIN.' });
  }

  return res.status(200).json({
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  });
};
