const jsonfile = require('jsonfile')
const nightmare = require('nightmare')({ show: true, width: 1280 })

const BASE_URL = { url: 'https://www.unlease.io/', depth: 0 }
const SORTED = true

const JSON_OUTPUT = 'sitemap.json'

let found = [] // [ { url, depth } ]
let queued = [] // [ { url, depth } ]
let finished = [] // [ url ]

const getIsValidUrl = url => /^http|^mailto|^#|^\/$/.test(url)
const getInternalUrl = url => url.replace(/^\//, BASE_URL.url).replace(/\/$/, '')
const getSortedLinks = links => links.sort( ({ url: a }, { url: b }) => a < b ? -1 : a > b ? 1 : 0 )

const writeOutput = () => jsonfile.writeFileSync(JSON_OUTPUT, SORTED && getSortedLinks(found) || found, { spaces: 2 })

const fetchUrl = ({ url, depth }) => {

  console.log(`🔫  ${url}`)

  finished.push(url)

  return nightmare
    .goto(url)
    .evaluate( () => Array.from(document.querySelectorAll('a')).map( a => ({ href: a.getAttribute('href') }) ) )
    .then( links => processLinks(links, depth) )

}

const processLinks = (links, depth) => {

  links.map( ({ href }) => {

    if ( !href || getIsValidUrl(href) ) return

    let internal = getInternalUrl(href)
    let isQueued = queued.find(link => link.url === internal)
    let isFinished = finished.indexOf(internal) > -1

    if ( !isFinished && !isQueued ) {

      let nextDepth = depth + 1

      console.log(`🔍  ${internal}`)

      found.push({ url: href, depth: nextDepth })

      queued.push({ url: internal, depth: nextDepth })

    }

  } )

  if (queued.length) return fetchUrl( queued.shift() )

  return writeOutput()

}

fetchUrl(BASE_URL)
  .then( () => console.log('🍍  output done') )
  .then( () => nightmare.end() )
  .catch( err => console.error(err) )
