const got = require('got')
const { createNonce, createTimestamp } = require('../mUtils')

const wxGot = got.extend({
  baseUrl: 'https://api.weixin.qq.com/cgi-bin/',
  json: true,
  hooks: {
    afterResponse: [
      res => res.statusCode === 200 ? JSON.parse(res.body) : null
    ]
  }
})

const api = {
  accessToken: 'token?grant_type=client_credential',
  user: {
    info: 'user/info?',
  },
  QRCodeTicket: 'qrcode/create?',
  QRCode: 'showqrcode?'
}

class Wechat {
  constructor (opts) {
    this.opts = Object.assign({}, opts)
    this.appID = opts.appID
    this.appSecret = opts.appSecret
    this.getAccessToken = opts.getAccessToken
    this.saveAccessToken = opts.saveAccessToken
    this.getTicket = opts.getTicket
    this.saveTicket = opts.saveTicket

    this.fetchAccessToken(true)
  }

  async fetchAccessToken (init = false) {
    let token = await this.getAccessToken()

    if (!token) {
      token = await this.updateAccessToken()
      await this.saveAccessToken(token)
      token = token.access_token
    }
    return token
  }

  async updateAccessToken () {
    const url = api.accessToken + '&appid=' + this.appID + '&secret=' + this.appSecret
    return await wxGot(url)
  }

  async handle (operation, ...args) {
    const token = await this.fetchAccessToken()
    if (!token) return {}

    const options = this[operation](token, ...args)
    let res = await wxGot(options)

    return res
  }

  getUserInfo (token, openID, lang) {
    const url = `${api.user.info}access_token=${token}&openid=${openID}&lang=${lang || 'zh_CN'}`

    return { url: url }
  }

  getQRCodeTicket (token, sceneStr, timeout) {
    return {
      url: `${api.QRCodeTicket}access_token=${token}`,
      method: 'post',
      body: {
        "expire_seconds": timeout || 60,
        "action_name": "QR_STR_SCENE", // 临时二维码
        "action_info": {
          "scene": {
            "scene_str": sceneStr
          }
        }
      }
    }
  }
}

module.exports = Wechat
