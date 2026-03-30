const express = require('express');
const PDFDocument = require('pdfkit');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.hubspot.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.post('/generate-pdf', async (req, res) => {
  try {
    const { contact } = req.body;

    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const base64 = pdfBuffer.toString('base64');
      res.json({ success: true, pdf: base64 });
    });

    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('Contact Details', { align: 'center' });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    const fields = [
      { label: 'Name',       value: `${contact.firstname || ''} ${contact.lastname || ''}`.trim() },
      { label: 'Email',      value: contact.email || 'N/A' },
      { label: 'Phone',      value: contact.phone || 'N/A' },
      { label: 'Company',    value: contact.company || 'N/A' },
      { label: 'Job Title',  value: contact.jobtitle || 'N/A' },
      { label: 'Lifecycle',  value: contact.lifecyclestage || 'N/A' },
      { label: 'Owner',      value: contact.hubspot_owner_id || 'N/A' },
      { label: 'Created',    value: contact.createdate ? new Date(contact.createdate).toLocaleDateString('en-IN') : 'N/A' },
    ];

    fields.forEach(({ label, value }) => {
      doc.fontSize(12).font('Helvetica-Bold').text(`${label}:`, { continued: true });
      doc.font('Helvetica').text(`  ${value}`);
      doc.moveDown(0.5);
    });

    doc.moveDown();
    doc.fontSize(9).fillColor('gray')
      .text(`Generated on ${new Date().toLocaleString('en-IN')}`, { align: 'right' });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = app;
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => console.log(`PDF server running on port ${PORT}`));