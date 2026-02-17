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

  return { publishCheckin }
}
