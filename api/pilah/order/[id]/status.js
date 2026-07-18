/** GET /api/pilah/order/:id/status */
const { getOrder, getOrderStatus } = require('../../../lib/store');
const crypto = require('crypto');
const { checkRateLimit } = require('../../../lib/rateLimit');
const { setCorsAndSecHeaders } = require('../../../lib/cors');
function ip(req) { const f=req.headers['x-forwarded-for']; return f ? f.split(',')[0].trim() : (req.headers['x-real-ip'] || '127.0.0.1'); }
function tokenOk(order, supplied) { if (!order || !order.access_token || !supplied) return false; const a=Buffer.from(order.access_token); const b=Buffer.from(String(supplied)); return a.length===b.length && crypto.timingSafeEqual(a,b); }
module.exports = async function handler(req,res) {
 setCorsAndSecHeaders(res,{methods:'GET,OPTIONS',allowedHeaders:'Content-Type,Authorization'});
 if(req.method==='OPTIONS') return res.status(204).end();
 if(req.method!=='GET') return res.status(405).json({success:false,error:'Method not allowed'});
 const rl=checkRateLimit(`status:${ip(req)}`,30); res.setHeader('X-RateLimit-Remaining',String(rl.remaining)); if(!rl.allowed) return res.status(429).json({success:false,error:'Terlalu banyak request'});
 const orderId=String(req.query?.id||''); if(!/^[A-Za-z0-9-]{8,80}$/.test(orderId)) return res.status(400).json({success:false,error:'Order ID tidak valid'});
 const order=getOrder(orderId); if(!order) return res.status(404).json({success:false,error:'Order tidak ditemukan'});
 const supplied=req.query?.token || String(req.headers.authorization||'').replace(/^Bearer\s+/i,''); if(!tokenOk(order,supplied)) return res.status(403).json({success:false,error:'Akses order tidak valid'});
 return res.status(200).json({success:true,data:getOrderStatus(orderId)});
};
