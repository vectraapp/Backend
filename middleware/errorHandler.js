/**
 * Vectra - Error Handler Middleware
 */

/**
 * Custom API Error class
 */
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

/**
 * Not Found handler
 */
function notFound(req, res, next) {
  const error = new ApiError(404, `Route ${req.originalUrl} not found`);
  next(error);
}

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  const ts = new Date().toISOString();
  console.error(`\n[${ts}] ERROR ${req.method} ${req.originalUrl}`);
  console.error(`  Status : ${err.statusCode || 500}`);
  console.error(`  Message: ${err.message}`);
  if (err.details) console.error(`  Details:`, err.details);
  if (err.cause) console.error(`  Cause  :`, err.cause?.message || err.cause);
  if (err.stack) console.error(`  Stack  :\n${err.stack.split('\n').slice(1, 4).join('\n')}`);

  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Handle Supabase errors
  if (err.code && err.message) {
    if (err.code === 'PGRST116') {
      statusCode = 404;
      message = 'Resource not found';
    } else if (err.code === '23505') {
      statusCode = 409;
      message = 'Resource already exists';
    } else if (err.code === '23503') {
      statusCode = 400;
      message = 'Invalid reference';
    }
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && !err.isOperational) {
    message = 'Something went wrong';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err.details
    })
  });
}

module.exports = {
  ApiError,
  notFound,
  errorHandler
};
