// const uuidv1 = require('uuid/v1')
const crypto = require('crypto')

// function uuid() {
//   return uuidv1()
// }

function MD5 (str) {
  let result = crypto.createHash('md5').update(str.toString()).digest('hex')
  return result
}

function SHA1 (str) {
  let result = crypto.createHash('sha1').update(str.toString()).digest('hex')
  return result
}

function isInteger (num, zero = false, unsigned = false) {
  num = +num
  let res = Number.isInteger(num)

  if (res && !unsigned) res = num > 0 - zero ? num : false
  return res
}

function fmtNormalXML (xml) {
  let message = {}

  if (typeof xml === 'object') {
    const keys = Object.keys(xml)

    for (let i = 0; i < keys.length; i++) {
      let item = xml[keys[i]]
      let key = keys[i]

      if (!(item instanceof Array) || item.length === 0) {
        continue
      }

      if (item.length === 1) {
        let val = item[0]

        if (typeof val === 'object') {
          message[key] = fmtNormalXML(val)
        } else {
          message[key] = (val || '').trim()
        }
      } else {
        message[key] = []

        for (let j = 0; j < item.length; j++) {
          message[key].push(fmtNormalXML(item[j]))
        }
      }
    }
  }

  return message
}

function createNonce (len = 15) {
  return Math.random().toString(36).substr(2, len)
}

function createTimestamp () {
  return parseInt(new Date().getTime() / 1000, 0) + ''
}

function streamToBuffer(stream) {  
  return new Promise((resolve, reject) => {
    let buffers = []
    stream.on('error', reject)
    stream.on('data', (data) => buffers.push(data))
    stream.on('end', () => resolve(Buffer.concat(buffers)))
  })
}

module.exports = {
  MD5,
  SHA1,
  isInteger,
  fmtNormalXML,
  createNonce,
  createTimestamp,
  streamToBuffer
}
