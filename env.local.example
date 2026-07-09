// This route runs on the server only, so your ANTHROPIC_API_KEY is never
// exposed to the browser.
//
// COST PROTECTION: this route requires a passcode (set via the
// DASHBOARD_PASSCODE environment variable) before it will forward any
// request to Anthropic. Without a matching passcode, the request is
// rejected here and never reaches Anthropic — so it can never cost you
// money. Only share the passcode with yourself; don't put it in the
// public repo.

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const requiredPasscode = process.env.DASHBOARD_PASSCODE;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // If no passcode is configured on the server, block all requests by
  // default. This means the AI features are OFF until you deliberately
  // turn them on by setting DASHBOARD_PASSCODE.
  if (!requiredPasscode) {
    return new Response(
      JSON.stringify({ error: "AI features are currently disabled by the site owner." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const providedPasscode = req.headers.get("x-dashboard-passcode");
  if (providedPasscode !== requiredPasscode) {
    return new Response(
      JSON.stringify({ error: "Incorrect passcode." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await req.text();

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body,
  });

  const data = await anthropicRes.text();

  return new Response(data, {
    status: anthropicRes.status,
    headers: { "Content-Type": "application/json" },
  });
}
