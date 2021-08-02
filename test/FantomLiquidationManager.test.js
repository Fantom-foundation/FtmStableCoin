const {
    BN,
    constants,
    expectEvent,
    expectRevert,
  } = require('@openzeppelin/test-helpers')
const { ZERO_ADDRESS } = constants
  
const { expect } = require('chai')

const FantomLiquidationManager = artifacts.require('FantomLiquidationManager')

const addressProvider = '0xcb20a1A22976764b882C2f03f0C8523F3df54b10';

contract('Unit Test for FantomLiquidationManager', function ([owner]) {

    beforeEach(async function () {
        this.fantomLiquidationManager = await FantomLiquidationManager.new ({from:owner})
        await this.fantomLiquidationManager.initialize(owner, addressProvider)
    })

    describe('view functions', function () {
        it('gets collateral pool', async function() {
            const collateralPool = await this.fantomLiquidationManager.getCollateralPool();
            console.log(collateralPool);
        })

        it('gets debt pool', async function() {
            const debtPool = await this.fantomLiquidationManager.getDebtPool();
            console.log(debtPool);
        })

    })
})