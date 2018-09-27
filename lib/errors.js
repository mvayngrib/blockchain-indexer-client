class NotSynced extends Error {
  constructor(message) {
    super(message)
    this.type = 'NotSynced'
  }
}

module.exports = {
  NotSynced,
}
