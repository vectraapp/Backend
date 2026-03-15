/**
 * PastQuest - Payment Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');
const paystack = require('../utils/paystack');
const { sendPaymentConfirmation } = require('../utils/email');
const { applyPromoCode } = require('./promoController');

/**
 * Initialize payment
 */
async function initializePayment(req, res, next) {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const {
      type, // 'level' or 'course'
      universityId,
      facultyId,
      departmentId,
      level,
      courseId,
      courseCode,
      promoCode,    // Optional promo code
    } = req.body;

    if (!type || !universityId || !facultyId || !departmentId) {
      throw new ApiError(400, 'Missing required fields');
    }

    if (type === 'level' && !level) {
      throw new ApiError(400, 'Level is required for level subscription');
    }

    if (type === 'course' && !courseId) {
      throw new ApiError(400, 'Course ID is required for course subscription');
    }

    // Check if user already has active subscription
    const existingQuery = supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('expiry_date', new Date().toISOString());

    if (type === 'level') {
      existingQuery.eq('department_id', departmentId).eq('level', level);
    } else {
      existingQuery.eq('course_id', courseId);
    }

    const { data: existing } = await existingQuery.single();

    if (existing) {
      throw new ApiError(400, 'You already have an active subscription for this');
    }

    // Calculate price
    const isStudentEmail = req.user.profile.is_student_email;
    const { data: priceData } = await supabaseAdmin.rpc('calculate_subscription_price', {
      p_type: type,
      p_is_student_email: isStudentEmail
    });

    if (!priceData.success) {
      throw new ApiError(400, priceData.message);
    }

    // Apply promo code if provided
    let promoDiscount = 0;
    let appliedPromo = null;
    if (promoCode) {
      appliedPromo = await applyPromoCode(promoCode);
      if (appliedPromo) {
        if (appliedPromo.applies_to !== 'all' && appliedPromo.applies_to !== type) {
          appliedPromo = null; // Promo doesn't apply to this type
        } else if (appliedPromo.min_amount && priceData.final_price < appliedPromo.min_amount) {
          appliedPromo = null; // Below minimum amount
        } else {
          if (appliedPromo.discount_type === 'percentage') {
            promoDiscount = Math.round((priceData.final_price * appliedPromo.discount_value) / 100);
          } else {
            promoDiscount = appliedPromo.discount_value;
          }
          // Don't let discount exceed price
          if (promoDiscount > priceData.final_price) {
            promoDiscount = priceData.final_price;
          }
        }
      }
    }

    const finalAmount = priceData.final_price - promoDiscount;

    // Generate reference
    const reference = paystack.generateReference('PQ');

    // Initialize Paystack payment
    const callbackUrl = `${process.env.FRONTEND_URL}/payment/verify?reference=${reference}`;
    const metadata = {
      user_id: userId,
      type,
      university_id: universityId,
      faculty_id: facultyId,
      department_id: departmentId,
      level,
      course_id: courseId,
      course_code: courseCode,
      promo_code: appliedPromo ? appliedPromo.code : null,
      promo_discount: promoDiscount,
    };

    const result = await paystack.initializePayment({
      email: userEmail,
      amount: finalAmount,
      reference,
      callbackUrl,
      metadata
    });

    if (!result.success) {
      throw new ApiError(400, result.error);
    }

    // Create pending transaction record
    await supabaseAdmin.from('transactions').insert({
      user_id: userId,
      type: 'subscription',
      category: `${type}_access`,
      amount: finalAmount,
      payment_reference: reference,
      payment_gateway: 'paystack',
      status: 'pending',
      promo_code: appliedPromo ? appliedPromo.code : null,
      promo_code_id: appliedPromo ? appliedPromo.id : null,
      promo_discount: promoDiscount,
    });

    res.json({
      success: true,
      data: {
        authorizationUrl: result.data.authorization_url,
        reference,
        amount: finalAmount,
        originalPrice: priceData.base_price,
        studentDiscount: priceData.discount,
        promoCode: appliedPromo ? appliedPromo.code : null,
        promoDiscount,
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Verify payment
 */
async function verifyPayment(req, res, next) {
  try {
    const { reference } = req.body;

    if (!reference) {
      throw new ApiError(400, 'Payment reference is required');
    }

    // Verify with Paystack
    const result = await paystack.verifyPayment(reference);

    if (!result.success) {
      // Update transaction status
      await supabaseAdmin
        .from('transactions')
        .update({ status: 'failed' })
        .eq('payment_reference', reference);

      throw new ApiError(400, 'Payment verification failed');
    }

    const paymentData = result.data;
    const metadata = paymentData.metadata;

    // Calculate expiry date
    const { data: settings } = await supabaseAdmin
      .from('platform_settings')
      .select('level_subscription_months, course_subscription_months')
      .single();

    const durationMonths = metadata.type === 'level'
      ? settings.level_subscription_months
      : settings.course_subscription_months;

    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + durationMonths);

    // Create subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        user_id: metadata.user_id,
        type: metadata.type,
        university_id: metadata.university_id,
        faculty_id: metadata.faculty_id,
        department_id: metadata.department_id,
        level: metadata.level,
        course_id: metadata.course_id,
        course_code: metadata.course_code,
        price: paymentData.amount / 100, // Convert from kobo
        payment_reference: reference,
        payment_gateway: 'paystack',
        payment_channel: paymentData.channel,
        duration_months: durationMonths,
        expiry_date: expiryDate.toISOString(),
        status: 'active'
      })
      .select()
      .single();

    if (subError) {
      throw new ApiError(400, subError.message);
    }

    // Update transaction
    await supabaseAdmin
      .from('transactions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        subscription_id: subscription.id,
        gateway_response: paymentData
      })
      .eq('payment_reference', reference);

    // Get user email for notification
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', metadata.user_id)
      .single();

    // Send confirmation email
    if (user?.email) {
      sendPaymentConfirmation(user.email, subscription).catch(console.error);
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: subscription
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Paystack webhook
 */
async function paystackWebhook(req, res, next) {
  try {
    const event = req.body;

    // Verify webhook signature (in production, verify using Paystack signature)
    // const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    //   .update(JSON.stringify(req.body)).digest('hex');
    // if (hash !== req.headers['x-paystack-signature']) {
    //   throw new ApiError(401, 'Invalid signature');
    // }

    switch (event.event) {
      case 'charge.success':
        // Payment successful - handle if not already handled
        const reference = event.data.reference;
        const { data: transaction } = await supabaseAdmin
          .from('transactions')
          .select('status')
          .eq('payment_reference', reference)
          .single();

        if (transaction && transaction.status === 'pending') {
          // Process the payment (same logic as verifyPayment)
          // This is a backup in case the frontend verification fails
        }
        break;

      case 'transfer.success':
        // Withdrawal transfer successful
        const transferCode = event.data.transfer_code;
        await supabaseAdmin
          .from('withdrawals')
          .update({ status: 'completed' })
          .eq('paystack_transfer_code', transferCode);
        break;

      case 'transfer.failed':
        // Withdrawal transfer failed
        await supabaseAdmin
          .from('withdrawals')
          .update({
            status: 'failed',
            failure_reason: event.data.reason
          })
          .eq('paystack_transfer_code', event.data.transfer_code);
        break;
    }

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user's transactions
 */
async function getTransactions(req, res, next) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type, status } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (type) {
      query = query.eq('type', type);
    }

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
  initializePayment,
  verifyPayment,
  paystackWebhook,
  getTransactions
};
