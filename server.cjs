'use strict'
const express = require('express')
const https   = require('https')
const path    = require('path')

const app  = express()
const PORT = process.env.PORT || 80

app.use(express.json({ limit: '2mb' }))
app.use(express.static(path.join(__dirname, 'dist')))

app.post('/api/gigachat', (req, res) => {
  const authHeader = req.headers['authorization'] || ''
  const bodyStr    = JSON.stringify(req.body)
  const options = {
    hostname: 'gigachat.devices.sberbank.ru',
    path: '/api/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization':  authHeader,
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    },
    rejectUnauthorized: false
  }
  const proxyReq = https.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode)
    proxyRes.pipe(res, { end: true })
  })
  proxyReq.on('error', (e) => res.status(502).json({ error: e.message }))
  proxyReq.write(bodyStr)
  proxyReq.end()
})

app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
)

app.listen(PORT, () => console.log('BPMN Generator running on :' + PORT))
