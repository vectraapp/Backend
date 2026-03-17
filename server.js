/**
 * PastQuest - Main Server Entry Point
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { setupRoutes } = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Initialize Express app
const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : [
        'http://localhost:5173',  // Frontend (student app)
        'http://localhost:5174',  // Admin dashboard
        'http://localhost:5175',  // Contributors dashboard
        'http://localhost:3000',
        'exp://172.20.182.66:8081',
        ' http://localhost:8081'
      ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// Request logging
if (process.env.NODE_ENV !== 'test') {
  morgan.token('body', (req) => {
    if (!req.body || Object.keys(req.body).length === 0) return '';
    const safe = { ...req.body };
    if (safe.password) safe.password = '***';
    return JSON.stringify(safe);
  });
  const fmt = process.env.NODE_ENV === 'production'
    ? 'combined'
    : ':method :url :status :response-time ms :body';
  app.use(morgan(fmt));
}

// Compression
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX || 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.'
    });
  }
});
app.use('/api/v1/auth/', authLimiter);

// Body parsing middleware
// Note: Raw body for webhook is handled in paymentRoutes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Setup routes
setupRoutes(app);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║   🎓 PastQuest API Server                          ║
║                                                    ║
║   Server running on port ${PORT}                      ║
║   Environment: ${process.env.NODE_ENV || 'development'}                    ║
║                                                    ║
║   Endpoints:                                       ║
║   - Health: http://localhost:${PORT}/health            ║
║   - API:    http://localhost:${PORT}/api/v1            ║
║                                                    ║
╚════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('\n[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('\n[UNCAUGHT EXCEPTION]', err);
  process.exit(1);
});

module.exports = app;
