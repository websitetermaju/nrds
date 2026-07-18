/**
 * Pilah MVP — n8n webhook caller
 *
 * Reads N8N_WEBHOOK_URL from environment.
 * Fires-and-forget: failures logged but do not block the API response.
 *
 * Payload structure sent to n8n:
 * {
 *   event: 'ORDER_CREATED' | 'PROOF_SUBMITTED' | 'ORDER_STATUS_CHANGED',
 *   order: { ...orderData },
 *   previousStatus: '...',
 *   timestamp: '...'
 * }
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';

/**
 * Fire n8n webhook. Returns Promise that resolves true/false.
 */
async function notifyN8n(event, orderData, previousStatus = null) {
    if (!N8N_WEBHOOK_URL) {
      if (process.env.NODE_ENV === 'production') throw new Error('N8N_WEBHOOK_URL is required in production');
      return false;
    }

  const payload = JSON.stringify({
    event,
    order: orderData,
    previousStatus,
    timestamp: new Date().toISOString(),
  });

  try {
    const url = new URL(N8N_WEBHOOK_URL);
    const transport = url.protocol === 'https:' ? https : http;

    return await new Promise((resolve) => {
      const req = transport.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
      }, (res) => {
        // Consume response body
        res.resume();
                if (process.env.NODE_ENV === 'production' && (res.statusCode < 200 || res.statusCode >= 300)) {
                  throw new Error(`n8n webhook failed with status ${res.statusCode}`);
                }
                resolve(res.statusCode >= 200 && res.statusCode < 300);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.write(payload);
      req.end();
    });
  } catch {
    return false;
  }
}

module.exports = { notifyN8n };
