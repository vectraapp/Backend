/**
 * Vectra - Route Index
 */

const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const paymentRoutes = require('./paymentRoutes');
const questionRoutes = require('./questionRoutes');
const withdrawalRoutes = require('./withdrawalRoutes');
const dataRoutes = require('./dataRoutes');
const adminRoutes = require('./adminRoutes');
const promoRoutes = require('./promoRoutes');
const lectureRoutes = require('./lectureRoutes');
const aiRoutes = require('./aiRoutes');
const shareRoutes = require('./shareRoutes');
const uploadRoutes = require('./uploadRoutes');
const courseRoutes = require('./courseRoutes');
const groupRoutes = require('./groupRoutes');
const bookmarkRoutes = require('./bookmarkRoutes');
const streakRoutes = require('./streakRoutes');
const leaderboardRoutes = require('./leaderboardRoutes');
const examRoutes = require('./examRoutes');
const recentlyViewedRoutes = require('./recentlyViewedRoutes');

function setupRoutes(app) {
  // API versioning
  const apiPrefix = '/api/v1';

  // Mount routes
  app.use(`${apiPrefix}/auth`, authRoutes);
  app.use(`${apiPrefix}/users`, userRoutes);
  app.use(`${apiPrefix}/payments`, paymentRoutes);
  app.use(`${apiPrefix}/questions`, questionRoutes);
  app.use(`${apiPrefix}/withdrawals`, withdrawalRoutes);
  app.use(`${apiPrefix}/data`, dataRoutes);
  app.use(`${apiPrefix}/admin`, adminRoutes);
  app.use(`${apiPrefix}/promo`, promoRoutes);
  app.use(`${apiPrefix}/lectures`, lectureRoutes);
  app.use(`${apiPrefix}/ai`, aiRoutes);
  app.use(`${apiPrefix}/shares`, shareRoutes);
  app.use(`${apiPrefix}/uploads`, uploadRoutes);
  app.use(`${apiPrefix}/courses`, courseRoutes);
  app.use(`${apiPrefix}/groups`, groupRoutes);
  app.use(`${apiPrefix}/bookmarks`, bookmarkRoutes);
  app.use(`${apiPrefix}/streaks`, streakRoutes);
  app.use(`${apiPrefix}/leaderboard`, leaderboardRoutes);
  app.use(`${apiPrefix}/exams`, examRoutes);
  app.use(`${apiPrefix}/recently-viewed`, recentlyViewedRoutes);

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      success: true,
      message: 'Vectra API is running',
      timestamp: new Date().toISOString()
    });
  });

  // API info
  app.get(apiPrefix, (req, res) => {
    res.json({
      success: true,
      message: 'Welcome to Vectra API',
      version: '1.0.0',
      endpoints: {
        auth: `${apiPrefix}/auth`,
        users: `${apiPrefix}/users`,
        payments: `${apiPrefix}/payments`,
        questions: `${apiPrefix}/questions`,
        withdrawals: `${apiPrefix}/withdrawals`,
        data: `${apiPrefix}/data`,
        admin: `${apiPrefix}/admin`,
        promo: `${apiPrefix}/promo`,
        lectures: `${apiPrefix}/lectures`,
        ai: `${apiPrefix}/ai`,
        shares: `${apiPrefix}/shares`,
        uploads: `${apiPrefix}/uploads`,
        courses: `${apiPrefix}/courses`,
        groups: `${apiPrefix}/groups`,
        bookmarks: `${apiPrefix}/bookmarks`,
        streaks: `${apiPrefix}/streaks`,
        leaderboard: `${apiPrefix}/leaderboard`,
        exams: `${apiPrefix}/exams`,
        recently_viewed: `${apiPrefix}/recently-viewed`
      }
    });
  });
}

module.exports = { setupRoutes };
