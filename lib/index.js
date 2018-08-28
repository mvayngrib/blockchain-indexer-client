const EthereumTx = require('ethereumjs-tx')
const ethUtil = require('ethereumjs-util')
const utils = require('./utils')
const {
  prefixHex,
  unprefixHex,
  assertOptionType,
} = utils

const networks = require('./networks')

const MIN_GAS_LIMIT = 21000
const WEI = 1000000000
const hexint = n => n.toString(16)
const gasPriceByPriority = {
  // aim for next few minutes
  low: hexint(2 * WEI), // 2 gwei
  // aim for next few blocks
  high: hexint(20 * WEI), // 20 gwei
  // aim for next block
  top: hexint(40 * WEI), // 40 gwei
}

const propGetter = prop => obj => obj[prop]

const createClient = ({ baseUrl }) => {
  const get = (path, query) => utils.get(`${baseUrl}${path}`, query)
  const post = (path, body) => utils.post(`${baseUrl}${path}`, body)
  const sendSignedTransaction = async (txHex) => {
    const { hash } = await post('/sendSignedTransaction', { txHex })
    return { txId: hash }
  }

  const getBlockNumber = () => get('/blockNumber').then(propGetter('blockNumber'))
  const getProcessedBlockNumber = () => get('/processedBlockNumber').then(propGetter('blockNumber'))
  const getBalance = address => get(`/balance/${address}`).then(propGetter('balance'))

  const getTransactionsForAddresses = async ({ addresses, blockHeight }) => {
    const result = await get('/addresses', { addresses, blockHeight, lookupTxs: true })
    return postProcessTxsBatch(result)
  }

  const getTransactions = async (hashes) => {
    const result = await get('/txs', { hashes })
    return postProcessTxsBatch(result)
  }

  // const getTransaction = async (hash) => {
  //   const txs = await getTransactions([hash])
  //   return txs[0]
  // }

  return {
    sendSignedTransaction,
    getBlockNumber,
    getProcessedBlockNumber,
    getBalance,
    getTransactionsForAddresses,
    getTransactions,
  }
}

const postProcessTxsBatch = ({ txs, blockNumber }) => {
  return txs.map(tx => parseTxs({ tx, blockNumber }))
}

const parseTxs = ({ tx, blockNumber }) => ({
  blockHeight: blockNumber,
  txId: unprefixHex(tx.hash),
  confirmations: blockNumber - tx.blockNumber,
  from: {
    addresses: [tx.from].map(unprefixHex)
  },
  to: {
    addresses: [tx.to].map(unprefixHex)
  },
  data: unprefixHex(tx.input || '')
})

const createTransactor = opts => {
  assertOptionType(opts, 'client', 'object')
  assertOptionType(opts, 'chainId', 'number')
  assertOptionType(opts, 'address', 'string')
  assertOptionType(opts, 'privateKey', ['string', 'Buffer'])

  let { client, chainId, address, privateKey, logger } = opts
  if (typeof privateKey === 'string') {
    privateKey = new Buffer(unprefixHex(privateKey), 'hex')
  }

  const signAndSend = async ({
    to,
    data,
    gasLimit=MIN_GAS_LIMIT,
    gasPrice=gasPriceByPriority.low
  }) => {
    if (to.length !== 1) {
      throw new new Error('only one recipient allowed')
    }

    to = to.map(({ address, amount }) => ({ address, amount }))[0]

    if (logger) logger.debug('sending transaction')
    if (typeof gasPrice === 'string') {
      gasPrice = hexint(gasPrice)
    }

    const params = {
      gasLimit, // 21000 is min?
      gasPrice: prefixHex(gasPrice),
      from: prefixHex(address),
      to: prefixHex(to.address),
      value: prefixHex(hexint(to.amount)),
      // EIP 155 chainId - mainnet: 1, ropsten: 3, rinkeby: 54
      chainId,
    }

    if (data) {
      params.data = data
    }

    const tx = new EthereumTx(params)
    tx.sign(privateKey)
    const txHex = tx.serialize().toString('hex')

    try {
      return await client.sendSignedTransaction(txHex)
    } catch (err) {
      if (err.type === 'InsufficientFunds') {
        err.message = `insuffient funds on address: ${address}`
      }

      throw err
    }
  }

  return {
    multipleRecipientsAllowed: false,
    send: signAndSend,
    balance: client.getBalance
  }
}

const pubKeyToAddress = pub => {
  if (pub.length === 65) pub = pub.slice(1)

  return ethUtil.publicToAddress(pub).toString('hex')
}

const createNetwork = ({ networkName, constants, baseUrl }) => {
  if (!constants) constants = networks[networkName]

  const client = createClient({ baseUrl })
  const api = createBlockchainAPI({ client })
  return {
    blockchain: 'ethereum',
    name: networkName,
    minOutputAmount: 1,
    constants,
    curve: 'secp256k1',
    pubKeyToAddress,
    api,
    createTransactor: (opts={}) => createTransactor({
      client,
      chainId: constants.chainId,
      ...opts
    }),
    createBlockchainAPI: (opts={}) => createBlockchainAPI({
      client,
      ...opts,
    }),
  }
}

const createBlockchainAPI = ({ client, baseUrl }) => {
  if (!client) client = createClient({ baseUrl })

  const getLatestBlock = () => client.getProcessedBlockNumber()
  const getTransactionsForAddresses = (addresses, blockHeight) => {
    return client.getTransactionsForAddresses({ addresses, blockHeight })
  }

  return {
    info: getLatestBlock,
    blocks: {
      latest: getLatestBlock
    },
    transactions: {
      get: client.getTransactions,
      propagate: client.sendSignedTransaction,
    },
    addresses: {
      transactions: getTransactionsForAddresses,
      balance: client.getBalance,
    },
  }
}

module.exports = {
  createNetwork,
  createBlockchainAPI,
  createTransactor,
  pubKeyToAddress,
}
