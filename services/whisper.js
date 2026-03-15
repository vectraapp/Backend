/**
 * PastQuest/Vectra - OpenAI Whisper Transcription Service
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Transcribe audio file using OpenAI Whisper API
 * @param {string} audioUrl - URL of the audio file to transcribe
 * @returns {Promise<string>} Transcription text
 */
async function transcribeAudio(audioUrl) {
  try {
    // If OPENAI_API_KEY is not set, return placeholder
    if (!process.env.OPENAI_API_KEY) {
      console.log('[Whisper] No API key set, returning placeholder transcript');
      return 'This is a placeholder transcript. Set OPENAI_API_KEY to enable real transcription with OpenAI Whisper.';
    }

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Download audio from URL to temp file
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = path.join(tempDir, `whisper_${Date.now()}.m4a`);

    const response = await axios.get(audioUrl, { responseType: 'stream' });
    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
      language: 'en',
      response_format: 'text',
    });

    // Clean up temp file
    fs.unlinkSync(tempPath);
    return transcription;
  } catch (error) {
    console.error('Whisper transcription error:', error.message);
    throw new Error('Transcription failed: ' + error.message);
  }
}

module.exports = { transcribeAudio };
