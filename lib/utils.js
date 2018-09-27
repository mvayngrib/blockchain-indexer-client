const querystring = require('querystring')
const _fetch = require('isomorphic-fetch')

const fetch = async (...args) => {
  const res = await _fetch(...args)
  if (!res.ok || res.status > 300) {
    // blockchain-indexer err response format is { type, message } json
    let err
    try {
      const { type, message } = await res.json()
      err = new Error(message)
      err.type = type
    } catch (e) {
      err = new Error(res.statusText)
    }

    throw err
  }

  return await res.json()
}

const get = async ({
  url,
  query={},
  headers={},
}) => fetch(`${url}?${querystring.stringify(query)}`, {
  headers
})

const post = async ({ url, body, headers={} }) => fetch(url, {
  method: 'POST',
  body: JSON.stringify(body),
  headers: {
    'Content-Type': 'application/json',
    ...headers,
  }
})

const prefixHex = str => str.startsWith('0x') ? str : `0x${str}`
const unprefixHex = str => str.startsWith('0x') ? str.slice(2) : str
const isTypeOf = (val, type) => {
  if (type === 'Buffer') return Buffer.isBuffer(val)

  return typeof val === type
}

const assertOptionType = (obj, opt, optType) => {
  const val = obj[opt]
  if (Array.isArray(optType)) {
    const ok = optType.some(sub => isTypeOf(val, sub))
    if (!ok) {
      throw new Error(`expected "${opt}" to be one of ${optType.join(', ')}`)
    }
  } else if (!isTypeOf(val, optType)) {
    throw new Error(`expected ${optType} "${opt}"`)
  }
}

const postProcessResponse = ({ error, result }) => {
  if (error) {
    throw new Error(error.message)
  }

  return result
}

module.exports = {
  fetch,
  get,
  post,
  prefixHex,
  unprefixHex,
  assertOptionType,
  postProcessResponse,
}
