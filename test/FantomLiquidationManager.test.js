const {
    BN,
    constants,
    expectEvent,
    expectRevert,
  } = require('@openzeppelin/test-helpers')
const { ZERO_ADDRESS } = constants
  
const { expect } = require('chai')


const FantomLiquidationManager = artifacts.require('FantomLiquidationManager');
const IFantomMintTokenRegistry = artifacts.require('IFantomMintTokenRegistry');
const IFantomDeFiTokenStorage = artifacts.require('IFantomDeFiTokenStorage');

const fantomMintTokenRegistryAddress = '0x5AC50E414bB625Ce7dC17aD165A604bf3cA8FD23';

const addressProvider = '0xcb20a1A22976764b882C2f03f0C8523F3df54b10';
const wFTM = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83';

const weiToEther = (n) => {
    return web3.utils.fromWei(n.toString(), 'ether');
}

const collateralPoolAddress = '0xC25012DadAd30c53290e1d77c48308cafA150A81';


contract('Unit Test for FantomLiquidationManager', function ([owner, admin, account]) {

    beforeEach(async function () {
        this.fantomLiquidationManager = await FantomLiquidationManager.new ({from:owner})
        await this.fantomLiquidationManager.initialize(owner, addressProvider)
        
        this.fantomMintTokenRegistry = await IFantomMintTokenRegistry.at(fantomMintTokenRegistryAddress);
        this.collateralPool = await IFantomDeFiTokenStorage.at(collateralPoolAddress);
        //console.log(this.collateralPool);
    })

    describe('view functions', function () {
        it('gets collateral pool', async function() {
            const collateralPool = await this.fantomLiquidationManager.getCollateralPool();
            console.log(collateralPool);
            expect(collateralPool).to.be.equal('0xC25012DadAd30c53290e1d77c48308cafA150A81');
        })

        it('gets debt pool', async function() {
            const debtPool = await this.fantomLiquidationManager.getDebtPool();
            console.log(debtPool);
            expect(debtPool).to.be.equal('0x246d1C179415547f43Bd4f8feF847d953c379650');

        })

        it('checks if the collateral of an account is eligible for rewards', async function() {
            const isEligible = await this.fantomLiquidationManager.collateralIsEligible(account);
            console.log(isEligible);
            expect(isEligible).to.be.equal(true);
        })

        it('gets the live status', async function () {
            const live = await this.fantomLiquidationManager.live();
            console.log(live.toString());
            expect(live).to.be.equal(true);
        })

    })

    describe('liquidation', function () {        
        
        beforeEach(async function () {
            await this.fantomLiquidationManager.addAdmin(admin, {from:owner});
            //console.log(this.fantomMintTokenRegistry);

        })

        it('gets tokens count', async function() {
            const tokensCount = await this.collateralPool.tokensCount();
            console.log(tokensCount.toString());
        })

        it('gets tokens', async function() {
            const token = await this.collateralPool.tokens(0);
            console.log(token);
        })        

        it('can deposit wFTM', async function() {
            const canDeposit = await this.fantomMintTokenRegistry.canDeposit(wFTM);
            console.log(canDeposit);
            expect(canDeposit).to.be.equal(true);
        })

        it('starts liquidation', async function() {            
            //await this.fantomLiquidationManager.startLiquidation(account, {from: admin});
        })
    })
})