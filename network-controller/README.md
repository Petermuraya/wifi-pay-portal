# MikroTik network controller bridge

This service is the router-side implementation used by the WiFi Pay Supabase `radius-auth` Edge Function. Run it on a trusted machine that can reach the MikroTik router (for example a small local server, Raspberry Pi, NUC, VM or management host on the router network).

It uses the RouterOS v7 REST API and manages `/ip/hotspot/ip-binding` records owned by WiFi Pay. Authorized devices receive a temporary `bypassed` binding tied to the paid/voucher session. Disconnects and expiries remove that binding and clear matching HotSpot active records so RouterOS re-evaluates access.

## Requirements

- Node.js 20+
- MikroTik RouterOS v7 with REST enabled
- Prefer `www-ssl`/HTTPS with a certificate trusted by the machine running this bridge
- A dedicated RouterOS user with only the permissions needed to read/write HotSpot state
- Network reachability from this bridge to the router
- A secure HTTPS route from Supabase Edge Functions to this bridge, normally through a reverse proxy/VPN/tunnel

Do not expose the RouterOS REST service itself directly to the public internet.

## Environment

```text
PORT=8787
CONTROLLER_TOKEN=use-a-long-random-token
ROUTEROS_URL=https://192.168.88.1
ROUTEROS_USERNAME=wifi-pay-controller
ROUTEROS_PASSWORD=use-a-strong-router-password
ROUTEROS_HOTSPOT_SERVER=hotspot1
```

For isolated testing only, RouterOS HTTP can be enabled with:

```text
ROUTEROS_ALLOW_INSECURE_HTTP=1
```

Production should use HTTPS.

## Run

```sh
cd network-controller
npm run check
npm start
```

Health check:

```sh
curl http://127.0.0.1:8787/health
```

Configure the Supabase Edge Function secrets so the application calls the public HTTPS address of this service:

```text
NETWORK_CONTROLLER_URL=https://controller.example.com/network
NETWORK_CONTROLLER_TOKEN=<same value as CONTROLLER_TOKEN>
```

## Controller contract

Authorize request:

```json
{
  "action": "authorize",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "sessionId": "44c57d8f-3b9c-4dad-8f76-b1c01f0e9ce7",
  "sessionTimeout": 3600,
  "accessMethod": "mpesa"
}
```

Disconnect request:

```json
{
  "action": "disconnect",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "sessionId": "44c57d8f-3b9c-4dad-8f76-b1c01f0e9ce7"
}
```

Both requests require:

```text
Authorization: Bearer <CONTROLLER_TOKEN>
```

## Expiry safety

The Supabase session manager remains the source of truth and should run its protected `check-expired` action on a schedule. The bridge also stores the session expiry in each WiFi Pay RouterOS binding comment and schedules local cleanup. On restart, it reconciles existing `wifi-pay:*` bindings and removes any that have already expired.

This dual cleanup prevents an expired paid session from remaining bypassed solely because one process restarted or an individual disconnect request was missed.
