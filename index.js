const express = require('express');
const PDFDocument = require('pdfkit');

const app = express();
const pdfs = {};

app.use(express.json());
app.use(express.text({ type: '*/*' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'PDF Backend is running!' });
});

app.get('/generate-pdf', async (req, res) => {
  try {
    const contact = {
      firstname:      req.query.firstname || '',
      lastname:       req.query.lastname || '',
      email:          req.query.email || 'N/A',
      phone:          req.query.phone || 'N/A',
      company:        req.query.company || 'N/A',
      jobtitle:       req.query.jobtitle || 'N/A',
      lifecyclestage: req.query.lifecyclestage || 'N/A',
      createdate:     req.query.createdate || '',
    };

    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const id = Date.now().toString();
      pdfs[id] = pdfBuffer;

      setTimeout(() => delete pdfs[id], 5 * 60 * 1000);

      res.json({ success: true, pdfId: id });
    });

    doc.fontSize(24).font('Helvetica-Bold').text('Contact Details', { align: 'center' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    const fields = [
      { label: 'Name',      value: `${contact.firstname} ${contact.lastname}`.trim() || 'N/A' },
      { label: 'Email',     value: contact.email },
      { label: 'Phone',     value: contact.phone },
      { label: 'Company',   value: contact.company },
      { label: 'Job Title', value: contact.jobtitle },
      { label: 'Lifecycle', value: contact.lifecyclestage },
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

app.get('/download-pdf/:id', (req, res) => {
  try {
    const pdf = pdfs[req.params.id];
    if (!pdf) return res.status(404).json({ error: 'PDF expired or not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=contact.pdf');
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;