const {
    BN,
    constants,
    expectEvent,
    expectRevert,
  } = require('@openzeppelin/test-helpers')
const { ZERO_ADDRESS } = constants
  
const { expect } = require('chai')


const FantomLiquidationManager = artifacts.require('FantomLiquidationManager');
const FantomMintTokenRegistry = artifacts.require('FantomMintTokenRegistry');
const FantomDeFiTokenStorage = artifacts.require('FantomDeFiTokenStorage');
const FantomMint = artifacts.require('FantomMint');
const FantomMintAddressProvider = artifacts.require('FantomMintAddressProvider');

const wFTM = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83';

const weiToEther = (n) => {
    return web3.utils.fromWei(n.toString(), 'ether');
}


contract('Unit Test for FantomLiquidationManager', function ([owner, admin, account]) {

    beforeEach(async function () {
        this.fantomMintAddressProvider = await FantomMintAddressProvider.new({from:owner});
        await this.fantomMintAddressProvider.initialize(owner);

        this.fantomLiquidationManager = await FantomLiquidationManager.new({from:owner})
        await this.fantomLiquidationManager.initialize(owner, this.fantomMintAddressProvider.address);
        
        this.fantomMint = await FantomMint.new({form: owner});
        await this.fantomMint.initialize(owner, this.fantomMintAddressProvider.address);

        this.fantomMintTokenRegistry = await FantomMintTokenRegistry.new();
        await this.fantomMintTokenRegistry.initialize(owner);

        this.collateralPool = await FantomDeFiTokenStorage.new({from: owner});
        await this.collateralPool.initialize(this.fantomMintAddressProvider.address, true);
        
        this.debtPool = await FantomDeFiTokenStorage.new({from: owner});
        await this.debtPool.initialize(this.fantomMintAddressProvider.address, true);   
        
        await this.fantomMintAddressProvider.setFantomMint(this.fantomMint.address, {from: owner});
        await this.fantomMintAddressProvider.setCollateralPool(this.collateralPool.address, {from: owner});
        await this.fantomMintAddressProvider.setDebtPool(this.debtPool.address, {from: owner});
    })

    describe('view functions', function () {

        it('gets a token', async function() {
            //const token = await this.collateralPool.tokens(0);
            //console.log(token);
        })

        it('gets all tokens', async function() {
            const tokens = await this.collateralPool.getTokens();
            console.log(tokens);
        })

        it('gets the tokens count', async function() {
            const tokensCount = await this.collateralPool.tokensCount();
            console.log(tokensCount.toString());
        })

        it('gets collateral pool', async function() {
            const collateralPool = await this.fantomLiquidationManager.getCollateralPool();
            //console.log(collateralPool);
            expect(collateralPool).to.be.equal(this.collateralPool.address);
        })

        it('gets debt pool', async function() {
            const debtPool = await this.fantomLiquidationManager.getDebtPool();
            //console.log(debtPool);
            expect(debtPool).to.be.equal(this.debtPool.address);

        })

        it('checks if the collateral of an account is eligible for rewards', async function() {
            //const isEligible = await this.fantomLiquidationManager.collateralIsEligible(account);
            //console.log('isEligible: ', isEligible);
            //expect(isEligible).to.be.equal(true);
        })

        it('gets the live status', async function () {
            /* const live = await this.fantomLiquidationManager.live();
            console.log('live status: ', live.toString());
            expect(live).to.be.equal(true); */
        })

    })

    describe('liquidation', function () {        
        
        beforeEach(async function () {
            await this.fantomLiquidationManager.addAdmin(admin, {from:owner});
            //console.log(this.fantomMintTokenRegistry);

        })

        it('gets tokens count', async function() {
            /* const tokensCount = await this.collateralPool.tokensCount();
            console.log(tokensCount.toString()); */
        })

        it('gets tokens', async function() {
            /* const token = await this.collateralPool.tokens(0);
            console.log('token: ', token);
            console.log('account: ', account);
            const debtValueOf = this.fantomMint.debtValueOf(account, token, 0);
            console.log('debtValueOf: ', debtValueOf); */

        })        

        it('can deposit wFTM', async function() {
/*             const canDeposit = await this.fantomMintTokenRegistry.canDeposit(wFTM);
            console.log(canDeposit);
            expect(canDeposit).to.be.equal(true); */
        })

        it('starts liquidation', async function() {            
            //await this.fantomLiquidationManager.startLiquidation(account, {from: admin});
        })
    })
})