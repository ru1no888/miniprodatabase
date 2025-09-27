
import mysql from 'mysql2/promise';

export const pool = await mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'mini_forum_user',
  password: process.env.DB_PASS || 'minipass',
  database: process.env.DB_NAME || 'mini_forum',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});
