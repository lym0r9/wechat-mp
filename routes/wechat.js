const Router = require('../vendor/koa-router')
const wechatController = require('../controllers/wechat')
const { createQRCodeMB } = require('../controllers/wechat')


const router = new Router({
  prefix: '/wechat'
})

// 测试号配置接口信息时需要校验，但传输的数据跟推送消息一样，所以放在同一个controller里处理
// conntroller的完整path是/wechat/event，这个后面配置测试号URL的时候会用到
router
  .get('/', ctx => ctx.body = 'hello wechat')
  .get('/event', wechatController)
  .post('/event', wechatController)
  .get('/qrcode', createQRCodeMB)
  .get('/check', ctx => ctx.body = { errno: 1 })

module.exports = router
