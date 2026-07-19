const https = require('https');
const http = require('http');
const { URL } = require('url');

async function notifyN8n(event, orderData, previousStatus = null) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL || '';
  const isTest = process.env.NODE_ENV === 'test';
  if (!webhookUrl) {
    if (isTest) return false;
    throw new Error('N8N_WEBHOOK_URL is required');
  }
  const payload = JSON.stringify({ event, order: orderData, previousStatus, timestamp: new Date().toISOString() });
  try {
    const url = new URL(webhookUrl);
    const transport = url.protocol === 'https:' ? https : http;
    return await new Promise((resolve, reject) => {
      const req = transport.request(url, { method: 'POST', headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}, timeout:10000 }, res => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(true);
        else reject(new Error(`n8n webhook failed with status ${res.statusCode}`));
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('n8n webhook timeout')));
      req.end(payload);
    });
  } catch (error) {
    if (isTest) return false;
    throw error;
  }
}
module.exports = { notifyN8n };
