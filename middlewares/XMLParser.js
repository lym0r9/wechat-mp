const parseXML = require('xml2js').parseString
const debug = require('debug')('xml-parse')

const parse = (req, options = {}) => {
  return new Promise((resolve, reject) => {
    let xml = ''
    req.on('data', chunk => { xml += chunk.toString('utf-8') })
    .on('error', reject)
    .on('end', () => parseXML(xml, options, (err, res) => {
      if (err) reject(err)
      resolve(res)
    }))
  })
}

module.exports = async (ctx, next) => {
  if (ctx.request.type === 'text/xml' || ctx.is('xml')) {
    try {
      ctx.request.body = await parse(ctx.req)
    } catch (e) {
      debug(e.message)
    }
  }
  await next()
}
