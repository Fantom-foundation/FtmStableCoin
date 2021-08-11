const {
    BN,
    constants,
    expectEvent,
    expectRevert,
  } = require('@openzeppelin/test-helpers')
  const { ZERO_ADDRESS } = constants
  
  const { expect } = require('chai')
  
  const FantomFUSD = artifacts.require('FantomFUSD')

  contract('Unit Test for FantomFUSD', function ([owner]){

    const name = 'Fantom USD'
    const symbol = 'FUSD'

    beforeEach(async function () {
        this.token = await FantomFUSD.new ({from:owner})
        await this.token.initialize(owner)
    })

    describe('metadata', function () {
        it('has a name', async function () {

        }
    )
    })
  })