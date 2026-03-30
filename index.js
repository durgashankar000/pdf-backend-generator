const express = require('express');
const PDFDocument = require('pdfkit');

const app = express();

app.use(express.json());
app.use(express.text({ type: '*/*' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'PDF Backend is running!' });
});

app.post('/generate-pdf', async (req, res) => {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const contact = body.contact || {};

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
      { label: 'Name',      value: `${contact.firstname || ''} ${contact.lastname || ''}`.trim() || 'N/A' },
      { label: 'Email',     value: contact.email || 'N/A' },
      { label: 'Phone',     value: contact.phone || 'N/A' },
      { label: 'Company',   value: contact.company || 'N/A' },
      { label: 'Job Title', value: contact.jobtitle || 'N/A' },
      { label: 'Lifecycle', value: contact.lifecyclestage || 'N/A' },
      { label: 'Created',   value: contact.createdate ? new Date(contact.createdate).toLocaleDateString('en-IN') : 'N/A' },
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