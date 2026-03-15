/**
 * PastQuest/Vectra - AI Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

/**
 * AI chat about a lecture
 */
async function chat(req, res, next) {
  try {
    const userId = req.user.id;
    const { lectureId, message, history: clientHistory } = req.body;

    if (!message) {
      throw new ApiError(400, 'message is required');
    }

    let lecture = null;
    let messages;

    if (lectureId) {
      // Lecture-specific chat: verify ownership and use DB history
      const { data: lec, error: fetchError } = await supabaseAdmin
        .from('lectures')
        .select('*')
        .eq('id', lectureId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !lec) {
        throw new ApiError(404, 'Lecture not found');
      }
      lecture = lec;

      // Save user message to DB history
      await supabaseAdmin
        .from('ai_chat_history')
        .insert({ lecture_id: lectureId, user_id: userId, role: 'user', message });

      // Fetch full history from DB for context
      const { data: dbHistory } = await supabaseAdmin
        .from('ai_chat_history')
        .select('role, message')
        .eq('lecture_id', lectureId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(30);

      messages = (dbHistory || []).map((h) => ({ role: h.role, content: h.message }));
    } else {
      // General chat: use client-provided history + current message
      const priorHistory = Array.isArray(clientHistory) ? clientHistory.slice(-20) : [];
      messages = [...priorHistory, { role: 'user', content: message }];
    }

    let assistantMessage;

    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('[AI Chat] No ANTHROPIC_API_KEY set, returning simulated response');
      const context = lecture ? ` about "${lecture.topic}"` : '';
      assistantMessage = `This is a simulated AI response${context}. Set ANTHROPIC_API_KEY to enable real AI.\n\nYour question: "${message}"`;
    } else {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const systemPrompt = lecture
        ? `You are an expert AI tutor helping a student understand their lecture on "${lecture.topic}" for ${lecture.course_code}${lecture.course_name ? ` - ${lecture.course_name}` : ''}.

LECTURE CONTEXT:
${lecture.structured_markdown || lecture.transcript || 'No structured notes available yet.'}

KEY CONCEPTS: ${(lecture.key_concepts || []).join(', ') || 'None extracted yet.'}

INSTRUCTIONS:
- Answer questions about this specific lecture
- Reference specific content from the notes when possible
- Explain concepts clearly and simply
- Use LaTeX notation for equations when relevant
- If asked about something not in the lecture, say so but provide general knowledge
- Be encouraging and supportive`
        : `You are an expert AI study assistant helping a Nigerian university student with their studies. Answer academic questions clearly, helpfully, and concisely. Be encouraging and supportive.`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      });

      assistantMessage = response.content[0].text;
    }

    // Persist assistant response to DB only for lecture chats
    if (lectureId) {
      await supabaseAdmin
        .from('ai_chat_history')
        .insert({ lecture_id: lectureId, user_id: userId, role: 'assistant', message: assistantMessage });
    }

    res.json({
      success: true,
      data: { role: 'assistant', message: assistantMessage, lectureId: lectureId || null },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Generate a quick recap for a lecture
 */
async function generateRecap(req, res, next) {
  try {
    const userId = req.user.id;
    const { lectureId } = req.body;

    if (!lectureId) {
      throw new ApiError(400, 'lectureId is required');
    }

    // Verify lecture belongs to user
    const { data: lecture, error: fetchError } = await supabaseAdmin
      .from('lectures')
      .select('*')
      .eq('id', lectureId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !lecture) {
      throw new ApiError(404, 'Lecture not found');
    }

    if (!lecture.structured_markdown && !lecture.transcript) {
      throw new ApiError(400, 'Lecture has no content to generate a recap from. Process the lecture first.');
    }

    let recapText;

    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('[AI Recap] No ANTHROPIC_API_KEY set, returning simulated recap');
      recapText = `Quick Recap: ${lecture.topic}\n\nThis is a simulated recap. Set ANTHROPIC_API_KEY to enable real AI recap generation.\n\nKey points from the lecture would be summarized here in a concise, easy-to-review format.`;
    } else {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const content = lecture.structured_markdown || lecture.transcript;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Generate a concise quick recap of this lecture for a student to review before an exam. Keep it under 500 words. Focus on key concepts, important equations, and main takeaways.

LECTURE: ${lecture.topic}
COURSE: ${lecture.course_code}

CONTENT:
${content}

FORMAT:
- Start with a 1-2 sentence overview
- List key concepts as bullet points
- Include critical equations if any
- End with 2-3 exam tips related to this topic`,
          },
        ],
      });

      recapText = response.content[0].text;
    }

    // Upsert recap (one per user per lecture)
    const { data, error } = await supabaseAdmin
      .from('ai_recaps')
      .upsert(
        {
          lecture_id: lectureId,
          user_id: userId,
          recap_text: recapText,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'lecture_id,user_id' }
      )
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Recap generated successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get chat history for a lecture
 */
async function getChatHistory(req, res, next) {
  try {
    const userId = req.user.id;
    const { lectureId } = req.params;

    if (!lectureId) {
      throw new ApiError(400, 'lectureId is required');
    }

    // Verify lecture belongs to user
    const { data: lecture, error: fetchError } = await supabaseAdmin
      .from('lectures')
      .select('id')
      .eq('id', lectureId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !lecture) {
      throw new ApiError(404, 'Lecture not found');
    }

    const { data, error } = await supabaseAdmin
      .from('ai_chat_history')
      .select('id, role, message, created_at')
      .eq('lecture_id', lectureId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Clear chat history for a lecture
 */
async function clearChatHistory(req, res, next) {
  try {
    const userId = req.user.id;
    const { lectureId } = req.params;

    if (!lectureId) throw new ApiError(400, 'lectureId is required');

    const { data: lecture, error: fetchError } = await supabaseAdmin
      .from('lectures')
      .select('id')
      .eq('id', lectureId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !lecture) throw new ApiError(404, 'Lecture not found');

    const { error } = await supabaseAdmin
      .from('ai_chat_history')
      .delete()
      .eq('lecture_id', lectureId)
      .eq('user_id', userId);

    if (error) throw new ApiError(400, error.message);

    res.json({ success: true, message: 'Chat history cleared' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  chat,
  generateRecap,
  getChatHistory,
  clearChatHistory,
};
