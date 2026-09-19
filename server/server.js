const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { db } = require('./database/db');
const authRoutes = require('./routes/auth.routes');
const systemRoutes = require('./routes/system.routes');
const contactRoutes = require('./routes/contact.routes');
const groupRoutes = require('./routes/group.routes');
const templateRoutes = require('./routes/template.routes');
const settingsRoutes = require('./routes/settings.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Core Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../client/public')));
app.use('/css', express.static(path.join(__dirname, '../client/css')));
app.use('/js', express.static(path.join(__dirname, '../client/js')));

// Request logging in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', systemRoutes);

// Fallback for Single Page Views or Static HTML
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`
  ======================================================
  🚀 SendQueue Platform Running
  ======================================================
  • Local URL:     http://localhost:${PORT}
  • Health Check:  http://localhost:${PORT}/api/health
  • Environment:   ${process.env.NODE_ENV || 'development'}
  ======================================================
  `);
});

// Graceful Shutdown
function handleShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    try {
      db.close();
      console.log('Database connection closed.');
    } catch (e) {
      // Ignored if already closed
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = { app, server };
