const EthereumTx = require('ethereumjs-tx')
const ethUtil = require('ethereumjs-util')
const { createApi } = require('./rpc')
const utils = require('./utils')
const Errors = require('./errors')
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

const pipe = fns => input => fns.reduce((chain, func) => chain.then(func), Promise.resolve(input))
const getResultProp = ({ result }) => result
const createBaseClient = opts => {
  let { networkName, baseUrl, apiKey } = opts

  // trim trailing slashes
  baseUrl = baseUrl.replace(/[/]+$/, '')

  const headers = {}
  if (apiKey) headers.authorization = apiKey

  const {
    getBlockNumber,
    getBalance,
    sendRawTransaction,
  } = createApi(`${baseUrl}/rpc`)

  const etherscan = {
    getBlockNumber: async () => {
      const { result } = await utils.get({
        url: `https://api-${networkName}.etherscan.io/api`,
        query: {
          module: 'proxy',
          action: 'eth_blockNumber'
        }
      })

      return result
    }
  }

  const get = pipe([
    ({ path, query }) => utils.get({
      url: `${baseUrl}${path}`,
      query,
      headers,
    }),
    getResultProp
  ])

  const post = pipe([
    ({ path, body }) => utils.post({
      url: `${baseUrl}${path}`,
      body,
      headers,
    }),
    getResultProp
  ])

  const getSendTransactionDefaults = tx => post({
    path: '/txDefaults',
    body: { tx }
  })

  const sendSignedTransaction = pipe([
    sendRawTransaction,
    txId => ({ txId })
  ])

  const getProcessedBlockNumber = () => get({ path: '/blockNumber' }).then(getResultProp)

  const getTransactionsForAddresses = pipe([
    ({ addresses, blockHeight }) => get({
      path: '/addresses',
      query: { addresses, blockHeight, lookupTxs: true }
    }),
    postProcessTxsBatch,
  ])

  const getTransactions = pipe([
    hashes => get({
      path: '/txs',
      query: { hashes }
    }),
    postProcessTxsBatch,
  ])

  const getBlocksBehindEtherscan = async () => {
    const [actual, ours] = await Promise.all([
      etherscan.getBlockNumber(),
      getBlockNumber()
    ])

    return parseInt(actual, 'hex') - parseInt(ours, 'hex')
  }

  const isSynced = async () => {
    const behind = getBlocksBehindEtherscan()
    // 3 blocks behind is ok
    return behind < 3
  }

  const ensureSynced = async () => {
    const is = await isSynced()
    if (!is) throw new Errors.NotSynced()
  }

  // const getTransaction = async (hash) => {
  //   const txs = await getTransactions([hash])
  //   return txs[0]
  // }

  return {
    getSendTransactionDefaults,
    sendSignedTransaction,
    getBlockNumber,
    getProcessedBlockNumber,
    getBalance: address => getBalance(prefixHex(address)),
    getTransactionsForAddresses,
    getTransactions,
    ensureSynced,
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

    await client.ensureSynced()

    if (logger) logger.debug('sending transaction')
    if (typeof gasPrice === 'string') {
      gasPrice = hexint(gasPrice)
    }

    let params = {
      from: prefixHex(address),
      to: prefixHex(to.address),
      gasLimit, // 21000 is min?
      // gasPrice: prefixHex(gasPrice),
      value: prefixHex(hexint(to.amount)),
      // EIP 155 chainId - mainnet: 1, ropsten: 3, rinkeby: 54
      chainId,
    }

    if (data) {
      params.data = data
    }

    const defaults = await client.getSendTransactionDefaults(params)
    params = Object.assign({}, defaults, params)

    const tx = new EthereumTx(params)
    tx.sign(privateKey)
    const txHex = tx.serialize().toString('hex')

    try {
      await client.sendSignedTransaction(txHex)
    } catch (err) {
      if (err.type !== 'Duplicate') {
        if (err.type === 'InsufficientFunds') {
          err.message = `insuffient funds on address: ${address}`
        }

        throw err
      }
    }

    return tx.hash(true).toString('hex')
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

const forNetwork = opts => {
  assertOptionType(opts, 'networkName', 'string')
  assertOptionType(opts, 'baseUrl', 'string')
  if ('apiKey' in opts) {
    assertOptionType(opts, 'apiKey', 'string')
  }

  let { networkName, baseUrl, apiKey, constants } = opts
  if (!constants) constants = networks[networkName]

  const client = createBaseClient({ networkName, baseUrl, apiKey })
  const api = wrapClient(client)
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
  }
}

const wrapClient = client => {
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
  forNetwork,
  wrapClient,
  createTransactor,
  pubKeyToAddress,
}
