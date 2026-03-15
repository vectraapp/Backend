/**
 * PastQuest - Withdrawal Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');
const paystack = require('../utils/paystack');
const { sendWithdrawalProcessed } = require('../utils/email');

/**
 * Get Nigerian banks list
 */
async function getBanks(req, res, next) {
  try {
    const result = await paystack.getBanks();

    if (!result.success) {
      throw new ApiError(400, result.error);
    }

    res.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Verify bank account
 */
async function verifyAccount(req, res, next) {
  try {
    const { accountNumber, bankCode } = req.body;

    if (!accountNumber || !bankCode) {
      throw new ApiError(400, 'Account number and bank code are required');
    }

    const result = await paystack.verifyAccountNumber(accountNumber, bankCode);

    if (!result.success) {
      throw new ApiError(400, result.error);
    }

    res.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Request withdrawal (contributor)
 */
async function requestWithdrawal(req, res, next) {
  try {
    const userId = req.user.id;
    const { points, accountNumber, accountName, bankCode, bankName } = req.body;

    if (!points || !accountNumber || !accountName || !bankCode || !bankName) {
      throw new ApiError(400, 'Missing required fields');
    }

    const { data, error } = await supabaseAdmin.rpc('request_withdrawal', {
      p_user_id: userId,
      p_points: parseInt(points),
      p_account_number: accountNumber,
      p_account_name: accountName,
      p_bank_code: bankCode,
      p_bank_name: bankName
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    if (!data.success) {
      throw new ApiError(400, data.message);
    }

    res.json({
      success: true,
      message: 'Withdrawal request submitted',
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user's withdrawals
 */
async function getMyWithdrawals(req, res, next) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('withdrawals')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Get pending withdrawals (admin)
 */
async function getPendingWithdrawals(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from('withdrawals')
      .select('*, user:users!user_id(email, display_name)', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Process withdrawal (admin)
 */
async function processWithdrawal(req, res, next) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    // Get withdrawal details
    const { data: withdrawal, error: fetchError } = await supabaseAdmin
      .from('withdrawals')
      .select('*, user:users!user_id(email)')
      .eq('id', id)
      .eq('status', 'pending')
      .single();

    if (fetchError || !withdrawal) {
      throw new ApiError(404, 'Withdrawal not found or already processed');
    }

    // Update status to processing
    await supabaseAdmin
      .from('withdrawals')
      .update({ status: 'processing' })
      .eq('id', id);

    // Create transfer recipient on Paystack
    const recipientResult = await paystack.createTransferRecipient({
      name: withdrawal.account_name,
      accountNumber: withdrawal.account_number,
      bankCode: withdrawal.bank_code
    });

    if (!recipientResult.success) {
      // Revert status
      await supabaseAdmin
        .from('withdrawals')
        .update({ status: 'pending' })
        .eq('id', id);

      throw new ApiError(400, `Failed to create recipient: ${recipientResult.error}`);
    }

    // Initiate transfer
    const reference = paystack.generateReference('WD');
    const transferResult = await paystack.initiateTransfer({
      amount: withdrawal.net_amount,
      recipientCode: recipientResult.data.recipient_code,
      reason: `PastQuest withdrawal - ${id}`,
      reference
    });

    if (!transferResult.success) {
      // Revert status and update failure reason
      await supabaseAdmin
        .from('withdrawals')
        .update({
          status: 'failed',
          failure_reason: transferResult.error
        })
        .eq('id', id);

      throw new ApiError(400, `Transfer failed: ${transferResult.error}`);
    }

    // Update withdrawal with transfer details
    await supabaseAdmin
      .from('withdrawals')
      .update({
        paystack_transfer_code: transferResult.data.transfer_code,
        paystack_reference: reference,
        processed_by: adminId,
        processed_at: new Date().toISOString()
      })
      .eq('id', id);

    // Complete withdrawal (the function updates contributor stats)
    const { data: completeData } = await supabaseAdmin.rpc('complete_withdrawal', {
      p_withdrawal_id: id,
      p_admin_id: adminId,
      p_transfer_code: transferResult.data.transfer_code,
      p_reference: reference
    });

    // Send notification email
    if (withdrawal.user?.email) {
      sendWithdrawalProcessed(withdrawal.user.email, {
        amount: withdrawal.net_amount,
        accountName: withdrawal.account_name,
        bankName: withdrawal.bank_name
      }).catch(console.error);
    }

    res.json({
      success: true,
      message: 'Withdrawal processed successfully',
      data: {
        transferCode: transferResult.data.transfer_code,
        reference
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Reject withdrawal (admin)
 */
async function rejectWithdrawal(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    if (!reason) {
      throw new ApiError(400, 'Rejection reason is required');
    }

    // Get withdrawal details
    const { data: withdrawal, error: fetchError } = await supabaseAdmin
      .from('withdrawals')
      .select('*')
      .eq('id', id)
      .eq('status', 'pending')
      .single();

    if (fetchError || !withdrawal) {
      throw new ApiError(404, 'Withdrawal not found or already processed');
    }

    // Update withdrawal status
    await supabaseAdmin
      .from('withdrawals')
      .update({
        status: 'cancelled',
        failure_reason: reason,
        processed_by: adminId,
        processed_at: new Date().toISOString()
      })
      .eq('id', id);

    // Refund points to contributor
    await supabaseAdmin
      .from('contributor_stats')
      .update({
        total_points: supabaseAdmin.raw(`total_points + ${withdrawal.points_redeemed}`),
        available_balance: supabaseAdmin.raw(`available_balance + ${withdrawal.amount}`),
        pending_withdrawal: supabaseAdmin.raw(`pending_withdrawal - ${withdrawal.net_amount}`)
      })
      .eq('user_id', withdrawal.user_id);

    res.json({
      success: true,
      message: 'Withdrawal rejected and points refunded'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all withdrawals (admin)
 */
async function getAllWithdrawals(req, res, next) {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('withdrawals')
      .select('*, user:users!user_id(email, display_name)', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBanks,
  verifyAccount,
  requestWithdrawal,
  getMyWithdrawals,
  getPendingWithdrawals,
  processWithdrawal,
  rejectWithdrawal,
  getAllWithdrawals
};
