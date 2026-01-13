import dbConnect from './connect.js';
import User from './models/User.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_nexus_galaxy';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Verifikasi siapa yang request (Reseller/Owner?)
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let requester;
  try {
    requester = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token invalid' });
  }

  const { targetUsername, newRole } = req.body;
  await dbConnect();

  // 2. Cek Aturan Hierarki (Rules)
  // Owner: Bebas
  // Reseller+: Bisa add VIP & Reseller biasa
  // Reseller: Cuma bisa add VIP
  
  if (requester.username === targetUsername) {
      return res.status(403).json({ error: "Tidak bisa mengubah akun sendiri via panel!" });
  }

  let allowed = false;
  if (requester.role === 'owner') allowed = true;
  else if (requester.role === 'reseller+' && ['vip', 'vvip', 'reseller'].includes(newRole)) allowed = true;
  else if (requester.role === 'reseller' && ['vip', 'vvip'].includes(newRole)) allowed = true;

  if (!allowed) {
      return res.status(403).json({ error: `Role ${requester.role} tidak diizinkan membuat ${newRole}` });
  }

  // 3. Eksekusi Perubahan
  const targetUser = await User.findOne({ username: targetUsername });
  if (!targetUser) return res.status(404).json({ error: 'Target user tidak ditemukan' });

  // Set Expired 30 Hari dari sekarang
  const next30Days = new Date();
  next30Days.setDate(next30Days.getDate() + 30);

  targetUser.role = newRole;
  targetUser.expiredDate = next30Days;
  targetUser.createdBy = requester.username;

  await targetUser.save();

  res.status(200).json({ message: `Sukses! ${targetUsername} kini menjadi ${newRole} (Exp: 30 Hari)` });
}

