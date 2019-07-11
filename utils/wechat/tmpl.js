const util = require('util')

const msgTemplet = `
<xml>
  <ToUserName><![CDATA[%s]]></ToUserName>
  <FromUserName><![CDATA[%s]]></FromUserName>
  <CreateTime>%d</CreateTime>
  <MsgType><![CDATA[%s]]></MsgType>
  $msgBody$
</xml>
`

const textMsg = `<Content><![CDATA[%s]]></Content>`
const imageMsg = `<Image><MediaId><![CDATA[%s]]></MediaId></Image>`
const voiceMsg = `<Voice><MediaId><![CDATA[%s]]></MediaId></Voice>`
const videoMsg = `
<Video>
  <MediaId><![CDATA[%s]]></MediaId>
  <Title><![CDATA[%s]]></Title>
  <Description><![CDATA[%s]]></Description>
</Video>
`

const musicMsg = `
<Music>
  <Title><![CDATA[%s]]></Title>
  <Description><![CDATA[%s]]></Description>
  <MusicUrl><![CDATA[%s]]></MusicUrl>
  <HQMusicUrl><![CDATA[%s]]></HQMusicUrl>
  <ThumbMediaId><![CDATA[%s]]></ThumbMediaId>
</Music>
`

const newsMsg = `
<ArticleCount>%d</ArticleCount>
  <Articles>
    <item>
      <Title><![CDATA[%s]]></Title>
      <Description><![CDATA[%s]]></Description>
      <PicUrl><![CDATA[%s]]></PicUrl>
      <Url><![CDATA[%s]]></Url>
    </item>
  </Articles>
`

module.exports = (ctx, originMsg) => {
  let type = (ctx && ctx.type) || 'text'
  let msgTmpl = util.format(msgTemplet,
    originMsg.FromUserName,
    originMsg.ToUserName,
    Math.floor(new Date().getTime() / 1000),
    type
  )

  let body = ''

  switch (type) {
    case 'text':
      body = util.format(textMsg, ctx)
      break
    case 'image':
      break
    case 'voice':
      break
    case 'video':
      break
    case 'music':
      break
    case 'news':
      break
    default:
      body = util.format(textMsg, '操作无效')
  }

  return msgTmpl.replace(/\$msgBody\$/, body)
}
