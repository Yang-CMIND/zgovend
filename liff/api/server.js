import express from 'express'
import crypto from 'crypto'

const app = express()
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json())

// ── LINE Pay Sandbox config ──
const CHANNEL_ID = process.env.LINEPAY_CHANNEL_ID || '2009178905'
const CHANNEL_SECRET = process.env.LINEPAY_CHANNEL_SECRET || 'd7f83d6291210e0d7c1853e246139418'
const BASE_URL = 'https://sandbox-api-pay.line.me'
const CONFIRM_URL = process.env.LINEPAY_CONFIRM_URL || 'https://honeypie.zgovend.com:8443/liff/linepay-confirm.html'
const CANCEL_URL = process.env.LINEPAY_CANCEL_URL || 'https://honeypie.zgovend.com:8443/liff/#/consumer/linepay'

// ── HMAC Signature for LINE Pay v3 ──
function makeSignature(secret, uri, body, nonce) {
  const text = secret + uri + body + nonce
  return crypto.createHmac('sha256', secret).update(text).digest('base64')
}

function makeHeaders(uri, body) {
  const nonce = crypto.randomUUID()
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  const signature = makeSignature(CHANNEL_SECRET, uri, bodyStr, nonce)
  return {
    'Content-Type': 'application/json',
    'X-LINE-ChannelId': CHANNEL_ID,
    'X-LINE-Authorization-Nonce': nonce,
    'X-LINE-Authorization': signature,
  }
}

// ── POST /linepay/request  →  呼叫 LINE Pay Request API ──
app.post('/linepay/request', async (req, res) => {
  const orderId = `DEMO-${Date.now()}`
  const uri = '/v3/payments/request'
  const body = {
    amount: 1,
    currency: 'TWD',
    orderId,
    packages: [
      {
        id: 'pkg-demo',
        amount: 1,
        name: 'LINE Pay Demo',
        products: [
          {
            name: '測試商品',
            quantity: 1,
            price: 1,
          },
        ],
      },
    ],
    redirectUrls: {
      confirmUrl: CONFIRM_URL,
      cancelUrl: CANCEL_URL,
    },
  }

  try {
    const headers = makeHeaders(uri, body)
    const resp = await fetch(BASE_URL + uri, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    // Parse as text first to preserve large transactionId (exceeds Number.MAX_SAFE_INTEGER)
    const raw = await resp.text()
    const data = JSON.parse(raw.replace(/"transactionId"\s*:\s*(\d+)/, '"transactionId":"$1"'))
    console.log('[LINE Pay Request]', raw)
    // Store transactionId (string) keyed by orderId
    if (data.info?.transactionId) {
      txStore.set(orderId, String(data.info.transactionId))
      console.log('[LINE Pay Store]', orderId, '->', data.info.transactionId)
    }
    res.json({ ...data, orderId })
  } catch (err) {
    console.error('[LINE Pay Request Error]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /linepay/confirm  →  呼叫 LINE Pay Confirm API ──
app.post('/linepay/confirm', async (req, res) => {
  const { transactionId } = req.body
  console.log('[LINE Pay Confirm] received transactionId:', transactionId)
  if (!transactionId) return res.status(400).json({ error: 'missing transactionId' })

  const uri = `/v3/payments/requests/${transactionId}/confirm`
  const body = {
    amount: 1,
    currency: 'TWD',
  }

  try {
    const headers = makeHeaders(uri, body)
    const resp = await fetch(BASE_URL + uri, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const data = await resp.json()
    console.log('[LINE Pay Confirm]', JSON.stringify(data))
    res.json(data)
  } catch (err) {
    console.error('[LINE Pay Confirm Error]', err)
    res.status(500).json({ error: err.message })
  }
})

// In-memory store: orderId → transactionId (string)
const txStore = new Map()

// GET /linepay/tx/:orderId — lookup stored transactionId
app.get('/linepay/tx/:orderId', (req, res) => {
  const tid = txStore.get(req.params.orderId)
  if (!tid) return res.status(404).json({ error: 'not found' })
  res.json({ transactionId: tid })
})

const PORT = process.env.PORT || 8787
app.listen(PORT, () => console.log(`LINE Pay API server listening on :${PORT}`))
