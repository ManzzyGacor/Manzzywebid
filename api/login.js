import dbConnect from './connect.js';
import User from './models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_nexus_galaxy'; // Simpan di ENV Vercel nanti

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await dbConnect();
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: 'User tidak ditemukan' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ error: 'Password salah' });

  // Cek Expired (Kecuali Owner)
  if (user.role !== 'owner' && user.role !== 'member' && user.expiredDate) {
    if (new Date() > new Date(user.expiredDate)) {
        // Jika expired, turunkan paksa jadi member
        user.role = 'member';
        user.expiredDate = null;
        await user.save();
    }
  }

  // Buat Token
  const token = jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  res.status(200).json({ 
    token, 
    username: user.username, 
    role: user.role,
    expiry: user.expiredDate ? new Date(user.expiredDate).toDateString() : 'Lifetime/None'
  });
}

