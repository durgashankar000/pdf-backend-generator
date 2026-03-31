const express = require('express');
const PDFDocument = require('pdfkit');

const app = express();

app.use(express.json());
app.use(express.text({ type: '*/*' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const CONTACT_QUERY_KEYS = [
  'firstname',
  'lastname',
  'email',
  'phone',
  'company',
  'jobtitle',
  'lifecyclestage',
  'createdate',
];

function contactFromQuery(q) {
  return {
    firstname: String(q.firstname ?? '').trim(),
    lastname: String(q.lastname ?? '').trim(),
    email: String(q.email ?? '').trim() || 'N/A',
    phone: String(q.phone ?? '').trim() || 'N/A',
    company: String(q.company ?? '').trim() || 'N/A',
    jobtitle: String(q.jobtitle ?? '').trim() || 'N/A',
    lifecyclestage: String(q.lifecyclestage ?? '').trim() || 'N/A',
    createdate: String(q.createdate ?? '').trim(),
  };
}

function hasAnyContactData(q) {
  return CONTACT_QUERY_KEYS.some((k) => {
    const v = q[k];
    return v != null && String(v).trim() !== '';
  });
}

function formatCreatedDate(raw) {
  if (!raw) return 'N/A';
  if (/^\d+$/.test(raw)) {
    const d = new Date(Number(raw));
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-IN');
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-IN');
}

/** Base64url segment from CRM card (HubSpot iframe URLs often drop query strings). */
function decodeContactPayload(segment) {
  if (!segment || typeof segment !== 'string') return null;
  try {
    let b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') return null;
    if (!hasAnyContactData(data)) return null;
    return contactFromQuery(data);
  } catch {
    return null;
  }
}

/** Stream a contact PDF to the response (stateless — safe for Vercel serverless). */
function sendContactPdf(res, contact, disposition) {
  const doc = new PDFDocument({ margin: 50 });
  const chunks = [];

  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => {
    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="contact.pdf"`
    );
    res.setHeader('Cache-Control', 'private, max-age=60');
    // Embed in HubSpot iframe (cross-origin PDF viewer)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    res.send(pdfBuffer);
  });

  doc.fontSize(24).font('Helvetica-Bold').text('Contact Details', { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown();

  const name =
    `${contact.firstname} ${contact.lastname}`.trim() || 'N/A';
  const fields = [
    { label: 'Name', value: name },
    { label: 'Email', value: contact.email },
    { label: 'Phone', value: contact.phone },
    { label: 'Company', value: contact.company },
    { label: 'Job Title', value: contact.jobtitle },
    { label: 'Lifecycle', value: contact.lifecyclestage },
    { label: 'Created', value: formatCreatedDate(contact.createdate) },
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
}

app.get('/', (req, res) => {
  res.json({ status: 'PDF Backend is running! 2' });
});

/** Validate params then return JSON (no PDF body) — used by the CRM card “Generate” step. */
app.get('/generate-pdf', (req, res) => {
  try {
    if (!hasAnyContactData(req.query)) {
      return res.status(400).json({
        success: false,
        error: 'No contact fields in request',
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Stateless PDF: same query params as generate, plus disposition=inline|attachment.
 * Works across Vercel instances (no in-memory store).
 */
app.get('/pdf', (req, res) => {
  try {
    if (!hasAnyContactData(req.query)) {
      return res.status(400).json({ error: 'No contact data' });
    }
    const disposition =
      req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    const contact = contactFromQuery(req.query);
    sendContactPdf(res, contact, disposition);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** Inline PDF for iframe — path segment (preferred for HubSpot iframes; query URLs are often stripped). */
app.get('/view-pdf/:payload', (req, res) => {
  try {
    const contact = decodeContactPayload(req.params.payload);
    if (!contact) {
      return res.status(400).type('text/plain').send('Invalid or empty payload');
    }
    sendContactPdf(res, contact, 'inline');
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send(err.message);
  }
});

/** Inline PDF (query string — legacy). */
app.get('/view-pdf', (req, res) => {
  try {
    if (!hasAnyContactData(req.query)) {
      return res.status(400).send('No contact data');
    }
    const contact = contactFromQuery(req.query);
    sendContactPdf(res, contact, 'inline');
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

/** Download — path segment (preferred). */
app.get('/download-pdf/:payload', (req, res) => {
  try {
    const contact = decodeContactPayload(req.params.payload);
    if (!contact) {
      return res.status(400).json({ error: 'Invalid or empty payload' });
    }
    sendContactPdf(res, contact, 'attachment');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** Download (query string — legacy). */
app.get('/download-pdf', (req, res) => {
  try {
    if (!hasAnyContactData(req.query)) {
      return res.status(400).json({ error: 'No contact data' });
    }
    const contact = contactFromQuery(req.query);
    sendContactPdf(res, contact, 'attachment');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
