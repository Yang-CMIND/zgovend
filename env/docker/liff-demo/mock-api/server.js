import express from 'express';

const app = express();
app.use(express.json({ limit: '2mb' }));

// NOTE: In real life, the backend must verify LIFF id_token (OIDC) before binding.
app.post('/liff/bind', (req, res) => {
  const body = req.body || {};

  // Redact token fields in logs/response to reduce accidental leakage.
  const redact = (t) => (typeof t === 'string' && t.length > 16 ? `${t.slice(0, 16)}...` : t);

  const received = {
    ...body,
    idToken: redact(body.idToken),
    accessToken: redact(body.accessToken),
  };

  res.json({
    ok: true,
    message: 'mock bind received (NOT VERIFIED)',
    received,
    ts: new Date().toISOString(),
  });
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(port, '0.0.0.0', () => {
  console.log(`mock-api listening on http://0.0.0.0:${port}`);
});
