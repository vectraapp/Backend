/**
 * PastQuest/Vectra - Claude AI Note Structuring Service
 */

/**
 * Structure lecture transcript into organized study notes using Claude
 * @param {string} transcript - Raw lecture transcript
 * @param {Object} metadata - Lecture metadata
 * @returns {Promise<Object>} Structured notes with markdown, equations, key concepts
 */
async function structureLectureNotes(transcript, metadata) {
  const { course_code, course_name, topic } = metadata;

  // If ANTHROPIC_API_KEY is not set, return placeholder
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Claude] No API key set, returning placeholder notes');
    return {
      markdown: `# ${topic}\n\n## Overview\nPlaceholder structured notes. Set ANTHROPIC_API_KEY to enable real AI note structuring.\n\n## Transcript\n${transcript ? transcript.substring(0, 500) : 'No transcript available.'}`,
      latex_equations: [],
      key_concepts: ['Placeholder concept 1', 'Placeholder concept 2'],
      tokens_used: 0,
    };
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are an expert ${course_code} teaching assistant. Structure this lecture transcript into clear, organized study notes.

LECTURE INFORMATION:
Course: ${course_code} - ${course_name}
Topic: ${topic}

TRANSCRIPT:
${transcript}

FORMATTING REQUIREMENTS:
1. Use markdown headings (##, ###)
2. Extract all equations in LaTeX format ($$equation$$)
3. Define all variables clearly
4. Break down derivations step-by-step
5. Highlight key concepts
6. Include examples if mentioned
7. Use bullet points for lists

OUTPUT STRUCTURE:
# ${topic}

## Overview
[2-3 sentence summary]

## Key Concepts
[Main ideas as bullet points]

## Equations
[All equations with variable definitions]

## Derivations
[Step-by-step breakdowns if applicable]

## Examples
[Any examples mentioned]

## Important Notes
[Additional important points]

PROVIDE ONLY THE STRUCTURED MARKDOWN. NO PREAMBLE.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const structuredMarkdown = response.content[0].text;

  // Extract equations
  const equationRegex = /\$\$?(.*?)\$\$?/g;
  const equations = [];
  let match;
  while ((match = equationRegex.exec(structuredMarkdown)) !== null) {
    equations.push(match[1].trim());
  }

  // Extract key concepts
  const conceptsSection = structuredMarkdown.match(/## Key Concepts\n([\s\S]*?)(?=\n##|$)/);
  const keyConcepts = conceptsSection
    ? conceptsSection[1].split('\n').filter((l) => l.trim().startsWith('-')).map((l) => l.replace(/^-\s*/, '').trim())
    : [];

  return {
    markdown: structuredMarkdown,
    latex_equations: equations,
    key_concepts: keyConcepts,
    tokens_used: response.usage.input_tokens + response.usage.output_tokens,
  };
}

module.exports = { structureLectureNotes };
