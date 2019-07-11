const http = require('http')
const Koa = require('./vendor/koa2/application')
const XMLParser = require('./middlewares/XMLParser')
const router = require('./routes/wechat')
const app = new Koa()

app.use(XMLParser)

app.use(router.routes())
app.use(router.allowedMethods())

const port = 3000;
http.createServer(app.callback()).listen(port);
console.log(' Now start API server on port ' + port + '...')