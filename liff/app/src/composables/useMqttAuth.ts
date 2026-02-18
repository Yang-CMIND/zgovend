import mqtt from 'mqtt'

/**
 * 機台簽到 MQTT 認證
 * 兩階段：1) nonce 提交+等待驗證  2) 認證結果 publish
 */
export function useMqttAuth() {
  /**
   * 第一階段：submit nonce 並等待 gui-replenish 的 nonce_verify 回應
   */
  function submitNonceAndWait(
    brokerUrl: string,
    hid: string,
    nonce: string,
    timeoutMs = 15000
  ): Promise<{ accepted: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(brokerUrl, {
        connectTimeout: 10000,
        clientId: 'liff-nonce-' + Math.random().toString(16).substring(2, 8),
      })

      const timer = setTimeout(() => {
        client.end()
        reject(new Error('等待機台確認逾時'))
      }, timeoutMs)

      client.on('connect', () => {
        const topic = `devices/${hid}/auth`

        // 先 subscribe 再 publish，確保不漏訊息
        client.subscribe(topic, { qos: 1 }, (err) => {
          if (err) {
            clearTimeout(timer)
            client.end()
            reject(err)
            return
          }

          const msg = JSON.stringify({
            stage: 'nonce_submit',
            nonce,
            timestamp: Date.now(),
          })
          client.publish(topic, msg, { qos: 1 }, (pubErr) => {
            if (pubErr) {
              clearTimeout(timer)
              client.end()
              reject(pubErr)
            }
          })
        })
      })

      client.on('message', (_topic, message) => {
        try {
          const data = JSON.parse(message.toString())
          if (data.stage === 'nonce_verify' && data.nonce === nonce) {
            clearTimeout(timer)
            client.end()
            resolve({ accepted: data.accepted, error: data.error })
          }
        } catch { /* ignore parse errors */ }
      })

      client.on('error', (err) => {
        clearTimeout(timer)
        client.end()
        reject(err)
      })
    })
  }

  /**
   * 第二階段：publish 認證結果（成功或失敗）
   */
  function publishAuthResult(
    brokerUrl: string,
    hid: string,
    payload: {
      authenticated: boolean
      lineUserId?: string
      displayName?: string
      error?: string
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(brokerUrl, {
        connectTimeout: 10000,
        clientId: 'liff-auth-' + Math.random().toString(16).substring(2, 8),
      })

      const timeout = setTimeout(() => {
        client.end()
        reject(new Error('MQTT 連線逾時'))
      }, 15000)

      client.on('connect', () => {
        const topic = `devices/${hid}/auth`
        const msg = JSON.stringify({
          ...payload,
          timestamp: Date.now(),
        })

        client.publish(topic, msg, { qos: 1 }, (err) => {
          clearTimeout(timeout)
          client.end()
          if (err) reject(err)
          else resolve()
        })
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        client.end()
        reject(err)
      })
    })
  }

  return { submitNonceAndWait, publishAuthResult }
}
