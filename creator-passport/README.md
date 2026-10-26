# Creator Resource Passport (v2)

Creators connect Instagram, then publish one resource page per **their own** reel. Anyone can search
resources, open them without an account, share a reel link to the app to find its resources, and save
them to a personal library (with a free-plan limit). Creators get analytics and a ranking.

Stack: Next.js (App Router, TypeScript), Supabase (Postgres, Auth, Storage), plain CSS.

## What is in v2

| Area | What it does |
| --- | --- |
| Instagram connect | OAuth with Instagram. Name, username and profile photo are copied from Instagram and locked. Reels are synced from Instagram. A collection can only be created for a reel on the creator's own connected account (enforced in the database, not just the UI). Tokens are stored encrypted and refreshed daily. |
| Safety | Vulgar/abusive text is rejected, risky topics (scams, piracy, gambling, adult-adjacent) wait for review, links are screened (adult hosts, shorteners, look-alike domains, optional Google Web Risk), PDFs are screened for scripts, users can report resources (3 reports auto-hide a resource), admins review a queue and can ban users. Content written from a browser can never be public until the server or an admin approves it. |
| Search | Full-text search over resources, collections and creators, showing creator name, photo, Instagram-verified badge, rating and PDF-guide badge. |
| Share a reel | `/share` finds the collection for a pasted reel link. On Android, once the site is installed as an app, it appears in Instagram's Share sheet. "Save all" adds every resource in one tap. |
| Ranking | `/leaderboard`. Score uses unique people who clicked, saves by other people, ratings from people who saved, minus upheld reports. |
| Save limit | Free plan = 25 saves (table `plans`, change the number in SQL). Ready for a paid plan later: set `profiles.plan = 'pro'`. |
| PDF guides | Creators attach a step-by-step PDF to a resource. Stored privately, served by short-lived link, approved by an admin first by default. |
| Feedback | After 24 hours the library asks for a rating and optional comment. It also offers a link to the reel to say thanks. Saves are never removed for skipping it. |

## Setup

### 1. Supabase

1. Create a project (free tier is fine).
2. SQL Editor: run `supabase/schema.sql`, then `supabase/migration_002.sql`. If you already ran schema.sql earlier, run only the migration. If any statement errors, copy the message and ask for a fix.
3. Authentication, URL Configuration: Site URL = your site address, add `<site>/auth/callback` to Redirect URLs.
4. For a public launch turn **on** "Confirm email" (Authentication, Providers, Email) so fake accounts cost more effort.

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in. You need the Supabase URL, anon key and the **service role key** (server only), `NEXT_PUBLIC_SITE_URL`, and a token encryption key:

```bash
openssl rand -base64 32   # paste as TOKEN_ENCRYPTION_KEY
```

### 3. Instagram (Meta developer app)

Instagram's API supports **business and creator accounts only**. Personal accounts cannot connect (switching to a professional account is free in the Instagram app).

1. Go to developers.facebook.com, create an app, add the product **Instagram API with Instagram Login**.
2. In its settings, add these URLs (replace `<site>` with your address; it must be HTTPS in production):
   - OAuth redirect URI: `<site>/api/instagram/callback`
   - Deauthorize callback URL: `<site>/api/instagram/deauthorize`
   - Data deletion request URL: `<site>/api/instagram/data-deletion`
   - Privacy policy URL: `<site>/privacy`
3. Copy the Instagram App ID and App Secret into `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`.
4. **While testing:** add your own Instagram professional account under App Roles, Roles, as an Instagram Tester and accept the invite in Instagram. Only accounts with a role on your app can connect until you pass review.
5. **Going public:** to let other creators connect, Meta requires Business Verification and App Review for the `instagram_business_basic` permission (Advanced Access). Plan for this: it can take days to weeks, and it is the main gate for launching the connect feature to everyone.
6. Check Meta's current docs if requests start failing, especially the Graph API version (`INSTAGRAM_GRAPH_VERSION`) and the exact `user_id` format sent to the deauthorize/data-deletion callbacks.

### 4. Make yourself admin

Sign up on the site, then in the SQL Editor run (with your email):

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

The **Admin** link appears in the header.

### 5. Run

```bash
npm install
npm run build
npm run dev
```

### 6. Deploy (Vercel)

Push to GitHub, import in Vercel, add every variable from `.env.example`, set `NEXT_PUBLIC_SITE_URL` to the live address, then update the Supabase and Meta URLs. `vercel.json` already schedules the daily Instagram token refresh (set `CRON_SECRET`).

## Share from Instagram (Android)

1. Open the live site in Chrome on Android, menu, "Install app" / "Add to Home screen".
2. In Instagram open a reel, Share, "Share to...", choose Resource Passport.
3. Tap "Save all".

iPhone does not support website share targets yet, so iPhone users use the paste box on `/share`. A native Android app can be added later using the same pages.

## Settings you can change

- Free save limit: `update public.plans set save_limit = 40 where name = 'free';`
- Auto-approve PDF guides (skip the admin check): `REQUIRE_PDF_REVIEW=false`
- Word lists for the content check: `src/lib/blocklist.ts`
- Ranking formula: the `creator_leaderboard` function in `migration_002.sql`
- Link malware/phishing checks: set `GOOGLE_WEB_RISK_API_KEY` (check Google's pricing for your volume)

## Honest limits

- **Moderation is layered, not perfect.** Word lists miss new slang and can't read images or PDF text. Reports and the admin queue are the safety net. Consider adding an AI text check and image checks when volume grows.
- **PDF screening is basic** (real PDF, no scripts or embedded files). That is why new PDFs wait for admin approval by default.
- **Ranking can still be gamed** with many fake accounts saving a creator's resources. Mitigations in place: unique people, own-saves ignored, email confirmation, reports. Add phone verification or stricter account-age rules if abuse appears.
- **Analytics count one person once per hour** using a daily-rotating hash for anonymous visitors, so they are estimates.
- No automated tests; test by hand: connect, create a collection, add resources, publish, open in a private window, save, rate, report, approve in admin.
- The privacy policy and terms are **templates**. Have them reviewed by a lawyer and fill the brackets before launch.
- Instagram thumbnails for reels are links that expire; re-sync to refresh them.
