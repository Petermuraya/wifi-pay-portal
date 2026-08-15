# SwiftSpot WiFi Pay Portal

A mobile-first captive WiFi payment portal built with React, TypeScript, Supabase and Safaricom M-Pesa. The customer journey is designed for hotspot redirects: identify device → choose package → pay by M-Pesa → authorize device → reconnect or monitor session.

## Core customer flow

1. The hotspot redirects the customer to the portal with a MAC parameter, for example `?mac=AA:BB:CC:DD:EE:FF`.
2. Active packages are loaded from `access_packages`.
3. The customer chooses a package and enters a Safaricom phone number.
4. `mpesa-stk-push` validates the package and price server-side, creates the pending payment/session records and sends the Daraja STK Push.
5. Safaricom calls `mpesa-callback`.
6. A successful callback verifies the amount, marks the payment completed, creates a reconnection code and activates the session.
7. `session-manager` calls `radius-auth`, which hands the authorization request to your configured network controller bridge.
8. The customer is returned to the original destination when the hotspot supplied `link-orig`, `orig`, `dst` or `url`.

## Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query
- Supabase database and Edge Functions
- Safaricom Daraja STK Push
- Network controller/RADIUS bridge integration

## Required Supabase Edge Function secrets

Set these in the Supabase project before production deployment:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
MPESA_CONSUMER_KEY
MPESA_CONSUMER_SECRET
MPESA_BUSINESS_SHORT_CODE
MPESA_PASSKEY
MPESA_BASE_URL
NETWORK_CONTROLLER_URL
NETWORK_CONTROLLER_TOKEN
ADMIN_SECRET_KEY
```

For Daraja sandbox:

```text
MPESA_BASE_URL=https://sandbox.safaricom.co.ke
```

For production, set `MPESA_BASE_URL` to Safaricom's production API base URL together with production credentials.

## Network controller contract

`NETWORK_CONTROLLER_URL` should point to a trusted backend/bridge that can talk to MikroTik RouterOS, FreeRADIUS or your hotspot controller. The Edge Function sends JSON like:

```json
{
  "action": "authorize",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "sessionId": "uuid",
  "sessionTimeout": 3600
}
```

Disconnect requests use:

```json
{
  "action": "disconnect",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "sessionId": "uuid"
}
```

If `NETWORK_CONTROLLER_TOKEN` is configured, it is sent as a Bearer token. Do not expose router passwords, RouterOS API credentials or RADIUS shared secrets in the browser application.

## Captive portal parameters

The public portal requires a valid device MAC from the hotspot. Supported destination parameters include `link-orig`, `orig`, `dst` and `url`.

Example:

```text
https://wifi.example.com/?mac=AA:BB:CC:DD:EE:FF&link-orig=https%3A%2F%2Fexample.com
```

## Local development

```sh
npm install
npm run dev
```

Production build:

```sh
npm run build
```

## Production checklist

- Configure Supabase tables, RLS policies and Edge Function secrets.
- Deploy `mpesa-stk-push`, `mpesa-callback`, `session-manager`, `radius-auth` and `voucher-generator`.
- Configure the public HTTPS M-Pesa callback URL.
- Configure `NETWORK_CONTROLLER_URL` to a trusted network-controller bridge.
- Add the portal, Supabase and required M-Pesa endpoints to the hotspot walled garden.
- Configure the hotspot redirect to include the client MAC and original URL.
- Test payment success, customer cancellation, timeout, duplicate callback, voucher redemption, reconnection and session expiry on a real hotspot before going live.

## Security notes

Package price and payment initialization are handled server-side. Customer-facing navigation does not expose router or admin configuration. Reconnection validation is handled by an Edge Function rather than direct browser database writes. Network-controller credentials must remain server-side.
