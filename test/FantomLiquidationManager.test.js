// to test this script on the local ganache truffle test .\test\FantomLiquidationManager.test.js --network ganache

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
const FantomMintRewardDistribution= artifacts.require('FantomMintRewardDistribution');
const FantomFUSD = artifacts.require('FantomFUSD');
const TestToken = artifacts.require('TestToken');
const TestPriceOracleProxy = artifacts.require('TestPriceOracleProxy');

const weiToEther = (n) => {
    return web3.utils.fromWei(n.toString(), 'ether');
}

const etherToWei = (n) => {
    return new web3.utils.BN(
      web3.utils.toWei(n.toString(), 'ether')
    )
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
        
        this.fantomFUSD = await FantomFUSD.new({from: owner});
        await this.fantomFUSD.initialize(owner);

        this.fantomMintRewardDistribution = await FantomMintRewardDistribution.new({from: owner});
        await this.fantomMintRewardDistribution.initialize(owner, this.fantomMintAddressProvider.address);

        this.testToken = await TestToken.new({from:owner});
        await this.testToken.initialize("wFTM", "wFTM", 18);       
        
        this.testOraclePriceProxy = await TestPriceOracleProxy.new({from: owner});
        
        await this.fantomMintAddressProvider.setFantomMint(this.fantomMint.address, {from: owner});
        await this.fantomMintAddressProvider.setCollateralPool(this.collateralPool.address, {from: owner});
        await this.fantomMintAddressProvider.setDebtPool(this.debtPool.address, {from: owner});
        await this.fantomMintAddressProvider.setTokenRegistry(this.fantomMintTokenRegistry.address, {from: owner});
        await this.fantomMintAddressProvider.setRewardDistribution(this.fantomMintRewardDistribution.address, {from:owner});
        await this.fantomMintAddressProvider.setPriceOracleProxy(this.testOraclePriceProxy.address, {from:owner});
        await this.fantomMintAddressProvider.setFantomLiquidationManager(this.fantomLiquidationManager.address, {from: owner});

        await this.testToken.mint(account, etherToWei(9999));

        await this.testOraclePriceProxy.setPrice(this.testToken.address, etherToWei(1));
        await this.testOraclePriceProxy.setPrice(this.fantomFUSD.address, etherToWei(1));
        
        await this.fantomMintTokenRegistry.addToken(this.testToken.address, "", this.testOraclePriceProxy.address, 8, true, true, false);
        await this.fantomMintTokenRegistry.addToken(this.fantomFUSD.address, "", this.testOraclePriceProxy.address, 8, true, false, true);

        await this.fantomFUSD.addMinter(this.fantomMint.address, {from:owner});

        await this.fantomLiquidationManager.updateFantomMintContractAddress(this.fantomMint.address, {from:owner});

    })

    describe('depositing collateral and minting fUSD', function () {
        
        it('gets the price of wFTM', async function() {
            const price = await this.testOraclePriceProxy.getPrice(this.testToken.address);
            //console.log(weiToEther(price));
            expect(weiToEther(price).toString()).to.be.equal('1');
        })

        it(`approves and deposits 9999 wFTM, 
        mints possible max amount of fUSD,
        lower the price of the test token,
        start the liquidation`, 
            async function() {
            await this.testToken.approve(this.fantomMint.address, etherToWei(9999), {from: account});

            const canDeposit = await this.fantomMintTokenRegistry.canDeposit(this.testToken.address);
            //console.log('canDeposit: ', canDeposit);
            expect(canDeposit).to.be.equal(true);
            
            await this.fantomMint.mustDeposit(this.testToken.address, etherToWei(9999), {from: account});
            const balance1 = await this.testToken.balanceOf(account);
            //console.log(balance.toString());
            expect(balance1).to.be.bignumber.equal('0');
            const balance2 = await this.collateralPool.balanceOf(account, this.testToken.address);
            //console.log(balance2.toString());
            expect(weiToEther(balance2)).to.be.equal('9999');

            const maxToMint = await this.fantomMint.maxToMint(account, this.fantomFUSD.address, 32000);
            //console.log('maxToMint in ether: ', weiToEther(maxToMint));
            expect(maxToMint).to.be.bignumber.greaterThan('0');

            await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {from: account});
            const fUSDBalance = await this.fantomFUSD.balanceOf(account);
            //console.log('fUSD balance: ', weiToEther(fUSDBalance));
            expect(fUSDBalance).to.be.bignumber.greaterThan('0');
            expect(weiToEther(fUSDBalance)*1).to.be.lessThanOrEqual(weiToEther(maxToMint)*1);

            await this.testOraclePriceProxy.setPrice(this.testToken.address, etherToWei(0.5));

            const live = await this.fantomLiquidationManager.live();
            //console.log('live: ', live);
            expect(live).to.be.equal(true);

            const isEligible = await this.fantomLiquidationManager.collateralIsEligible(account);
            //console.log('isEligible: ', isEligible);
            expect(isEligible).to.be.equal(false);

            await this.fantomLiquidationManager.addAdmin(admin, {from:owner});
            const isAdmin = await this.fantomLiquidationManager.admins(admin);
            //console.log(isAdmin);
            expect(isAdmin).to.be.equal(true);

            await this.fantomLiquidationManager.startLiquidation(account, {from: admin});

            const auctionInformation = await this.fantomLiquidationManager.actionList(account);
            console.log(auctionInformation);
        })

       /*  it('get collateralLowestDebtRatio4dec', async function() {
            const collateralLowestDebtRatio4dec = await this.fantomMint.getCollateralLowestDebtRatio4dec();
            console.log(collateralLowestDebtRatio4dec.toString());
            expect(collateralLowestDebtRatio4dec).to.be.bignumber.greaterThan('0');
        }) */

      /*  it('check collateral value', async function() {
            const collateralValue = await this.fantomMint.collateralValueOf(account, wFTM, 0);
            //console.log (collateralValue.toString());
            expect(collateralValue).to.be.bignumber.greaterThan('0');
        })

        it('checks if collateral can decrease', async function() {
            const canDecrease = await this.fantomMint.checkCollateralCanDecrease(account, wFTM, 0);
            //console.log(canDecrease);
            expect(canDecrease).to.be.equal(true);
        })

        it('gets a token', async function() {
            const token = await this.collateralPool.tokens(0);
            //console.log(token);
            expect(token).to.be.equal(this.testToken.address);
        })

        it('gets all tokens', async function() {
            const tokens = await this.collateralPool.getTokens();
            //console.log(tokens);
            expect(tokens.length).to.be.equal(1);
            expect(tokens[0]).to.be.equal(this.testToken.address);
        })

        it('gets the tokens count', async function() {
            const tokensCount = await this.collateralPool.tokensCount();
            //console.log(tokensCount.toString());
            expect(tokensCount).to.be.bignumber.equal('1');
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
            const isEligible = await this.fantomLiquidationManager.collateralIsEligible(account);
            console.log('isEligible: ', isEligible);
            expect(isEligible).to.be.equal(true);
        })

        it('gets the live status', async function () {
            const live = await this.fantomLiquidationManager.live();
            //console.log('live status: ', live.toString());
            expect(live).to.be.equal(true);
        })
 */
    })

   /*  describe('liquidation', function () {        
        
        beforeEach(async function () {
            await this.fantomLiquidationManager.addAdmin(admin, {from:owner});
        })        

        it('reverts when trying to start liquidation to Collateral is not eligible for liquidation', async function() {
            expectRevert(this.fantomLiquidationManager.startLiquidation(account, {from: admin}), 'Collateral is not eligible for liquidation');
        })

        it('starts liquidation', async function() {   
            // Iwan Effendi's note 2021/08/09
            // still don't know how what to do to make collateralIsEligible(account) return false
            // it seems it will always return true thus startLiquidation will always be reverted
            
            
            ///await this.fantomLiquidationManager.startLiquidation(account, {from: admin});
        })
    }) */
})