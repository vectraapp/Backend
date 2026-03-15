/**
 * Vectra - Lecture PDF Generator
 * Generates a PDF from lecture data (transcript, notes, photos)
 */

const PDFDocument = require('pdfkit');
const cloudinary = require('../config/cloudinary');
const axios = require('axios');

async function generateLecturePDF(lecture) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);

          // Upload to Cloudinary as raw file
          const result = await new Promise((res, rej) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                resource_type: 'raw',
                format: 'pdf',
                folder: 'vectra/lecture-pdfs',
                public_id: `lecture_${lecture.id}`,
              },
              (error, result) => error ? rej(error) : res(result)
            );
            uploadStream.end(buffer);
          });

          resolve(result.secure_url);
        } catch (uploadError) {
          reject(uploadError);
        }
      });

      // --- PAGE 1: Cover ---
      doc.fontSize(28).font('Helvetica-Bold')
         .fillColor('#2563EB')
         .text('VECTRA', { align: 'center' });

      doc.moveDown();
      doc.fontSize(20).font('Helvetica-Bold')
         .fillColor('#0F172A')
         .text(lecture.topic || 'Lecture Notes', { align: 'center' });

      doc.moveDown();
      doc.fontSize(14).font('Helvetica')
         .fillColor('#475569')
         .text(lecture.course_code || '', { align: 'center' });

      doc.text(lecture.course_name || '', { align: 'center' });
      doc.text(`Date: ${new Date(lecture.date || lecture.created_at).toLocaleDateString()}`, { align: 'center' });
      if (lecture.lecturer) doc.text(`Lecturer: ${lecture.lecturer}`, { align: 'center' });

      // --- PAGE 2: AI Structured Notes ---
      const notes = lecture.structured_markdown || lecture.structured_notes || lecture.ai_notes;
      if (notes) {
        doc.addPage();
        doc.fontSize(18).font('Helvetica-Bold')
           .fillColor('#2563EB')
           .text('AI Structured Notes');

        doc.moveDown();

        // Parse markdown into formatted PDF content
        const lines = notes.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            doc.moveDown(0.3);
            continue;
          }
          if (trimmed.startsWith('# ')) {
            doc.fontSize(18).font('Helvetica-Bold').fillColor('#0F2A44').text(trimmed.replace('# ', ''));
            doc.moveDown(0.5);
          } else if (trimmed.startsWith('## ')) {
            doc.fontSize(15).font('Helvetica-Bold').fillColor('#0F2A44').text(trimmed.replace('## ', ''));
            doc.moveDown(0.3);
          } else if (trimmed.startsWith('### ')) {
            doc.fontSize(13).font('Helvetica-Bold').fillColor('#2E2E2E').text(trimmed.replace('### ', ''));
            doc.moveDown(0.2);
          } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            doc.fontSize(11).font('Helvetica').fillColor('#0F172A').text(`  \u2022 ${trimmed.substring(2)}`, { indent: 10 });
          } else if (/^\d+\.\s/.test(trimmed)) {
            doc.fontSize(11).font('Helvetica').fillColor('#0F172A').text(`  ${trimmed}`, { indent: 10 });
          } else if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
            doc.fontSize(11).font('Courier').fillColor('#1FB6A6').text(trimmed.replace(/\$\$/g, ''), { align: 'center' });
          } else {
            doc.fontSize(11).font('Helvetica').fillColor('#0F172A').text(trimmed, { align: 'left', lineGap: 4 });
          }
        }
      }

      // --- Photos ---
      const images = lecture.images || lecture.photos || [];
      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const photo = images[i];
          doc.addPage();

          doc.fontSize(14).font('Helvetica-Bold')
             .fillColor('#0F172A')
             .text(`Lecture Photo ${i + 1}`, { align: 'center' });

          doc.moveDown();

          try {
            const photoUrl = photo.image_url || photo.url || photo;
            const response = await axios.get(photoUrl, { responseType: 'arraybuffer', timeout: 15000 });
            const imageBuffer = Buffer.from(response.data);
            doc.image(imageBuffer, {
              fit: [500, 400],
              align: 'center',
            });
          } catch (imgError) {
            doc.fontSize(11).font('Helvetica')
               .fillColor('#94A3B8')
               .text('[Image could not be loaded]', { align: 'center' });
          }
        }
      }

      // --- Full Transcript ---
      if (lecture.transcript) {
        doc.addPage();
        doc.fontSize(18).font('Helvetica-Bold')
           .fillColor('#2563EB')
           .text('Full Transcript');
        doc.moveDown();
        doc.fontSize(10).font('Helvetica')
           .fillColor('#475569')
           .text(lecture.transcript, { align: 'left', lineGap: 3 });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateLecturePDF };
