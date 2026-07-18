/** POST /api/pilah/order/:id/proof */
const { validateProof } = require('../../../lib/validate');
const { submitProof, getOrder } = require('../../../lib/store');
const { notifyN8n } = require('../../../lib/n8n');
const crypto = require('crypto');
const { checkRateLimit } = require('../../../lib/rateLimit');
const { setCorsAndSecHeaders } = require('../../../lib/cors');
function ip(req) { const f=req.headers['x-forwarded-for']; return f ? f.split(',')[0].trim() : (req.headers['x-real-ip'] || '127.0.0.1'); }
function tokenOk(order, supplied) { if (!order || !order.access_token || !supplied) return false; const a=Buffer.from(order.access_token); const b=Buffer.from(String(supplied)); return a.length===b.length && crypto.timingSafeEqual(a,b); }
module.exports = async function handler(req,res) {
 setCorsAndSecHeaders(res,{methods:'POST,OPTIONS',allowedHeaders:'Content-Type,Authorization'});
 if(req.method==='OPTIONS') return res.status(204).end();
 if(req.method!=='POST') return res.status(405).json({success:false,error:'Method not allowed'});
 const rl=checkRateLimit(`proof:${ip(req)}`,15); res.setHeader('X-RateLimit-Remaining',String(rl.remaining)); if(!rl.allowed) return res.status(429).json({success:false,error:'Terlalu banyak request'});
 const length=Number(req.headers['content-length']||0); if(length>7*1024*1024) return res.status(413).json({success:false,error:'Body terlalu besar'});
 const orderId=String(req.query?.id||''); if(!/^[A-Za-z0-9-]{8,80}$/.test(orderId)) return res.status(400).json({success:false,error:'Order ID tidak valid'});
 const existing=getOrder(orderId); if(!existing) return res.status(404).json({success:false,error:'Order tidak ditemukan'});
 const supplied=req.query?.token || String(req.headers.authorization||'').replace(/^Bearer\s+/i,''); if(!tokenOk(existing,supplied)) return res.status(403).json({success:false,error:'Akses order tidak valid'});
 const validation=validateProof(req.body,orderId); if(!validation.valid) return res.status(400).json({success:false,errors:validation.errors});
 const result=submitProof(orderId,validation.data); if(result.error) return res.status(result.error.includes('sudah')?409:400).json({success:false,error:result.error});
 const order=result.order;
 try { await notifyN8n('PROOF_SUBMITTED',{order_id:order.order_id,nama_lengkap:order.nama_lengkap,whatsapp:order.whatsapp,email:order.email,sku:order.sku,harga:order.harga,status:order.status,bukti_bayar:{filename:validation.data.filename,mimeType:validation.data.mimeType,sizeBytes:validation.data.sizeBytes,base64:validation.data.base64||null},bukti_bayar_uploaded_at:order.bukti_bayar_uploaded_at}); }
 catch { return res.status(503).json({success:false,error:'Sistem pencatatan sedang bermasalah. Coba lagi.'}); }
 return res.status(200).json({success:true,data:{order_id:order.order_id,status:order.status,bukti_bayar_uploaded_at:order.bukti_bayar_uploaded_at}});
};
