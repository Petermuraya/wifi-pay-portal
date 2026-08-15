# WiFi Pay Portal

A mobile-first captive WiFi payment and access-control platform built with React, TypeScript, Supabase, Safaricom M-Pesa and a MikroTik RouterOS controller bridge.

The implemented customer journey is:

**hotspot redirect → identify device → choose package → M-Pesa/voucher → verify entitlement → authorize router → browse → reconnect/monitor until expiry**

The repository also contains a protected operator dashboard at `/admin` for package management, voucher generation and live-session control.

## What is implemented

### Customer portal

- Mobile-first package selection
- Valid hotspot MAC enforcement (no demo/fake MAC fallback)
- Kenyan M-Pesa phone numbers using `07…`, `01…`, `2547…` or `2541…`
- Server-side package price and duration validation
- M-Pesa STK Push
- Protected M-Pesa callback
- Automatic payment status polling
- Separate payment and router/network status
- Voucher redemption
- Six-digit reconnection codes
- Retry WiFi activation when the router/controller was temporarily unavailable
- Active-session monitoring and manual disconnect
- Safe redirect to the original HTTP/HTTPS destination only after router activation

### Operator portal (`/admin`)

- Administrator-key verification through a server-side Edge Function
- Create packages
- Hide/reactivate packages
- Generate 1–100 vouchers at a time
- Optional three-character voucher prefix
- Download generated vouchers as CSV
- View active/pending sessions
- See M-Pesa/voucher access method and actual router activation status
- Terminate sessions

### Backend/security

- Database migrations under `supabase/migrations`
- Row Level Security for public tables
- Browser has read access only to active package definitions
- Payments, sessions and vouchers are accessed through Edge Functions using the service role
- Pending M-Pesa sessions do not receive network access
- Package time starts after a successful M-Pesa callback, not when the STK prompt is sent
- Payment amount, phone number and receipt are validated on callback
- M-Pesa callback uses a private callback secret in the callback URL
- CheckoutRequestID is not exposed to the customer browser
- Duplicate M-Pesa receipts and reconnection codes are protected by unique indexes
- Voucher claims are conditional so the same voucher cannot be redeemed twice in a race
- Internal network authorization requires `INTERNAL_FUNCTION_SECRET`
- Session-expiry maintenance requires `CRON_SECRET_KEY`

### MikroTik controller

`network-controller/` contains a Node.js 20 service that implements the `NETWORK_CONTROLLER_URL` contract against RouterOS v7 REST.

It:

- authenticates requests using a Bearer token
- creates/updates WiFi Pay-owned HotSpot IP bindings in `bypassed` mode
- removes stale WiFi Pay bindings for the same MAC
- clears matching HotSpot active records so RouterOS re-evaluates access
- removes bindings on disconnect
- schedules local expiry cleanup
- reconciles expired `wifi-pay:*` bindings after controller restart

See `network-controller/README.md` for router-side deployment.

## Application stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query
- Supabase PostgreSQL + Edge Functions
- Safaricom Daraja STK Push
- Node.js MikroTik RouterOS controller bridge

## Captive portal parameters

The public portal requires a client MAC supplied by the hotspot:

```text
?mac=AA:BB:CC:DD:EE:FF
```

`client_mac` is also accepted.

The original destination can be supplied through one of:

```text
link-orig
orig
dst
url
```

Only `http:` and `https:` destinations are accepted.

Example:

```text
https://wifi.example.com/?mac=AA:BB:CC:DD:EE:FF&link-orig=https%3A%2F%2Fexample.com
```

## Database setup

Install the Supabase CLI, link the correct project, then apply migrations:

```sh
supabase link --project-ref zecnturxqoisahnvstuj
supabase db push
```

The migrations create/harden:

- `access_packages`
- `user_sessions`
- `payments`
- `vouchers`
- payment/session enums
- package/payment/session relationships
- `network_status`
- indexes and uniqueness constraints
- updated-at triggers
- RLS and public package-read policy

Review existing production data before applying new unique indexes if the database predates these migrations.

## Required Supabase Edge Function secrets

Configure these before deploying the functions:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
MPESA_CONSUMER_KEY
MPESA_CONSUMER_SECRET
MPESA_BUSINESS_SHORT_CODE
MPESA_PASSKEY
MPESA_CALLBACK_SECRET
MPESA_BASE_URL
MPESA_TRANSACTION_TYPE
INTERNAL_FUNCTION_SECRET
CRON_SECRET_KEY
NETWORK_CONTROLLER_URL
NETWORK_CONTROLLER_TOKEN
ADMIN_SECRET_KEY
```

Generate long independent random values for `MPESA_CALLBACK_SECRET`, `INTERNAL_FUNCTION_SECRET`, `CRON_SECRET_KEY`, `NETWORK_CONTROLLER_TOKEN` and `ADMIN_SECRET_KEY`. Do not reuse the RouterOS password.

Example secret generation on Linux/macOS:

```sh
openssl rand -hex 32
```

### M-Pesa environment

Sandbox:

```text
MPESA_BASE_URL=https://sandbox.safaricom.co.ke
MPESA_TRANSACTION_TYPE=CustomerPayBillOnline
```

For live M-Pesa, use production Daraja credentials and the production API base URL supplied for your application. `MPESA_TRANSACTION_TYPE` supports `CustomerPayBillOnline` or `CustomerBuyGoodsOnline`; make sure it matches the merchant credentials being used.

`MPESA_CALLBACK_SECRET` is appended server-side to the Daraja callback URL and validated by `mpesa-callback`. It is never returned to the browser.

## Deploy Edge Functions

Deploy the implemented application functions:

```sh
supabase functions deploy mpesa-stk-push
supabase functions deploy mpesa-callback --no-verify-jwt
supabase functions deploy voucher-generator
supabase functions deploy session-manager
supabase functions deploy radius-auth
supabase functions deploy admin-api
```

`mpesa-callback` intentionally does not require a Supabase JWT because Safaricom calls it directly; it is protected by `MPESA_CALLBACK_SECRET`. Browser-facing functions require the Supabase JWT sent by the Supabase client.

## Network controller setup

The Supabase `radius-auth` function sends trusted authorization requests to:

```text
NETWORK_CONTROLLER_URL=https://controller.example.com/network
NETWORK_CONTROLLER_TOKEN=<long random token>
```

The same token is configured as `CONTROLLER_TOKEN` in `network-controller/`.

Authorize payload:

```json
{
  "action": "authorize",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "sessionId": "44c57d8f-3b9c-4dad-8f76-b1c01f0e9ce7",
  "sessionTimeout": 3600,
  "accessMethod": "mpesa"
}
```

Disconnect payload:

```json
{
  "action": "disconnect",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "sessionId": "44c57d8f-3b9c-4dad-8f76-b1c01f0e9ce7"
}
```

Do not place RouterOS credentials, RADIUS shared secrets or the controller token in the React application.

## Session expiry maintenance

The MikroTik bridge independently removes its paid bypass when the supplied session timeout expires. The Supabase database should also run the protected `session-manager` action periodically so database state is cleaned up and disconnect is retried:

```json
{
  "action": "check-expired",
  "cronKey": "<CRON_SECRET_KEY>"
}
```

Run this from a trusted scheduler (for example a server cron, secure scheduled function or another backend) every few minutes. Never put `CRON_SECRET_KEY` in browser JavaScript.

## Local frontend development

```sh
npm install
npm run dev
```

Production frontend checks:

```sh
npm ci
npm run build
npm run lint
```

The repository includes `.github/workflows/ci.yml` to run build and lint on pushes/PRs when GitHub Actions is available for the account.

## Local MikroTik bridge development

```sh
cd network-controller
npm run check
npm start
```

See `network-controller/README.md` for required environment variables and RouterOS setup guidance.

## Production deployment order

1. Back up the existing Supabase database.
2. Apply the migrations with `supabase db push`.
3. Configure all Edge Function secrets.
4. Deploy all six application Edge Functions.
5. Deploy `network-controller/` on a trusted host that can reach the MikroTik router.
6. Configure `NETWORK_CONTROLLER_URL` and matching controller token.
7. Configure the hotspot/walled garden so the captive portal and required Supabase endpoints are reachable before authentication.
8. Configure the hotspot redirect to supply the client MAC and original URL.
9. Deploy the React frontend to HTTPS.
10. Create/activate customer packages from `/admin`.
11. Test a real M-Pesa payment, cancellation, voucher, reconnection, controller outage/retry and expiry on the actual hotspot.
12. Switch Daraja from sandbox to production only after the full sandbox path is verified.

## Important infrastructure boundary

The repository implements the application and a MikroTik RouterOS controller bridge, but production still requires real infrastructure values: your RouterOS address/user/password, the public HTTPS address that securely reaches the controller bridge, your Daraja merchant credentials, and the Supabase secrets. Those values are intentionally not hard-coded into GitHub.
