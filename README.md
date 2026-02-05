# PastQuest Backend

Complete Express.js + Supabase backend for the PastQuest past questions platform.

## Architecture Overview

```
Backend/
├── src/
│   ├── config/                  # Configuration files
│   │   ├── supabase.js         # Supabase client setup
│   │   ├── paystack.js         # Paystack configuration
│   │   └── cloudinary.js       # Cloudinary configuration
│   ├── controllers/             # Route handlers
│   │   ├── authController.js   # Authentication
│   │   ├── userController.js   # User management
│   │   ├── paymentController.js # Payments & subscriptions
│   │   ├── questionController.js # Question uploads & management
│   │   ├── withdrawalController.js # Contributor withdrawals
│   │   ├── dataController.js   # Universities, courses, etc.
│   │   └── adminController.js  # Admin dashboard & analytics
│   ├── middleware/
│   │   ├── auth.js             # JWT authentication
│   │   └── errorHandler.js     # Error handling
│   ├── routes/                  # API routes
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── paymentRoutes.js
│   │   ├── questionRoutes.js
│   │   ├── withdrawalRoutes.js
│   │   ├── dataRoutes.js
│   │   ├── adminRoutes.js
│   │   └── index.js
│   ├── utils/                   # Helper utilities
│   │   ├── paystack.js         # Paystack API wrapper
│   │   ├── cloudinary.js       # Cloudinary upload helpers
│   │   └── email.js            # Email notifications
│   └── index.js                 # Server entry point
├── supabase/
│   └── migrations/              # Database migrations
│       ├── 00001_initial_schema.sql
│       ├── 00002_rls_policies.sql
│       ├── 00003_functions.sql
│       ├── 00004_triggers.sql
│       └── 00005_seed_data.sql
├── .env.example
├── package.json
└── README.md
```

## Features

### User Types

1. **Students (Users)**
   - Browse courses and past questions
   - Purchase subscriptions (level or course-based)
   - Access content with valid subscription
   - Take personal notes
   - 20% discount with .edu.ng email

2. **Contributors**
   - Upload past questions with images
   - Earn points for approved uploads (1 point = ₦15)
   - Request withdrawals to Nigerian bank accounts
   - Track upload statistics and earnings

3. **Admins**
   - Approve/reject uploaded questions
   - Process withdrawal requests
   - View platform analytics
   - Manage users and content

### Database Tables

- `users` - User profiles and authentication
- `universities` - Nigerian universities
- `faculties` - University faculties
- `departments` - Faculty departments
- `courses` - Department courses
- `past_questions` - Uploaded questions
- `textbooks` - Course textbooks
- `lecture_notes` - Course lecture notes
- `subscriptions` - User subscriptions
- `contributor_stats` - Contributor earnings/stats
- `withdrawals` - Withdrawal requests
- `transactions` - Payment transactions
- `user_notes` - Student personal notes
- `access_logs` - Content access analytics
- `admin_activity_logs` - Admin action logs
- `platform_settings` - Platform configuration

## Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and API keys

### 2. Configure Environment

```bash
cd Backend
cp .env.example .env
```

Fill in your environment variables:

```env
# Server
NODE_ENV=development
PORT=3001

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Paystack
PAYSTACK_SECRET_KEY=sk_test_xxx
PAYSTACK_PUBLIC_KEY=pk_test_xxx

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Resend (Email)
RESEND_API_KEY=re_xxx

# Frontend
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Database Migrations

**Option A: Using Supabase CLI (recommended)**

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
npm run db:push
```

**Option B: Manual SQL execution**

1. Go to Supabase Dashboard > SQL Editor
2. Run each migration file in order:
   - `00001_initial_schema.sql`
   - `00002_rls_policies.sql`
   - `00003_functions.sql`
   - `00004_triggers.sql`
   - `00005_seed_data.sql`

### 5. Configure Authentication

In Supabase Dashboard > Authentication > Providers:

1. Enable Email/Password
2. Enable Google OAuth
   - Add Google Client ID and Secret
   - Configure redirect URLs

### 6. Start the Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

Server runs at `http://localhost:3001`

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/signup` | Register new user |
| POST | `/api/v1/auth/signin` | Email/password login |
| POST | `/api/v1/auth/signin/google` | Google OAuth login |
| POST | `/api/v1/auth/signout` | Logout |
| GET | `/api/v1/auth/me` | Get current user |
| POST | `/api/v1/auth/refresh` | Refresh session |
| POST | `/api/v1/auth/password/reset` | Request password reset |
| PUT | `/api/v1/auth/password` | Update password |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/profile` | Get user profile |
| PUT | `/api/v1/users/profile` | Update profile |
| POST | `/api/v1/users/onboarding` | Complete onboarding |
| GET | `/api/v1/users/subscriptions` | Get user subscriptions |
| GET | `/api/v1/users/notes` | Get user notes |
| POST | `/api/v1/users/notes` | Save note |
| DELETE | `/api/v1/users/notes/:id` | Delete note |
| GET | `/api/v1/users/all` | Get all users (admin) |
| PUT | `/api/v1/users/:id/role` | Update user role (super admin) |

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/payments/initialize` | Initialize payment |
| GET | `/api/v1/payments/verify/:ref` | Verify payment |
| POST | `/api/v1/payments/webhook` | Paystack webhook |
| GET | `/api/v1/payments/transactions` | Get transactions |

### Questions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/questions` | Get questions (with filters) |
| GET | `/api/v1/questions/:id` | Get single question |
| POST | `/api/v1/questions/upload` | Upload question (contributor) |
| GET | `/api/v1/questions/contributor/uploads` | Get my uploads |
| GET | `/api/v1/questions/contributor/stats` | Get contributor stats |
| GET | `/api/v1/questions/admin/pending` | Get pending questions (admin) |
| POST | `/api/v1/questions/:id/approve` | Approve question (admin) |
| POST | `/api/v1/questions/:id/reject` | Reject question (admin) |
| DELETE | `/api/v1/questions/:id` | Delete question (admin) |

### Withdrawals

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/withdrawals/banks` | Get Nigerian banks |
| POST | `/api/v1/withdrawals/verify-account` | Verify bank account |
| POST | `/api/v1/withdrawals/request` | Request withdrawal |
| GET | `/api/v1/withdrawals/my-withdrawals` | Get my withdrawals |
| GET | `/api/v1/withdrawals/pending` | Get pending (admin) |
| GET | `/api/v1/withdrawals/all` | Get all (admin) |
| POST | `/api/v1/withdrawals/:id/process` | Process (admin) |
| POST | `/api/v1/withdrawals/:id/reject` | Reject (admin) |

### Data (Public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/data/universities` | Get all universities |
| GET | `/api/v1/data/universities/:id` | Get university with faculties |
| GET | `/api/v1/data/universities/:id/faculties` | Get faculties |
| GET | `/api/v1/data/faculties/:id` | Get faculty with departments |
| GET | `/api/v1/data/faculties/:id/departments` | Get departments |
| GET | `/api/v1/data/departments/:id` | Get department with courses |
| GET | `/api/v1/data/departments/:id/courses` | Get courses |
| GET | `/api/v1/data/courses/:id` | Get course details |
| GET | `/api/v1/data/courses/:id/textbooks` | Get textbooks |
| GET | `/api/v1/data/sessions` | Get academic sessions |
| GET | `/api/v1/data/settings` | Get platform settings |
| GET | `/api/v1/data/search/courses` | Search courses |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/dashboard` | Dashboard stats |
| GET | `/api/v1/admin/activity-logs` | Activity logs |
| GET | `/api/v1/admin/analytics/revenue` | Revenue analytics |
| GET | `/api/v1/admin/analytics/users` | User analytics |
| GET | `/api/v1/admin/analytics/content` | Content analytics |
| PUT | `/api/v1/admin/settings` | Update settings (super admin) |
| POST | `/api/v1/admin/expire-subscriptions` | Run expiry job |

## Pricing

- **Level Access**: ₦1,500 (10 months)
- **Course Access**: ₦500 (3 months)
- **Student Discount**: 20% off with .edu.ng email
- **Contributor Rate**: 1 point = ₦15
- **Minimum Withdrawal**: 50 points (₦750)
- **Withdrawal Fee**: ₦50

## Security

- JWT authentication via Supabase Auth
- Row Level Security (RLS) on all tables
- Rate limiting on API endpoints
- Helmet.js security headers
- CORS configuration
- Input validation
- Service role key for admin operations only

## Frontend Connection

```javascript
// Example: Fetch questions
const response = await fetch('http://localhost:3001/api/v1/questions?courseId=phy307', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
const data = await response.json();

// Example: Initialize payment
const response = await fetch('http://localhost:3001/api/v1/payments/initialize', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'level',
    departmentId: 'oau-physics',
    level: 'Part 3'
  })
});

// Example: Upload question (contributor)
const formData = new FormData();
formData.append('images', file);
formData.append('courseId', 'phy307');
formData.append('courseCode', 'PHY 307');
// ... other fields

const response = await fetch('http://localhost:3001/api/v1/questions/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});
```

## Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm run db:push    # Push database migrations
npm run db:reset   # Reset database
npm run db:seed    # Seed database
npm run lint       # Run ESLint
npm test           # Run tests
```

## Maintenance

### Expire Subscriptions

The `expireSubscriptions` endpoint can be called periodically (via cron job) to expire old subscriptions:

```bash
curl -X POST http://localhost:3001/api/v1/admin/expire-subscriptions \
  -H "Authorization: Bearer <admin_token>"
```

Or set up a Supabase scheduled function to call the database function directly:

```sql
SELECT public.expire_subscriptions();
```

### Backup

Enable Point-in-Time Recovery (PITR) in Supabase Dashboard for automatic backups.

## License

MIT
#   B a c k e n d  
 