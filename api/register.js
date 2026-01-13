import dbConnect from './connect.js';
import User from './models/User.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await dbConnect();
  const { username, password } = req.body;

  if (!username || !password) return res.status(400).json({ error: 'Data tidak lengkap' });

  // Cek user ganda
  const existing = await User.findOne({ username });
  if (existing) return res.status(400).json({ error: 'Username sudah dipakai' });

  // Hash password biar aman
  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = new User({
    username,
    password: hashedPassword,
    role: 'member',
    expiredDate: null
  });

  await newUser.save();
  res.status(201).json({ message: 'Registrasi Berhasil! Silahkan Login.' });
}

