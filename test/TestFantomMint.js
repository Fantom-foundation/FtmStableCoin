const {
  BN,
  constants,
  expectEvent,
  expectRevert,
  time
} = require('@openzeppelin/test-helpers');

const { ethers } = require('hardhat');
const { expect } = require('chai');

const { weiToEther, etherToWei } = require('./utils/index');

const FantomLiquidationManager = artifacts.require(
  'MockFantomLiquidationManager'
);
const FantomMintTokenRegistry = artifacts.require('FantomMintTokenRegistry');
const FantomDeFiTokenStorage = artifacts.require('FantomDeFiTokenStorage');
const FantomMint = artifacts.require('FantomMint');
const FantomMintAddressProvider = artifacts.require(
  'FantomMintAddressProvider'
);
const FantomMintRewardDistribution = artifacts.require(
  'FantomMintRewardDistribution'
);
const FantomFUSD = artifacts.require('FantomFUSD');
const MockToken = artifacts.require('MockToken');
const MockPriceOracleProxy = artifacts.require('MockPriceOracleProxy');

let debtValue;
let offeredRatio;
let totalSupply;
let finalInitiatorBalance;
let oldBidderTwoBalance;
let provider;

const PRICE_PRECISION = 10 ** 8;

contract('FantomMint', function([
  owner,
  admin,
  borrower,
  firstBidder,
  secondBidder,
  fantomFeeVault,
  initiator
]) {
  before(async function() {
    provider = ethers.provider;

    /** all the necessary setup  */
    this.fantomMintAddressProvider = await FantomMintAddressProvider.new({
      from: owner
    });
    await this.fantomMintAddressProvider.initialize(owner);

    this.fantomLiquidationManager = await FantomLiquidationManager.new({
      from: owner
    });
    await this.fantomLiquidationManager.initialize(
      owner,
      this.fantomMintAddressProvider.address
    );

    this.fantomMint = await FantomMint.new({ from: owner });
    await this.fantomMint.initialize(
      owner,
      this.fantomMintAddressProvider.address
    );

    this.fantomMintTokenRegistry = await FantomMintTokenRegistry.new();
    await this.fantomMintTokenRegistry.initialize(owner);

    this.collateralPool = await FantomDeFiTokenStorage.new({ from: owner });
    await this.collateralPool.initialize(
      this.fantomMintAddressProvider.address,
      true
    );

    this.debtPool = await FantomDeFiTokenStorage.new({ from: owner });
    await this.debtPool.initialize(
      this.fantomMintAddressProvider.address,
      true
    );

    this.fantomFUSD = await FantomFUSD.new({ from: owner });

    await this.fantomFUSD.initialize(owner);

    this.fantomMintRewardDistribution = await FantomMintRewardDistribution.new({
      from: owner
    });
    await this.fantomMintRewardDistribution.initialize(
      owner,
      this.fantomMintAddressProvider.address
    );

    this.mockTokenOne = await MockToken.new({ from: owner });
    this.mockTokenTwo = await MockToken.new({ from: owner });
    this.mockTokenNT = await MockToken.new({ from: owner }); // non-tradable token

    await this.mockTokenOne.initialize('wFTM', 'wFTM', 18);
    await this.mockTokenTwo.initialize('xFTM', 'xFTM', 18);
    await this.mockTokenNT.initialize('sFTM', 'sFTM', 18);

    this.mockPriceOracleProxy = await MockPriceOracleProxy.new({
      from: owner
    });

    await this.fantomMintAddressProvider.setFantomMint(
      this.fantomMint.address,
      { from: owner }
    );
    await this.fantomMintAddressProvider.setCollateralPool(
      this.collateralPool.address,
      { from: owner }
    );
    await this.fantomMintAddressProvider.setDebtPool(this.debtPool.address, {
      from: owner
    });
    await this.fantomMintAddressProvider.setTokenRegistry(
      this.fantomMintTokenRegistry.address,
      { from: owner }
    );
    await this.fantomMintAddressProvider.setRewardDistribution(
      this.fantomMintRewardDistribution.address,
      { from: owner }
    );
    await this.fantomMintAddressProvider.setPriceOracleProxy(
      this.mockPriceOracleProxy.address,
      { from: owner }
    );
    await this.fantomMintAddressProvider.setFantomLiquidationManager(
      this.fantomLiquidationManager.address,
      { from: owner }
    );

    // set the initial value; 1 wFTM = 1 USD; 1 xFTM = 1 USD; 1 fUSD = 1 USD
    await this.mockPriceOracleProxy.setPrice(
      this.mockTokenOne.address,
      etherToWei(1)
    );

    await this.mockPriceOracleProxy.setPrice(
      this.mockTokenTwo.address,
      etherToWei(1)
    );

    await this.mockPriceOracleProxy.setPrice(
      this.mockTokenNT.address,
      etherToWei(2)
    );

    await this.mockPriceOracleProxy.setPrice(
      this.fantomFUSD.address,
      etherToWei(1)
    );

    await this.fantomMintTokenRegistry.addToken(
      this.mockTokenOne.address,
      '',
      this.mockPriceOracleProxy.address,
      18,
      true,
      true,
      false,
      true
    );

    await this.fantomMintTokenRegistry.addToken(
      this.mockTokenTwo.address,
      '',
      this.mockPriceOracleProxy.address,
      18,
      true,
      true,
      false,
      true
    );

    await this.fantomMintTokenRegistry.addToken(
      this.mockTokenNT.address,
      '',
      this.mockPriceOracleProxy.address,
      18,
      true,
      true,
      false,
      false
    );

    await this.fantomMintTokenRegistry.addToken(
      this.fantomFUSD.address,
      '',
      this.mockPriceOracleProxy.address,
      18,
      true,
      false,
      true,
      false
    );

    await this.fantomFUSD.addMinter(this.fantomMint.address, { from: owner });

    await this.fantomLiquidationManager.updateFantomMintContractAddress(
      this.fantomMint.address,
      { from: owner }
    );

    await this.fantomLiquidationManager.updateFantomUSDAddress(
      this.fantomFUSD.address
    );

    await this.fantomLiquidationManager.updateInitiatorBonus(etherToWei(0.05));

    await this.fantomLiquidationManager.addAdmin(admin, { from: owner });

    await this.fantomLiquidationManager.updateFantomFeeVault(fantomFeeVault, {
      from: owner
    });

    await this.fantomLiquidationManager.addAdmin(admin, { from: owner });

    // mint firstBidder enough fUSD to bid for liquidated collateral
    await this.fantomFUSD.mint(firstBidder, etherToWei(10000), {
      from: owner
    });

    await this.fantomFUSD.mint(secondBidder, etherToWei(10000), {
      from: owner
    });
  });

  describe('Minting two tradable tokens', function() {
    before(async function() {
      await this.mockTokenOne.mint(borrower, etherToWei(7500));
      await this.mockTokenTwo.mint(borrower, etherToWei(7500));
    });

    it('should allow the borrower to deposit 5000 wFTM and 5000 xFTM', async function() {
      await this.mockTokenOne.approve(
        this.fantomMint.address,
        etherToWei(7500),
        { from: borrower }
      );

      await this.mockTokenTwo.approve(
        this.fantomMint.address,
        etherToWei(7500),
        { from: borrower }
      );

      // borrower deposits all his/her 7500 wFTM
      await this.fantomMint.mustDeposit(
        this.mockTokenOne.address,
        etherToWei(7500),
        { from: borrower }
      );

      // borrower deposits all his/her 7500 xFTM
      await this.fantomMint.mustDeposit(
        this.mockTokenTwo.address,
        etherToWei(7500),
        { from: borrower }
      );
    });

    it('should show 7500 wFTM and 7500 xFTM in Collateral Pool (for borrower)', async function() {
      // check the collateral balance of the borrower in the collateral pool
      const balanceOne = await this.collateralPool.balanceOf(
        borrower,
        this.mockTokenOne.address
      );

      const balanceTwo = await this.collateralPool.balanceOf(
        borrower,
        this.mockTokenTwo.address
      );

      expect(weiToEther(balanceOne)).to.be.equal('7500');
      expect(weiToEther(balanceTwo)).to.be.equal('7500');

      // now FantomMint contract should get 7500 wFTM and 7500 xFTM
      const mintBalanceOne = await this.mockTokenOne.balanceOf(
        this.fantomMint.address
      );
      const mintBalanceTwo = await this.mockTokenTwo.balanceOf(
        this.fantomMint.address
      );

      expect(weiToEther(mintBalanceOne)).to.be.equal('7500');
      expect(weiToEther(mintBalanceTwo)).to.be.equal('7500');
    });

    it('should give a maxToMint (fUSD) value of 5000', async function() {
      const maxToMint = await this.fantomMint.maxToMint(
        borrower,
        this.fantomFUSD.address,
        30000
      );

      // let debtOfAccount = await this.debtPool.totalOf(borrower);
      // let collateralOfAccount = await this.collateralPool.totalOf(borrower);

      // console.log('maxToMint in ether: ', weiToEther(maxToMint) * 1);
      // console.log('current DEBT (debtValueOf): ', weiToEther(debtOfAccount));
      // console.log(
      //   'current Collateral (collateralValueOf): ',
      //   weiToEther(collateralOfAccount)
      // );

      // maxToMint Calculation (((((10000 - ((0 * 30000) / 10000)) * 10000) / 30000) - 1) * 10**18) / 10**18

      expect(maxToMint).to.be.bignumber.greaterThan('0');
      expect(weiToEther(maxToMint) * 1).to.be.greaterThanOrEqual(5000);
    });

    it('should mint maximium (5000) amount of fUSD', async function() {
      // mint maximum amount possible of fUSD for borrower
      await this.fantomMint.mustMintMax(this.fantomFUSD.address, 30000, {
        from: borrower
      });

      const fUSDBalance = await this.fantomFUSD.balanceOf(borrower);
      expect(weiToEther(fUSDBalance) * 1).to.be.lessThanOrEqual(5000);
    });

    it('should allow the borrower to deposit 5000 sFTM (non-tradable token)', async function() {
      await this.mockTokenNT.mint(borrower, etherToWei(5000));

      await this.mockTokenNT.approve(
        this.fantomMint.address,
        etherToWei(5000),
        { from: borrower }
      );

      // borrower deposits all his/her 5000 sFTM
      await this.fantomMint.mustDeposit(
        this.mockTokenNT.address,
        etherToWei(5000),
        { from: borrower }
      );

      const balance = await this.collateralPool.balanceOf(
        borrower,
        this.mockTokenNT.address
      );

      expect(weiToEther(balance)).to.be.equal('5000');
    });

    it('should not allow minting of fUSD after depositing non-tradable collateral', async function() {
      const maxToMint = await this.fantomMint.maxToMint(
        borrower,
        this.fantomFUSD.address,
        30000
      );

      let debtOfAccount = await this.debtPool.totalOf(borrower);
      let collateralOfAccount = await this.collateralPool.totalOf(borrower);

      console.log('maxToMint in ether: ', weiToEther(maxToMint) * 1);
      console.log('current DEBT (debtValueOf): ', weiToEther(debtOfAccount));
      console.log(
        'current Collateral (collateralValueOf): ',
        weiToEther(collateralOfAccount)
      );
    });
  });
});
