const { createBlockchainAPI } = require('./')
const api = createBlockchainAPI({
  baseUrl: 'http://localhost:9898/ropsten'
})

const prettify = obj => JSON.stringify(obj, null, 2)

const run = async () => {
  const apiCalls = {
    info: api.info(),
    'blocks.latest': api.blocks.latest(),
    'transactions.get': api.transactions.get([
      '0bae60d0b76a52ec0d363e06b58db2c944a23e1805b0a5ae00a957f9a5b05e8b',
      '16ffed40e0dc66b6e2c7b25fe2a3626def7a04e7e3f024c702fab018beb9b961',
    ]),
    'addresses.balance': api.addresses.balance('00895fa70d5dC4d8A21B9EcB4f69d51b12607d20'),
    'addresses.transactions': api.addresses.transactions([
      '00895fa70d5dC4d8A21B9EcB4f69d51b12607d20',
    ])
  }

  for (let p in apiCalls) {
    apiCalls[p] = await apiCalls[p]
  }

  return apiCalls
}

/* eslint-disable */
run().then(
  result => console.log(prettify(result)),
  console.error
)
