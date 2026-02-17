import mqtt from 'mqtt'

export interface CheckinPayload {
  authenticated: boolean
  nonce: string
  status?: string
  lineUserId?: string
  displayName?: string
  error?: string
}

/**
 * 機台簽到 MQTT 認證
 * 連線至後端 MQTT broker，publish 簽到結果到 devices/{hid}/auth
 */
export function useMqttAuth() {
  /**
   * 發送簽到結果（成功或失敗）到 MQTT
   */
  function publishCheckin(
    brokerUrl: string,
    hid: string,
    payload: CheckinPayload
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(brokerUrl, {
        connectTimeout: 10000,
        clientId: 'liff-checkin-' + Math.random().toString(16).substring(2, 8),
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

  /**
   * Publish 認證成功後，subscribe 等待 gui-replenish 的 nonce 驗證結果
   * 回傳 { accepted: boolean, error?: string }
   */
  function publishAndWaitNonce(
    brokerUrl: string,
    hid: string,
    payload: CheckinPayload,
    timeoutMs = 15000
  ): Promise<{ accepted: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(brokerUrl, {
        connectTimeout: 10000,
        clientId: 'liff-checkin-' + Math.random().toString(16).substring(2, 8),
      })

      const timer = setTimeout(() => {
        client.end()
        reject(new Error('等待機台確認逾時'))
      }, timeoutMs)

      client.on('connect', () => {
        const topic = `devices/${hid}/auth`

        // 先 subscribe，再 publish，確保不漏訊息
        client.subscribe(topic, { qos: 1 }, (err) => {
          if (err) {
            clearTimeout(timer)
            client.end()
            reject(err)
            return
          }

          // Subscribe 成功後 publish 認證結果
          const msg = JSON.stringify({ ...payload, timestamp: Date.now() })
          client.publish(topic, msg, { qos: 1 }, (pubErr) => {
            if (pubErr) {
              clearTimeout(timer)
              client.end()
              reject(pubErr)
            }
            // 等待 gui-replenish 的 nonce_verify 回應
          })
        })
      })

      client.on('message', (_topic, message) => {
        try {
          const data = JSON.parse(message.toString())
          if (data.stage === 'nonce_verify' && data.nonce === payload.nonce) {
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

  return { publishCheckin, publishAndWaitNonce }
}
