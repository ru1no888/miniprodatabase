
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = process.env.API_PORT || process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mini_secret';

app.use(cors());
app.use(express.json());

const ok = (res, data) => res.json({ ok: true, data });
const bad = (res, msg='Bad request', code=400) => res.status(code).json({ ok: false, error: msg });

const auth = (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return bad(res, 'Unauthorized', 401);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return bad(res, 'Unauthorized', 401);
  }
};

app.get('/api/health', async (req, res) => {
  try {
    const [r] = await pool.query('SELECT 1 as ok');
    return ok(res, { status: 'up', db: r[0].ok === 1 });
  } catch (e) {
    return bad(res, e.message, 500);
  }
});

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password || password.length < 6) return bad(res, 'ข้อมูลไม่ครบหรือรหัสสั้น');
    const username = email.split('@')[0].slice(0, 64);

    const [dupe] = await pool.query('SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1', [email, username]);
    if (dupe.length) return bad(res, 'อีเมลหรือผู้ใช้นี้ถูกใช้แล้ว');

    const pass_hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      'INSERT INTO users (username, email, pass_hash, display_name) VALUES (?, ?, ?, ?)',
      [username, email, pass_hash, name]
    );
    return ok(res, { id: r.insertId, name, email, username });
  } catch (e) {
    return bad(res, e.message, 500);
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const [rows] = await pool.query('SELECT id, username, display_name, pass_hash, role, is_active FROM users WHERE email = ? LIMIT 1', [email]);
    const u = rows[0];
    if (!u) return bad(res, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401);
    if (!u.is_active) return bad(res, 'บัญชีถูกระงับ', 403);
    const okPass = await bcrypt.compare(password || '', u.pass_hash);
    if (!okPass) return bad(res, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401);

    const token = jwt.sign({ uid: u.id, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [u.id]);
    return ok(res, { token, user: { id: u.id, name: u.display_name || u.username, email } });
  } catch (e) {
    return bad(res, e.message, 500);
  }
});

// Categories
app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM categories ORDER BY name ASC');
    return ok(res, rows);
  } catch (e) {
    return bad(res, e.message, 500);
  }
});

// Threads list
app.get('/api/threads', async (req, res) => {
  try {
    const { category_id, q, sort } = req.query;
    let sql = `
      SELECT t.id, t.title, t.body, t.created_at, t.updated_at, t.is_deleted,
             u.id AS user_id, COALESCE(u.display_name, u.username) AS author,
             c.id AS category_id, c.name AS category,
             (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id AND p.is_deleted = 0) AS comment_count
      FROM threads t
      JOIN users u ON u.id = t.user_id
      JOIN categories c ON c.id = t.category_id
      WHERE t.is_deleted = 0
    `;
    const params = [];
    if (category_id) { sql += ' AND t.category_id = ?'; params.push(category_id); }
    if (q) { sql += ' AND (t.title LIKE ? OR t.body LIKE ?)'; params.push('%'+q+'%', '%'+q+'%'); }
    if (sort === 'active') {
      sql += ' ORDER BY GREATEST(t.created_at, (SELECT IFNULL(MAX(p.created_at), t.created_at) FROM posts p WHERE p.thread_id = t.id)) DESC';
    } else if (sort === 'popular') {
      sql += ' ORDER BY comment_count DESC, t.created_at DESC';
    } else {
      sql += ' ORDER BY t.created_at DESC';
    }
    const [rows] = await pool.query(sql, params);
    return ok(res, rows);
  } catch (e) {
    return bad(res, e.message, 500);
  }
});

// Thread detail
app.get('/api/threads/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[t]] = await pool.query(`
      SELECT t.id, t.title, t.body, t.created_at, t.updated_at, t.is_deleted,
             u.id AS user_id, COALESCE(u.display_name, u.username) AS author,
             c.id AS category_id, c.name AS category
      FROM threads t
      JOIN users u ON u.id = t.user_id
      JOIN categories c ON c.id = t.category_id
      WHERE t.id = ?
    `, [id]);
    if (!t || t.is_deleted) return bad(res, 'ไม่พบกระทู้', 404);

    const [comments] = await pool.query(`
      SELECT p.id, p.body, p.created_at,
             u.id AS user_id, COALESCE(u.display_name, u.username) AS author
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.thread_id = ? AND p.is_deleted = 0
      ORDER BY p.created_at ASC
    `, [id]);
    return ok(res, { thread: t, comments });
  } catch (e) {
    return bad(res, e.message, 500);
  }
});

// Create thread (auth)
app.post('/api/threads', auth, async (req, res) => {
  try {
    const { category_id, title, body } = req.body || {};
    if (!category_id || !title || !body) return bad(res, 'ข้อมูลไม่ครบ');
    const uid = req.user.uid;
    const [r] = await pool.query(`
      INSERT INTO threads (user_id, category_id, title, body) VALUES (?, ?, ?, ?)
    `, [uid, category_id, title, body]);
    return ok(res, { id: r.insertId });
  } catch (e) {
    return bad(res, e.message, 500);
  }
});

// Add comment (auth)
app.post('/api/threads/:id/comments', auth, async (req, res) => {
  try {
    const thread_id = Number(req.params.id);
    const { body } = req.body || {};
    if (!body) return bad(res, 'กรอกเนื้อหา');
    const uid = req.user.uid;
    const [r] = await pool.query(`
      INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)
    `, [thread_id, uid, body]);
    return ok(res, { id: r.insertId });
  } catch (e) {
    return bad(res, e.message, 500);
  }
});

app.listen(PORT, () => {
  console.log(`[api] listening on http://0.0.0.0:${PORT}`);
});
