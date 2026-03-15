/**
 * PastQuest - Promo Code Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');
const crypto = require('crypto');

/**
 * Generate a promo code string
 */
function generateCode(prefix = 'PQ', length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let code = prefix + '-';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(crypto.randomInt(chars.length));
  }
  return code;
}

/**
 * Create a new promo code (admin)
 */
async function createPromoCode(req, res, next) {
  try {
    const adminId = req.user.id;
    const {
      code,           // Optional custom code, auto-generated if not provided
      discount_type,  // 'percentage' or 'fixed'
      discount_value, // e.g., 20 for 20% or 500 for ₦500
      max_uses,       // null for unlimited
      valid_from,     // ISO date string
      valid_until,    // ISO date string
      applies_to,     // 'all', 'level', 'course'
      description,    // Optional description
      min_amount,     // Minimum purchase amount to qualify (optional)
    } = req.body;

    if (!discount_type || !discount_value) {
      throw new ApiError(400, 'Discount type and value are required');
    }

    if (!['percentage', 'fixed'].includes(discount_type)) {
      throw new ApiError(400, 'Discount type must be "percentage" or "fixed"');
    }

    if (discount_type === 'percentage' && (discount_value < 1 || discount_value > 100)) {
      throw new ApiError(400, 'Percentage discount must be between 1 and 100');
    }

    if (discount_type === 'fixed' && discount_value < 1) {
      throw new ApiError(400, 'Fixed discount must be at least 1');
    }

    // Generate or validate code
    const promoCode = code ? code.toUpperCase().trim() : generateCode();

    // Check if code already exists
    const { data: existing } = await supabaseAdmin
      .from('promo_codes')
      .select('id')
      .eq('code', promoCode)
      .single();

    if (existing) {
      throw new ApiError(400, 'A promo code with this code already exists');
    }

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .insert({
        code: promoCode,
        discount_type,
        discount_value,
        max_uses: max_uses || null,
        times_used: 0,
        valid_from: valid_from || new Date().toISOString(),
        valid_until: valid_until || null,
        applies_to: applies_to || 'all',
        description: description || null,
        min_amount: min_amount || 0,
        is_active: true,
        created_by: adminId,
      })
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    // Log activity
    await supabaseAdmin.from('admin_activity_logs').insert({
      admin_id: adminId,
      admin_email: req.user.email,
      action: 'create_promo_code',
      resource_type: 'promo_code',
      resource_id: data.id,
      details: { code: promoCode, discount_type, discount_value },
    });

    res.status(201).json({
      success: true,
      message: 'Promo code created successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all promo codes (admin)
 */
async function getPromoCodes(req, res, next) {
  try {
    const { page = 1, limit = 50, is_active, search } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('promo_codes')
      .select('*', { count: 'exact' });

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }

    if (search) {
      query = query.ilike('code', `%${search}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update a promo code (admin)
 */
async function updatePromoCode(req, res, next) {
  try {
    const { id } = req.params;
    const updates = {};
    const allowed = [
      'is_active', 'max_uses', 'valid_until',
      'description', 'min_amount', 'applies_to',
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No valid fields to update');
    }

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    if (!data) {
      throw new ApiError(404, 'Promo code not found');
    }

    // Log activity
    await supabaseAdmin.from('admin_activity_logs').insert({
      admin_id: req.user.id,
      admin_email: req.user.email,
      action: 'update_promo_code',
      resource_type: 'promo_code',
      resource_id: id,
      details: updates,
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a promo code (admin)
 */
async function deletePromoCode(req, res, next) {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('promo_codes')
      .delete()
      .eq('id', id);

    if (error) {
      throw new ApiError(400, error.message);
    }

    // Log activity
    await supabaseAdmin.from('admin_activity_logs').insert({
      admin_id: req.user.id,
      admin_email: req.user.email,
      action: 'delete_promo_code',
      resource_type: 'promo_code',
      resource_id: id,
      details: {},
    });

    res.json({
      success: true,
      message: 'Promo code deleted',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Validate a promo code (public, used by frontend at checkout)
 */
async function validatePromoCode(req, res, next) {
  try {
    const { code, amount, type } = req.body;

    if (!code) {
      throw new ApiError(400, 'Promo code is required');
    }

    const { data: promo, error } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .single();

    if (error || !promo) {
      throw new ApiError(404, 'Invalid promo code');
    }

    // Check if active
    if (!promo.is_active) {
      throw new ApiError(400, 'This promo code is no longer active');
    }

    // Check if expired
    if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
      throw new ApiError(400, 'This promo code has expired');
    }

    // Check if not yet valid
    if (promo.valid_from && new Date(promo.valid_from) > new Date()) {
      throw new ApiError(400, 'This promo code is not yet valid');
    }

    // Check max uses
    if (promo.max_uses && promo.times_used >= promo.max_uses) {
      throw new ApiError(400, 'This promo code has been fully redeemed');
    }

    // Check applies_to
    if (promo.applies_to !== 'all' && type && promo.applies_to !== type) {
      throw new ApiError(400, `This promo code only applies to ${promo.applies_to} subscriptions`);
    }

    // Check minimum amount
    if (promo.min_amount && amount && amount < promo.min_amount) {
      throw new ApiError(400, `Minimum purchase of ₦${promo.min_amount} required for this code`);
    }

    // Calculate discount
    let discountAmount = 0;
    if (promo.discount_type === 'percentage') {
      discountAmount = amount ? Math.round((amount * promo.discount_value) / 100) : 0;
    } else {
      discountAmount = promo.discount_value;
    }

    // Ensure discount doesn't exceed the amount
    if (amount && discountAmount > amount) {
      discountAmount = amount;
    }

    res.json({
      success: true,
      data: {
        code: promo.code,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        discount_amount: discountAmount,
        applies_to: promo.applies_to,
        description: promo.description,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Apply a promo code (called during payment processing)
 */
async function applyPromoCode(code) {
  if (!code) return null;

  const { data: promo, error } = await supabaseAdmin
    .from('promo_codes')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .eq('is_active', true)
    .single();

  if (error || !promo) return null;

  // Increment usage count
  await supabaseAdmin
    .from('promo_codes')
    .update({ times_used: promo.times_used + 1 })
    .eq('id', promo.id);

  return promo;
}

module.exports = {
  createPromoCode,
  getPromoCodes,
  updatePromoCode,
  deletePromoCode,
  validatePromoCode,
  applyPromoCode,
};
