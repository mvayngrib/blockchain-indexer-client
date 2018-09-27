const ethUtil = require('ethereumjs-util')
const { forNetwork } = require('./')
const networkName = 'ropsten'
const baseUrl = `http://parity-ropsten-2-764848607.us-east-1.elb.amazonaws.com/eth
/v1/${networkName}`
const privateKey = new Buffer('6c41f4214e6131817aff3a5bdd891c1df907f55e0c3b789251199af5e47a319e', 'hex')
const address = ethUtil.privateToAddress(privateKey).toString('hex')

const net = forNetwork({ networkName, baseUrl })
// const { api } = net
const transactor = net.createTransactor({ privateKey, address })
const prettify = obj => JSON.stringify(obj, null, 2)

const run = async () => {
  const apiCalls = {
    // info: api.info(),
    // 'blocks.latest': api.blocks.latest(),
    // 'transactions.get': api.transactions.get([
    //   '0bae60d0b76a52ec0d363e06b58db2c944a23e1805b0a5ae00a957f9a5b05e8b',
    //   '16ffed40e0dc66b6e2c7b25fe2a3626def7a04e7e3f024c702fab018beb9b961',
    // ]),
    // 'addresses.balance': api.addresses.balance('00895fa70d5dC4d8A21B9EcB4f69d51b12607d20'),
    // 'addresses.transactions': api.addresses.transactions([
    //   '00895fa70d5dC4d8A21B9EcB4f69d51b12607d20',
    // ]),
    // send self min amount
    send: transactor.send({
      to: [{
        address,
        amount: net.minOutputAmount
      }]
    })
  }

  let err
  for (let p in apiCalls) {
    try {
      apiCalls[p] = await apiCalls[p]
    } catch (e) {
      err = e
    }
  }

  if (err) throw err

  return apiCalls
}

/* eslint-disable */
run().then(
  result => console.log(prettify(result)),
  err => console.error(prettify({ type: err.type, message: err.message }))
)
