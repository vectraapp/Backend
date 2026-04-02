/**
 * Vectra - Paystack Utility Functions
 */

const axios = require('axios');
const { PAYSTACK_SECRET_KEY, PAYSTACK_BASE_URL } = require('../config/paystack');

const paystackApi = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
});

/**
 * Initialize a payment transaction
 */
async function initializePayment({ email, amount, reference, callbackUrl, metadata }) {
  try {
    const response = await paystackApi.post('/transaction/initialize', {
      email,
      amount: Math.round(amount * 100), // Convert to kobo
      reference,
      callback_url: callbackUrl,
      metadata
    });

    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Verify a payment transaction
 */
async function verifyPayment(reference) {
  try {
    const response = await paystackApi.get(`/transaction/verify/${reference}`);

    return {
      success: response.data.data.status === 'success',
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Get list of Nigerian banks
 */
async function getBanks() {
  try {
    const response = await paystackApi.get('/bank?country=nigeria');

    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Verify bank account number
 */
async function verifyAccountNumber(accountNumber, bankCode) {
  try {
    const response = await paystackApi.get(
      `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
    );

    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Create a transfer recipient
 */
async function createTransferRecipient({ name, accountNumber, bankCode }) {
  try {
    const response = await paystackApi.post('/transferrecipient', {
      type: 'nuban',
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: 'NGN'
    });

    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Initiate a transfer
 */
async function initiateTransfer({ amount, recipientCode, reason, reference }) {
  try {
    const response = await paystackApi.post('/transfer', {
      source: 'balance',
      amount: Math.round(amount * 100), // Convert to kobo
      recipient: recipientCode,
      reason,
      reference
    });

    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Get transfer status
 */
async function getTransferStatus(transferCode) {
  try {
    const response = await paystackApi.get(`/transfer/${transferCode}`);

    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Generate a unique payment reference
 */
function generateReference(prefix = 'PQ') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
}

module.exports = {
  initializePayment,
  verifyPayment,
  getBanks,
  verifyAccountNumber,
  createTransferRecipient,
  initiateTransfer,
  getTransferStatus,
  generateReference
};
