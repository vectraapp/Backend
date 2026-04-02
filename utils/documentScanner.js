/**
 * Vectra - Document Scanner Utility
 *
 * Applies CamScanner-style enhancement to uploaded document images:
 * - Converts to greyscale
 * - Auto-levels (normalise) for even brightness
 * - Sharpens text edges
 * - Boosts contrast so text is crisp and background is clean
 *
 * Only processes images (JPEG, PNG, WEBP).
 * PDFs are passed through unchanged.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Enhance a document image to look like a clean scanned document.
 * @param {string} inputPath - Path to the original uploaded file
 * @returns {Promise<{ outputPath: string, wasProcessed: boolean }>}
 *   outputPath  - Path to the enhanced file (may be the same as inputPath for PDFs)
 *   wasProcessed - true if image processing was applied, false for PDFs
 */
async function scanDocument(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  const isPdf = ext === '.pdf';

  // PDFs: skip processing, return original path
  if (isPdf) {
    return { outputPath: inputPath, wasProcessed: false };
  }

  const outputPath = inputPath.replace(ext, `_scanned${ext}`);

  await sharp(inputPath)
    .greyscale()           // Convert to black & white (CamScanner default look)
    .normalise()           // Auto-levels: stretch histogram for even brightness
    .sharpen({ sigma: 1.8, m1: 1.0, m2: 0.5 }) // Sharpen text edges
    .linear(1.25, -30)     // Boost contrast: multiply brightness by 1.25, subtract 30
    .toFile(outputPath);

  // Remove original, keep only the processed file
  fs.unlinkSync(inputPath);

  return { outputPath, wasProcessed: true };
}

module.exports = { scanDocument };
