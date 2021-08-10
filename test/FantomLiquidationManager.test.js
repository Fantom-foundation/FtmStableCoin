// to fork Fantom Mainnet : ganache-cli -f https://rpcapi.fantom.network/
// to test this script: truffle test .\test\FantomLiquidationManager.test.js --network fork

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
const TestToken = artifacts.require('TestToken');
const TestPriceOracleProxy = artifacts.require('TestPriceOracleProxy');

//const liveFantomMintAddressProviderAddress = "0xcb20a1A22976764b882C2f03f0C8523F3df54b10";
//const IFantomMintAddressProvider = artifacts.require('IFantomMintAddressProvider');

//const livePriceOracleProxyAddress ="0x8173B69510bA3fDE9Dc945FB11F17c24042f63F4";

//const wFTM = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83';
let wFTM;

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
        //this.fantomMintAddressProvider = await IFantomMintAddressProvider.at(liveFantomMintAddressProviderAddress);
        //const priceOracleProxyAddress = await this.fantomMintAddressProvider.getPriceOracleProxy();
        //console.log(priceOracleProxyAddress);

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
        
        this.testToken = await TestToken.new({from:owner});
        
        this.testOraclePriceProxy = await TestPriceOracleProxy.new({from: owner});
        
        await this.fantomMintAddressProvider.setFantomMint(this.fantomMint.address, {from: owner});
        await this.fantomMintAddressProvider.setCollateralPool(this.collateralPool.address, {from: owner});
        await this.fantomMintAddressProvider.setDebtPool(this.debtPool.address, {from: owner});
        await this.fantomMintAddressProvider.setTokenRegistry(this.fantomMintTokenRegistry.address, {from: owner});
        //await this.fantomMintAddressProvider.setPriceOracleProxy(livePriceOracleProxyAddress, {from:owner});
        await this.fantomMintAddressProvider.setPriceOracleProxy(this.testOraclePriceProxy.address, {from:owner});

        wFTM = this.testToken.address;

        await this.testToken.mint(account, etherToWei(150));
        //await this.fantomMint.add(account, wFTM, etherToWei(150));

        await this.testOraclePriceProxy.setPrice(wFTM, etherToWei(0.2));

    })

    describe('view functions', function () {
        
        it('gets the price of wFTM', async function() {
            const price = await this.testOraclePriceProxy.getPrice(wFTM);
            console.log(weiToEther(price));
            expect(weiToEther(price).toString()).to.be.equal('0.2');
        })

        /* it('get collateralLowestDebtRatio4dec', async function() {
            const collateralLowestDebtRatio4dec = await this.fantomMint.getCollateralLowestDebtRatio4dec();
            //console.log(collateralLowestDebtRatio4dec.toString());
            expect(collateralLowestDebtRatio4dec).to.be.bignumber.greaterThan('0');
        })

        it('check collateral value', async function() {
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
            expect(token).to.be.equal(wFTM);
        })

        it('gets all tokens', async function() {
            const tokens = await this.collateralPool.getTokens();
            //console.log(tokens);
            expect(tokens.length).to.be.equal(1);
            expect(tokens[0]).to.be.equal(wFTM);
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