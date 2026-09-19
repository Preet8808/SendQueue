const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || './storage/sendqueue.db';
const resolvedDbPath = path.resolve(process.cwd(), dbPath);
const storageDir = path.dirname(resolvedDbPath);

if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

const db = new DatabaseSync(resolvedDbPath);

// Enable WAL mode and foreign key constraints for maximum performance and data integrity
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
}

// Auto-initialize schema on startup
initSchema();

module.exports = {
  db,
  initSchema
};
