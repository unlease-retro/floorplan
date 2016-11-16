const isDevelopment = process.env.NODE_ENV === 'development'

const fs = require('fs')
const jsonfile = require('jsonfile')
const nightmare = require('nightmare')({ show: !isDevelopment, width: 1280 })
const s3 = require('s3')
const schedule = require('node-schedule')
const xml = require('xml')

const BASE_URL = { url: isDevelopment ? 'https://gitmoji.carloscuesta.me/' : 'https://www.unlease.io/', depth: 0 }
const SORTED = true
const SCHEDULE = isDevelopment ? '*/10 * * * * *' : '0 0 0 * * *'

const JSON_OUTPUT = 'sitemap.json'
const XML_OUTPUT = 'sitemap.xml'

const S3_ACCESS_KEY = 'AKIAJJ33TA4LLJ7BCDLA'
const S3_SECRET_KEY = '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'
const S3_REGION = 'eu-west-1'
const S3_BUCKET = isDevelopment ? 'assets-staging.unlease.io' : 'assets.unlease.io'
const S3_PATH = `static/seo/${XML_OUTPUT}`

const cache = {
  found: [], // [ { url, depth } ]
  queued: [], // [ { url, depth } ]
  finished: [], // [ url ]
}

const s3Client = s3.createClient({ s3Options: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY, region: S3_REGION } })
const s3UploadParams = { localFile: XML_OUTPUT, s3Params: { Bucket: S3_BUCKET, Key: S3_PATH } }

const getIsValidUrl = url => /^http|^mailto|^#|^\/$/.test(url)
const getInternalUrl = url => url.replace(/^\//, BASE_URL.url).replace(/\/$/, '')
const getSortedLinks = links => links.sort( ({ url: a }, { url: b }) => a < b ? -1 : a > b ? 1 : 0 )

const writeJSONOutput = json => jsonfile.writeFileSync(JSON_OUTPUT, json, { spaces: 2 })
const writeXMLOutput = xml => fs.writeFileSync(XML_OUTPUT, xml)

const resetCache = () => Object.keys(cache).map( c => cache[c].length = 0 )

const fetchUrl = ({ url, depth }) => {

  console.log(`🔫  ${url}`)

  cache.finished.push(url)

  return nightmare
    .goto(url)
    .evaluate( () => Array.from(document.querySelectorAll('a')).map( a => ({ href: a.getAttribute('href') }) ) )
    .then( links => processLinks(links, depth) )

}

const processLinks = (links, depth) => {

  links.map( ({ href }) => {

    if ( !href || getIsValidUrl(href) ) return

    let internal = getInternalUrl(href)
    let isQueued = cache.queued.find(link => link.url === internal)
    let isFinished = cache.finished.indexOf(internal) > -1

    if ( !isFinished && !isQueued ) {

      let nextDepth = depth + 1

      console.log(`🔍  ${internal}`)

      cache.found.push({ url: href, depth: nextDepth })

      cache.queued.push({ url: internal, depth: nextDepth })

    }

  } )

  if (cache.queued.length) return fetchUrl( cache.queued.shift() )

  const output = SORTED && getSortedLinks(cache.found) || cache.found

  return writeJSONOutput(output)

}

const generateXML = json => {

  const urlset = json.map( j => ({ url: [ { loc: `${ BASE_URL.url }${ j.url.substring(1) }` } ] }) )

  const output = xml([ { urlset } ], { indent: ' ', declaration: { encoding: 'UTF-8' } })

  return writeXMLOutput(output)

}

const uploadToS3 = () => {

  return new Promise( (resolve, reject) => {

    const s3Upload = s3Client.uploadFile(s3UploadParams)

    // s3Upload.on( 'progress', () => console.log('progress', s3Upload.progressAmount, s3Upload.progressTotal) )

    s3Upload.on( 'error', err => reject(err) )

    s3Upload.on( 'end', () => resolve() )

  })

}

const job = schedule.scheduleJob( SCHEDULE, () => {

  resetCache()

  fetchUrl(BASE_URL)
    .then( () => console.log('✨  scrape done') )
    // .then( () => nightmare.end() )
    .then( () => generateXML(cache.found) )
    .then( () => console.log('✨  output done') )
    .then( () => uploadToS3() )
    .then( () => console.log('✨  upload done') )
    .catch( err => console.error(err) )

})
