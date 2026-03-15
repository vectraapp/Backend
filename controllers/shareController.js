/**
 * Vectra - Share Controller
 * Handles content sharing with share codes
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Generate a unique share code
 */
function generateShareCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create a share code for content
 */
async function createShareCode(req, res, next) {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const {
      code_type,
      resource_id,
      resource_metadata,
      max_uses,
      expires_in_hours,
      require_same_university,
    } = req.body;

    if (!code_type) {
      throw new ApiError(400, 'code_type is required');
    }

    const validTypes = ['lecture', 'pdf', 'notes', 'course_pdfs', 'jot_notes'];
    if (!validTypes.includes(code_type)) {
      throw new ApiError(400, `Invalid code_type. Must be one of: ${validTypes.join(', ')}`);
    }

    // For types that require a resource_id, verify the resource exists and belongs to user
    if (['lecture', 'pdf', 'jot_notes'].includes(code_type) && resource_id) {
      let tableName;
      if (code_type === 'lecture') tableName = 'lectures';
      else if (code_type === 'pdf') tableName = 'user_pdfs';
      else if (code_type === 'jot_notes') tableName = 'user_jot_notes';

      if (tableName) {
        const { data: resource, error } = await supabaseAdmin
          .from(tableName)
          .select('id, user_id')
          .eq('id', resource_id)
          .eq('user_id', userId)
          .single();

        if (error || !resource) {
          throw new ApiError(404, 'Resource not found or does not belong to you');
        }
      }
    }

    // Generate unique share code
    let code;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      code = generateShareCode();
      const { data: existing } = await supabaseAdmin
        .from('share_codes')
        .select('id')
        .eq('code', code)
        .single();

      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new ApiError(500, 'Failed to generate unique share code. Please try again.');
    }

    // Calculate expiry date
    let expiresAt = null;
    if (expires_in_hours) {
      expiresAt = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString();
    }

    // Create share code record
    const { data, error } = await supabaseAdmin
      .from('share_codes')
      .insert({
        creator_id: userId,
        creator_email: userEmail,
        code,
        code_type,
        resource_id: resource_id || null,
        resource_metadata: resource_metadata || {},
        max_uses: max_uses || 1,
        expires_at: expiresAt,
        require_same_university: require_same_university || false,
      })
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.status(201).json({
      success: true,
      message: 'Share code created successfully',
      data: {
        code: data.code,
        type: data.code_type,
        maxUses: data.max_uses,
        expiresAt: data.expires_at,
        shareUrl: `vectra://share/${data.code}`,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Redeem a share code
 */
async function redeemShareCode(req, res, next) {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { code } = req.body;

    if (!code) {
      throw new ApiError(400, 'Share code is required');
    }

    // Get the share code
    const { data: shareCode, error: fetchError } = await supabaseAdmin
      .from('share_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (fetchError || !shareCode) {
      throw new ApiError(404, 'Invalid or inactive share code');
    }

    // Check if expired
    if (shareCode.expires_at && new Date(shareCode.expires_at) < new Date()) {
      throw new ApiError(400, 'Share code has expired');
    }

    // Check max uses
    if (shareCode.max_uses && shareCode.current_uses >= shareCode.max_uses) {
      throw new ApiError(400, 'Share code has reached maximum uses');
    }

    // Check if user already redeemed
    const { data: existingRedemption } = await supabaseAdmin
      .from('share_redemptions')
      .select('id')
      .eq('share_code_id', shareCode.id)
      .eq('redeemed_by', userId)
      .single();

    if (existingRedemption) {
      throw new ApiError(400, 'You have already redeemed this share code');
    }

    // Check if user is trying to redeem their own code
    if (shareCode.creator_id === userId) {
      throw new ApiError(400, 'You cannot redeem your own share code');
    }

    // Create redemption record
    const { data: redemption, error: redemptionError } = await supabaseAdmin
      .from('share_redemptions')
      .insert({
        share_code_id: shareCode.id,
        share_code: shareCode.code,
        redeemed_by: userId,
        redeemed_by_email: userEmail,
      })
      .select()
      .single();

    if (redemptionError) {
      throw new ApiError(400, redemptionError.message);
    }

    // Update share code usage count
    const newUseCount = shareCode.current_uses + 1;
    const updates = {
      current_uses: newUseCount,
      last_used_at: new Date().toISOString(),
    };

    // Deactivate if max uses reached
    if (shareCode.max_uses && newUseCount >= shareCode.max_uses) {
      updates.is_active = false;
    }

    await supabaseAdmin.from('share_codes').update(updates).eq('id', shareCode.id);

    // Copy the shared content to the user
    let copiedResource = null;

    if (shareCode.code_type === 'lecture' && shareCode.resource_id) {
      // Get original lecture
      const { data: originalLecture } = await supabaseAdmin
        .from('lectures')
        .select('*')
        .eq('id', shareCode.resource_id)
        .single();

      if (originalLecture) {
        // Create a copy for the redeemer
        const { data: newLecture } = await supabaseAdmin
          .from('lectures')
          .insert({
            user_id: userId,
            course_code: originalLecture.course_code,
            course_name: originalLecture.course_name,
            topic: originalLecture.topic,
            lecturer: originalLecture.lecturer,
            date: originalLecture.date,
            duration: originalLecture.duration,
            transcript: originalLecture.transcript,
            structured_markdown: originalLecture.structured_markdown,
            latex_equations: originalLecture.latex_equations,
            key_concepts: originalLecture.key_concepts,
            pdf_url: originalLecture.pdf_url,
            audio_url: originalLecture.audio_url,
            status: originalLecture.status,
            shared_from: shareCode.creator_id,
          })
          .select()
          .single();

        copiedResource = newLecture;
      }
    } else if (shareCode.code_type === 'pdf' && shareCode.resource_id) {
      // Get original PDF
      const { data: originalPdf } = await supabaseAdmin
        .from('user_pdfs')
        .select('*')
        .eq('id', shareCode.resource_id)
        .single();

      if (originalPdf) {
        const { data: newPdf } = await supabaseAdmin
          .from('user_pdfs')
          .insert({
            user_id: userId,
            course_code: originalPdf.course_code,
            name: originalPdf.name,
            file_url: originalPdf.file_url,
            file_size: originalPdf.file_size,
            page_count: originalPdf.page_count,
            description: originalPdf.description,
            tags: originalPdf.tags,
          })
          .select()
          .single();

        copiedResource = newPdf;
      }
    } else if (shareCode.code_type === 'jot_notes' && shareCode.resource_id) {
      // Get original jot notes
      const { data: originalNotes } = await supabaseAdmin
        .from('user_jot_notes')
        .select('*')
        .eq('id', shareCode.resource_id)
        .single();

      if (originalNotes) {
        // Upsert - if user has existing notes for this course, append
        const { data: existingNotes } = await supabaseAdmin
          .from('user_jot_notes')
          .select('*')
          .eq('user_id', userId)
          .eq('course_code', originalNotes.course_code)
          .single();

        if (existingNotes) {
          // Append to existing notes
          const { data: updatedNotes } = await supabaseAdmin
            .from('user_jot_notes')
            .update({
              content:
                existingNotes.content +
                '\n\n--- Shared Notes ---\n\n' +
                originalNotes.content,
            })
            .eq('id', existingNotes.id)
            .select()
            .single();

          copiedResource = updatedNotes;
        } else {
          // Create new notes
          const { data: newNotes } = await supabaseAdmin
            .from('user_jot_notes')
            .insert({
              user_id: userId,
              course_code: originalNotes.course_code,
              content: originalNotes.content,
            })
            .select()
            .single();

          copiedResource = newNotes;
        }
      }
    }

    // Update redemption with copied resource info
    if (copiedResource) {
      await supabaseAdmin
        .from('share_redemptions')
        .update({
          copied_resource_id: copiedResource.id,
          copied_resource_type: shareCode.code_type,
        })
        .eq('id', redemption.id);
    }

    // Create notification for creator
    await supabaseAdmin.from('notifications').insert({
      user_id: shareCode.creator_id,
      type: 'share',
      title: 'Content Shared',
      body: `Someone redeemed your share code (${shareCode.code})`,
      data: {
        share_code: shareCode.code,
        code_type: shareCode.code_type,
        redeemed_by: userEmail,
      },
    });

    res.json({
      success: true,
      message: 'Share code redeemed successfully',
      data: {
        codeType: shareCode.code_type,
        copiedResource,
        resourceMetadata: shareCode.resource_metadata,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user's created share codes
 */
async function getMyShareCodes(req, res, next) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from('share_codes')
      .select('*', { count: 'exact' })
      .eq('creator_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

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
 * Get content shared with user (redemptions)
 */
async function getSharedWithMe(req, res, next) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from('share_redemptions')
      .select(
        `
        *,
        share_code:share_codes(
          code,
          code_type,
          creator_email,
          resource_metadata
        )
      `,
        { count: 'exact' }
      )
      .eq('redeemed_by', userId)
      .order('redeemed_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

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
 * Deactivate a share code
 */
async function deactivateShareCode(req, res, next) {
  try {
    const userId = req.user.id;
    const { code } = req.params;

    const { data, error } = await supabaseAdmin
      .from('share_codes')
      .update({ is_active: false })
      .eq('code', code)
      .eq('creator_id', userId)
      .select()
      .single();

    if (error) {
      throw new ApiError(404, 'Share code not found or does not belong to you');
    }

    res.json({
      success: true,
      message: 'Share code deactivated successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get redemptions for a specific share code
 */
async function getShareCodeRedemptions(req, res, next) {
  try {
    const userId = req.user.id;
    const { code } = req.params;

    // Verify share code belongs to user
    const { data: shareCode, error: fetchError } = await supabaseAdmin
      .from('share_codes')
      .select('id')
      .eq('code', code)
      .eq('creator_id', userId)
      .single();

    if (fetchError || !shareCode) {
      throw new ApiError(404, 'Share code not found');
    }

    const { data, error } = await supabaseAdmin
      .from('share_redemptions')
      .select('*')
      .eq('share_code_id', shareCode.id)
      .order('redeemed_at', { ascending: false });

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Preview a share code's content without redeeming
 */
async function previewShareCode(req, res, next) {
  try {
    const { code } = req.params;

    if (!code) {
      throw new ApiError(400, 'Share code is required');
    }

    // Get the share code
    const { data: shareCode, error: fetchError } = await supabaseAdmin
      .from('share_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (fetchError || !shareCode) {
      throw new ApiError(404, 'Invalid or inactive share code');
    }

    // Check if expired
    if (shareCode.expires_at && new Date(shareCode.expires_at) < new Date()) {
      throw new ApiError(400, 'Share code has expired');
    }

    // Check max uses
    if (shareCode.max_uses && shareCode.current_uses >= shareCode.max_uses) {
      throw new ApiError(400, 'Share code has reached maximum uses');
    }

    // Build preview data based on type
    let preview = {
      code: shareCode.code,
      type: shareCode.code_type,
      creatorEmail: shareCode.creator_email,
      expiresAt: shareCode.expires_at,
      metadata: shareCode.resource_metadata || {},
    };

    if (shareCode.code_type === 'lecture' && shareCode.resource_id) {
      const { data: lecture } = await supabaseAdmin
        .from('lectures')
        .select('topic, course_code, course_name, lecturer, date, duration, status')
        .eq('id', shareCode.resource_id)
        .single();

      if (lecture) {
        preview.resource = {
          topic: lecture.topic,
          courseCode: lecture.course_code,
          courseName: lecture.course_name,
          lecturer: lecture.lecturer,
          date: lecture.date,
          duration: lecture.duration,
          status: lecture.status,
        };
      }
    } else if (shareCode.code_type === 'pdf' && shareCode.resource_id) {
      const { data: pdf } = await supabaseAdmin
        .from('user_pdfs')
        .select('name, course_code, file_size, page_count, description')
        .eq('id', shareCode.resource_id)
        .single();

      if (pdf) {
        preview.resource = {
          name: pdf.name,
          courseCode: pdf.course_code,
          fileSize: pdf.file_size,
          pageCount: pdf.page_count,
          description: pdf.description,
        };
      }
    }

    res.json({
      success: true,
      data: preview,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createShareCode,
  redeemShareCode,
  getMyShareCodes,
  getSharedWithMe,
  deactivateShareCode,
  getShareCodeRedemptions,
  previewShareCode,
};
