const { WXMP } = require('../../config')
const { redis } = require('../dbHelper')

const config = {
  MP: {
    appID: WXMP.appID,
    appSecret: WXMP.appSecret,
    token: WXMP.token,
    getAccessToken: async () => {
      let token = await redis.get('access_token')
      return token
    },
    saveAccessToken: async (data = {}) => {
      await redis.set('access_token', data.access_token ,'EX', data.expires_in)
    }
  }
}

module.exports = {
  ...config
}
