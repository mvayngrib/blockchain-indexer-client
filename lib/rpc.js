
// source: eth-lib

const { post, postProcessResponse } = require('./utils')
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

const createSend = ({ url, apiKey }) => ({ method, params }) => send({ url, apiKey, method, params })
const send = async ({ url, apiKey, method, params }) => {
  const body = genPayload(method, params)
  const headers = {}
  if (apiKey) headers.Authorization = apiKey

  const resp = await post({ url, body, headers })
  return postProcessResponse(resp)
}

module.exports = {
  send,
  createSend,
  createApi: url => createApi(createSend(url)),
}
