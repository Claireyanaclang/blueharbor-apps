# Deploying PropTrack + BizTrack (Supabase + Vercel)

This folder is a ready-to-deploy static site with one serverless function.
Follow these steps in order — each one unblocks the next.

```
/
  index.html          landing page (links to both apps)
  proptrack/index.html
  biztrack/index.html
  api/create-user.js   serverless function (Owner → Add User)
  supabase/schema.sql   run this in Supabase once
  package.json
  vercel.json
```

---

## 1. Get your Supabase credentials

In your Supabase project dashboard:
**Settings → API**

Copy three values, you'll need all of them:
- **Project URL** (looks like `https://abcdefgh.supabase.co`)
- **anon public key** (safe to put in client-side code — RLS is what protects the data)
- **service_role key** (SECRET — never put this in any `.html` file, only in Vercel's environment variables)

---

## 2. Run the database setup

In Supabase: **SQL Editor → New Query** → paste the entire contents of
`supabase/schema.sql` → **Run**.

This creates:
- `profiles` — who has access to which app, with what role
- `app_data` — one row per app holding all its business data
- Row Level Security policies so people can only touch the app(s) they belong to

You should see two rows appear in `app_data` (`proptrack` and `biztrack`), both empty — the apps will fill them with sample data the first time they load.

---

## 3. Fill in your Supabase URL/key in both apps

Open `proptrack/index.html` and `biztrack/index.html`. Near the top of each, find:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
```

Replace both placeholders with your **Project URL** and **anon public key** from Step 1 (same values in both files — one Supabase project backs both apps).

---

## 4. Create the first Owner account for each app

Nobody can use "Add User" until at least one Owner exists — so the very first person is created by hand.

**a) Create the login (Supabase Dashboard → Authentication → Users → Add User):**
- Email: e.g. `adeline@blueharbor.co`
- Password: set something temporary
- Check "Auto Confirm User" so no email verification step blocks you
- Click **Create user**, then copy the **User UID** it generates

**b) Give that login Owner access (SQL Editor → New Query):**

```sql
insert into profiles (user_id, app, name, role)
values ('PASTE-USER-UID-HERE', 'proptrack', 'Adeline', 'owner');

insert into profiles (user_id, app, name, role)
values ('PASTE-USER-UID-HERE', 'biztrack', 'Adeline', 'owner');
```

(If the same person owns both apps, you can reuse the same `user_id` for both inserts, like above. If different people own each, create a second auth user in step (a) and use their UID instead.)

That's it — from here on, every other person gets added through each app's **Settings → Add User** screen, which the Owner can now use.

---

## 4.5 Set up PIN-based sign-in (do this before anyone logs in)

The apps use a simple "pick your name, type your PIN" sign-in screen — but underneath, it's still real Supabase Auth. The PIN literally *is* the account's password, just short. Two things need to be true for that to work:

**a) Lower the minimum password length in Supabase:**
Dashboard → **Authentication** → **Sign In / Providers** → **Email** → set **Minimum password length** down to **4**.

**b) Reset the first Owner's password to match her PIN:**
Since Adeline's account was created with a longer temporary password in Step 4, that's currently what she'd have to type as her "PIN." To fix this:
1. **Authentication → Users** → click her row (`fejeranpike@gmail.com`)
2. Look for an option to reset/update the password directly (usually in a "..." menu or an edit icon on the user's detail panel)
3. Set it to whatever short PIN she wants to actually use (e.g. `1234`)

From here on, every person added through **Settings → Add User** only ever needs a Name, Role, and PIN — no email required. The app generates an internal, unmemorable email behind the scenes that nobody ever sees or types.

---



**Set the environment variables first** (Vercel dashboard → your project → Settings → Environment Variables):

| Name | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | your Project URL | same one from Step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | your service_role key | **secret** — used only by `api/create-user.js` on the server |

**Then deploy:**

If this folder is already a git repo pushed to GitHub:
1. Vercel dashboard → **Add New → Project** → import that repo
2. Framework preset: **Other** (it's a static site, no build step needed)
3. Deploy

Or from the command line, from inside this folder:
```bash
npm install -g vercel   # if you don't have it
vercel                  # first deploy, follow the prompts
vercel --prod           # promote to production
```

---

## 6. Test it

1. Visit your Vercel URL — you should see the landing page with two cards
2. Click **PropTrack**, sign in with the Owner email/password from Step 4
3. Go to **Settings → Add User** and create your Property Manager and Maintenance accounts — you'll get an email/password to hand to each person
4. Repeat for **BizTrack**

---

## Notes on what's real vs. what's a shortcut

- **PIN-based login is real Supabase Auth underneath** — the PIN is literally each account's password, exchanged for a real session through a server-side function. Nobody types or sees anyone's email.
- **The sign-in picker shows everyone's name and role to anyone who loads the login page** (not their PIN, not their email) — this is what makes the one-click "pick your name" experience possible. If that's ever a problem (e.g. you don't want the public seeing your team's names), ask me to switch back to a typed-username flow instead.
- **Data storage is real** but simplified — each app's business data lives in one JSON column (`app_data.data`) rather than fully separate tables per entity. This was the fastest path to "live" without rewriting every feature's data layer. Anyone who's a member of an app (any role) can read/write that whole blob at the database level — the UI hides pages by role, but that's a UI-level restriction, not a database-level one.
- **If you later store something you'd consider sensitive** (bank account numbers, SSNs, etc.), ask to normalize `app_data` into real per-entity tables (properties, tenants, transactions, etc.) with per-role Row Level Security — a bigger job, but the right one at that point.
- **Custom PropTrack roles** (the "Custom..." option in Add User) still only enforce their page list in the UI, for the same reason above.
