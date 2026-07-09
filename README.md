# The Ledger — AI Financial Dashboard

An AI-powered financial statement analyzer, built around a real case study of
NIKE, Inc.'s FY2021–FY2025 margin compression, with support for uploading any
other company's 10-K PDF for automatic extraction and analysis.

## What's in this project

- `components/FinancialDashboard.jsx` — the dashboard itself (charts, ratios, auto-flagging)
- `app/api/claude/route.js` — a backend route that holds your Anthropic API key
  server-side and forwards requests to Claude. Your key is never exposed to
  the browser.
- `app/page.jsx`, `app/layout.jsx` — the Next.js page shell

## 1. Get an Anthropic API key

1. Go to https://console.anthropic.com
2. Sign up / log in
3. Go to **API Keys** and create a new key
4. Copy it — you'll need it in step 3

Note: API usage is billed separately from a claude.ai subscription. Check
current pricing at https://docs.claude.com.

## 2. Choose a passcode (this is what keeps you from being charged)

The "Generate insight" button and PDF upload feature are **locked by
default**. The backend route (`app/api/claude/route.js`) refuses to contact
Anthropic at all unless the request includes a passcode that matches a
`DASHBOARD_PASSCODE` you set yourself. If you never set that variable, the AI
features stay completely disabled — the site still works fine as a static
dashboard, just without the AI buttons doing anything.

Pick any private string, e.g. `ava-nike-2026`. You'll enter this into the
site itself (there's a small "Passcode to unlock AI features" field above
the case study) whenever *you* want to demo the AI features. Nobody else
visiting the live site can trigger a paid API call without knowing it.

## 3. Run it locally first (recommended)

```bash
npm install
cp .env.local.example .env.local
```

Open `.env.local` and fill in your real values:

```
ANTHROPIC_API_KEY=sk-ant-your-real-key
DASHBOARD_PASSCODE=ava-nike-2026
```

Then run:

```bash
npm run dev
```

Open http://localhost:3000, enter your passcode in the unlock field, and
click "Generate insight" to confirm everything works before deploying.

## 4. Deploy to Vercel (free)

1. Push this folder to a new GitHub repository
2. Go to https://vercel.com and sign in with GitHub
3. Click **Add New → Project**, and import your repository
4. Before clicking Deploy, open **Environment Variables** and add both:
   - `ANTHROPIC_API_KEY` → your real key from step 1
   - `DASHBOARD_PASSCODE` → your chosen passcode from step 2
5. Click **Deploy**

Vercel will give you a live URL like `nike-dashboard.vercel.app` — that's
your real, working website. Put that link on your resume. Visitors can view
the whole dashboard, but only you (or anyone you give the passcode to) can
trigger the AI features.

## Extra safety net

Even with the passcode, it's worth setting a spend limit as a backstop:
in the Anthropic Console, go to Settings → Billing limits and cap your
monthly spend at whatever you're comfortable with (even $5). That way even
a mistake on your end can't turn into a surprise bill.

## Updating the data

Nike's figures live in `BASE_COMPANIES` near the top of
`components/FinancialDashboard.jsx`. To swap in a different default company,
edit that object directly. Anything uploaded through the PDF upload button is
extracted live and doesn't require touching the code.


