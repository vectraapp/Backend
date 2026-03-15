/**
 * PastQuest - Paystack Configuration
 */

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

if (!PAYSTACK_SECRET_KEY) {
  console.warn('Warning: PAYSTACK_SECRET_KEY not set. Payment features will not work.');
}

module.exports = {
  PAYSTACK_SECRET_KEY,
  PAYSTACK_PUBLIC_KEY,
  PAYSTACK_BASE_URL
};
