import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const CONTROLLER_TOKEN = process.env.CONTROLLER_TOKEN || "";
const ROUTEROS_URL = (process.env.ROUTEROS_URL || "").replace(/\/$/, "");
const ROUTEROS_USERNAME = process.env.ROUTEROS_USERNAME || "";
const ROUTEROS_PASSWORD = process.env.ROUTEROS_PASSWORD || "";
const ROUTEROS_HOTSPOT_SERVER = process.env.ROUTEROS_HOTSPOT_SERVER || "all";
const ALLOW_HTTP = process.env.ROUTEROS_ALLOW_INSECURE_HTTP === "1";
const MAX_BODY_BYTES = 64 * 1024;
const timers = new Map();

const required = {
  CONTROLLER_TOKEN,
  ROUTEROS_URL,
  ROUTEROS_USERNAME,
  ROUTEROS_PASSWORD,
};

for (const [name, value] of Object.entries(required)) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const routerBase = new URL(ROUTEROS_URL);
if (!['https:', 'http:'].includes(routerBase.protocol)) {
  console.error('ROUTEROS_URL must use http:// or https://');
  process.exit(1);
}
if (routerBase.protocol !== 'https:' && !ALLOW_HTTP) {
  console.error('ROUTEROS_URL must use HTTPS. Set ROUTEROS_ALLOW_INSECURE_HTTP=1 only for isolated testing.');
  process.exit(1);
}

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
};

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
};

const normalizeMac = (value) => {
  const mac = String(value || '').trim().replace(/-/g, ':').toUpperCase();
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) ? mac : '';
};

const validSessionId = (value) => /^[0-9a-fA-F-]{20,80}$/.test(String(value || ''));

const routerRequest = async (path, { method = 'GET', body } = {}) => {
  const url = new URL(`${routerBase.pathname.replace(/\/$/, '')}/rest/${path.replace(/^\//, '')}`, `${routerBase.origin}/`);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${ROUTEROS_USERNAME}:${ROUTEROS_PASSWORD}`).toString('base64')}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const message = data?.message || data?.detail || `RouterOS returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
};

const wifiPayComment = (sessionId, expiresAtSeconds) => `wifi-pay:${sessionId}:${expiresAtSeconds}`;

const parseWifiPayComment = (comment) => {
  const match = /^wifi-pay:([^:]+):(\d+)$/.exec(String(comment || ''));
  if (!match) return null;
  return { sessionId: match[1], expiresAtSeconds: Number(match[2]) };
};

const listBindings = async () => {
  const rows = await routerRequest('ip/hotspot/ip-binding');
  return Array.isArray(rows) ? rows : [];
};

const listHotspotActive = async () => {
  const rows = await routerRequest('ip/hotspot/active');
  return Array.isArray(rows) ? rows : [];
};

const deleteRouterRecord = async (path, id) => {
  if (!id) return;
  await routerRequest(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE' });
};

const removeActiveLoginsForMac = async (macAddress) => {
  const active = await listHotspotActive();
  const matching = active.filter((entry) => normalizeMac(entry['mac-address']) === macAddress);
  for (const entry of matching) {
    try {
      await deleteRouterRecord('ip/hotspot/active', entry['.id']);
    } catch (error) {
      console.warn(`Could not remove active HotSpot record for ${macAddress}:`, error.message);
    }
  }
};

const removeSessionBindings = async (sessionId, macAddress = '') => {
  const bindings = await listBindings();
  const matching = bindings.filter((entry) => {
    const owned = parseWifiPayComment(entry.comment);
    return owned?.sessionId === sessionId || (owned && macAddress && normalizeMac(entry['mac-address']) === macAddress);
  });

  for (const entry of matching) {
    await deleteRouterRecord('ip/hotspot/ip-binding', entry['.id']);
  }

  const timer = timers.get(sessionId);
  if (timer) clearTimeout(timer);
  timers.delete(sessionId);
  return matching.length;
};

const scheduleExpiry = (sessionId, macAddress, expiresAtSeconds) => {
  const existing = timers.get(sessionId);
  if (existing) clearTimeout(existing);

  const run = () => {
    const remaining = expiresAtSeconds * 1000 - Date.now();
    if (remaining <= 0) {
      timers.delete(sessionId);
      removeSessionBindings(sessionId, macAddress)
        .then(() => removeActiveLoginsForMac(macAddress))
        .catch((error) => console.error(`Expiry cleanup failed for ${sessionId}:`, error.message));
      return;
    }
    const timer = setTimeout(run, Math.min(remaining, 2_000_000_000));
    timer.unref();
    timers.set(sessionId, timer);
  };

  run();
};

const authorize = async ({ macAddress, sessionId, sessionTimeout }) => {
  const mac = normalizeMac(macAddress);
  const timeout = Math.floor(Number(sessionTimeout));
  if (!mac || !validSessionId(sessionId) || !Number.isFinite(timeout) || timeout <= 0 || timeout > 31 * 24 * 60 * 60) {
    throw new Error('Invalid authorize request');
  }

  const expiresAtSeconds = Math.floor(Date.now() / 1000) + timeout;
  const bindings = await listBindings();
  const sameSession = bindings.find((entry) => parseWifiPayComment(entry.comment)?.sessionId === sessionId);

  // Remove stale WiFi Pay bypass entries for the same MAC before creating/reusing this session.
  for (const entry of bindings) {
    const owned = parseWifiPayComment(entry.comment);
    if (owned && owned.sessionId !== sessionId && normalizeMac(entry['mac-address']) === mac) {
      await deleteRouterRecord('ip/hotspot/ip-binding', entry['.id']);
    }
  }

  const payload = {
    'mac-address': mac,
    type: 'bypassed',
    server: ROUTEROS_HOTSPOT_SERVER,
    comment: wifiPayComment(sessionId, expiresAtSeconds),
  };

  let binding;
  if (sameSession?.['.id']) {
    binding = await routerRequest(`ip/hotspot/ip-binding/${encodeURIComponent(sameSession['.id'])}`, {
      method: 'PATCH',
      body: payload,
    });
  } else {
    binding = await routerRequest('ip/hotspot/ip-binding', { method: 'PUT', body: payload });
  }

  // Force RouterOS to re-evaluate this client's HotSpot state after the bypass rule changes.
  await removeActiveLoginsForMac(mac);
  scheduleExpiry(sessionId, mac, expiresAtSeconds);

  return {
    success: true,
    message: 'MikroTik HotSpot access authorized',
    bindingId: binding?.['.id'] || sameSession?.['.id'] || null,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  };
};

const disconnect = async ({ macAddress, sessionId }) => {
  const mac = normalizeMac(macAddress);
  if (!mac || !validSessionId(sessionId)) throw new Error('Invalid disconnect request');
  const removedBindings = await removeSessionBindings(sessionId, mac);
  await removeActiveLoginsForMac(mac);
  return { success: true, message: 'MikroTik HotSpot access removed', removedBindings };
};

const readJsonBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let bytes = 0;
  req.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      reject(new Error('Request body too large'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
    } catch {
      reject(new Error('Invalid JSON body'));
    }
  });
  req.on('error', reject);
});

const cleanupExistingBindings = async () => {
  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const bindings = await listBindings();
    for (const entry of bindings) {
      const owned = parseWifiPayComment(entry.comment);
      if (!owned) continue;
      const mac = normalizeMac(entry['mac-address']);
      if (owned.expiresAtSeconds <= nowSeconds) {
        await deleteRouterRecord('ip/hotspot/ip-binding', entry['.id']);
        if (mac) await removeActiveLoginsForMac(mac);
      } else if (mac) {
        scheduleExpiry(owned.sessionId, mac, owned.expiresAtSeconds);
      }
    }
  } catch (error) {
    console.error('Startup RouterOS reconciliation failed:', error.message);
  }
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { ok: true, service: 'wifi-pay-mikrotik-controller' });
    }

    if (req.method !== 'POST' || !['/', '/network'].includes(req.url || '')) {
      return json(res, 404, { success: false, message: 'Not found' });
    }

    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!safeEqual(token, CONTROLLER_TOKEN)) return json(res, 401, { success: false, message: 'Unauthorized' });

    const body = await readJsonBody(req);
    if (body.action === 'authorize') return json(res, 200, await authorize(body));
    if (body.action === 'disconnect') return json(res, 200, await disconnect(body));
    return json(res, 400, { success: false, message: 'Unsupported action' });
  } catch (error) {
    console.error('Controller request failed:', error.message);
    return json(res, 500, { success: false, message: error.message || 'Controller request failed' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WiFi Pay MikroTik controller listening on port ${PORT}`);
  cleanupExistingBindings();
});

const shutdown = () => {
  for (const timer of timers.values()) clearTimeout(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
