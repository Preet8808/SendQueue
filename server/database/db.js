const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const defaultStorageDir = path.resolve(__dirname, '../../storage');
const resolvedDbPath = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : path.join(defaultStorageDir, 'sendqueue.db');
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
