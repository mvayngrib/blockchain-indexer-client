
// source: eth-lib

const { post } = require('./utils')
const { createApi } = require('./rpc-api')
const genPayload = (() => {
  let nextId = 0
  return (method, params) => ({
    jsonrpc: '2.0',
    id: ++nextId,
    method,
    params,
  })
})()

const createSend = url => (method, params) => send(url, method, params)
const send = async (url, method, params) => {
  try {
    const body = genPayload(method, params)
    const { error, result } = await post({ url, body })
    if (error) {
      throw new Error(error.message)
    }

    return result
  } catch (err) {
    return { error: err.toString() }
  }
}

module.exports = {
  send,
  createSend,
  createApi: url => createApi(createSend(url)),
}
