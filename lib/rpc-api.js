
exports.createApi = send => {
  const createMethod = method => (...params) => send({ method, params })
  return {
    getBalance: createMethod('eth_getBalance'),
    getBlockNumber: createMethod('eth_blockNumber'),
    sendRawTransaction: createMethod('eth_sendRawTransaction'),
    // syncing: createMethod('eth_syncing'),
  }
}
