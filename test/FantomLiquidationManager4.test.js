//npx hardhat test .\test\FantomLiquidationManager.test.js --network localhost
// or truffle test .\test\FantomLiquidationManager.test.js --network ganache
const {
  BN,
  constants,
  expectEvent,
  expectRevert,
  time
} = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = constants;

const { expect } = require('chai');

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
const MockStartLiquidation = artifacts.require('MockStartLiquidation');

const weiToEther = (n) => {
  return web3.utils.fromWei(n.toString(), 'ether');
};

const etherToWei = (n) => {
  return new web3.utils.BN(web3.utils.toWei(n.toString(), 'ether'));
};

contract('Unit Test for FantomLiquidationManager', function([
  owner,
  admin,
  borrower,
  bidder1,
  bidder2,
  fantomFeeVault
]) {
  beforeEach(async function() {
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

    this.mockStartLiquidation = await MockStartLiquidation.new({ from: owner });

    this.fantomMint = await FantomMint.new({ form: owner });
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
    //await this.fantomFUSD.initialize(owner);
    await this.fantomFUSD.init(owner);

    this.fantomMintRewardDistribution = await FantomMintRewardDistribution.new({
      from: owner
    });
    await this.fantomMintRewardDistribution.initialize(
      owner,
      this.fantomMintAddressProvider.address
    );

    this.mockToken = await MockToken.new({ from: owner });
    await this.mockToken.initialize('wFTM', 'wFTM', 18);

    this.mockToken2 = await MockToken.new({ from: owner });
    await this.mockToken2.initialize('wFTM2', 'wFTM2', 18);

    this.mockPriceOracleProxy = await MockPriceOracleProxy.new({ from: owner });

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

    // set the initial value; 1 wFTM = 1 USD; 1 wFTM2 = 1 USD; 1 fUSD = 1 USD
    await this.mockPriceOracleProxy.setPrice(
      this.mockToken.address,
      etherToWei(1)
    );
    await this.mockPriceOracleProxy.setPrice(
      this.mockToken2.address,
      etherToWei(1)
    );
    await this.mockPriceOracleProxy.setPrice(
      this.fantomFUSD.address,
      etherToWei(1)
    );

    await this.fantomMintTokenRegistry.addToken(
      this.mockToken.address,
      '',
      this.mockPriceOracleProxy.address,
      18,
      true,
      true,
      false
    );
    await this.fantomMintTokenRegistry.addToken(
      this.mockToken2.address,
      '',
      this.mockPriceOracleProxy.address,
      18,
      true,
      true,
      false
    );
    await this.fantomMintTokenRegistry.addToken(
      this.fantomFUSD.address,
      '',
      this.mockPriceOracleProxy.address,
      18,
      true,
      false,
      true
    );

    await this.fantomFUSD.addMinter(this.fantomMint.address, { from: owner });

    await this.fantomLiquidationManager.updateFantomMintContractAddress(
      this.fantomMint.address,
      { from: owner }
    );
    await this.fantomLiquidationManager.updateFantomUSDAddress(
      this.fantomFUSD.address
    );

    await this.fantomLiquidationManager.addAdmin(admin, { from: owner });

    await this.fantomLiquidationManager.updateFantomFeeVault(fantomFeeVault, {
      from: owner
    });

    await this.fantomLiquidationManager.updateInitiatorBonus(etherToWei(0.5));

    /** all the necesary setup */
  });

  describe('depositing collateral and minting fUSD', function() {
    it('Scenario 10', async function() {
      console.log(`
            Scenario 10:
            Borrower approves and deposits 9999 wFTM, 
            Then mints possible max amount of fUSD,
            The price of the wFTM changes from 1 to 0.5,
            A smart contract tries to start the liquidation 
            but it will fail with "Smart Contract not allowed"`);

      console.log('');
      console.log(`
            Mint 9999 wFTMs for the borrower so he/she can borrow some fUSD`);
      await this.mockToken.mint(borrower, etherToWei(9999));

      console.log(`
            Mint bidder1 10000 fUSDs to bid for the liquidated collateral`);
      await this.fantomFUSD.mint(bidder1, etherToWei(10000), { from: owner });

      console.log(`
            Borrower approves 9999 wFTM to FantomMint contract`);
      await this.mockToken.approve(this.fantomMint.address, etherToWei(9999), {
        from: borrower
      });

      console.log(`
            Borrower deposits all his/her 9999 wFTMs`);
      await this.fantomMint.mustDeposit(
        this.mockToken.address,
        etherToWei(9999),
        { from: borrower }
      );

      console.log(`
            *Now the borrower should have 0 wFTM`);
      let balance = await this.mockToken.balanceOf(borrower);
      expect(balance).to.be.bignumber.equal('0');

      console.log(`
            Mint the maximum amount of fUSD for the borrower`);
      await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {
        from: borrower
      });
      console.log(`
            *Now borrower should have fUSD between 0 and 3333`);
      let amount = await this.fantomFUSD.balanceOf(borrower);
      expect(amount).to.be.bignumber.greaterThan('0');
      expect(weiToEther(amount) * 1).to.be.lessThanOrEqual(3333);
      console.log(
        `
            The actual amount of fUSD minted: `,
        weiToEther(amount)
      );

      console.log(`
            Let's set the price of wFTM to 0.5 USD`);
      await this.mockPriceOracleProxy.setPrice(
        this.mockToken.address,
        etherToWei(0.5)
      );

      console.log(`
            *A smart contract tries to start the liquidation 
            but it fail with "Smart Contract not allowed"`);

      await expectRevert(
        this.mockStartLiquidation.startLiquidation(
          this.fantomLiquidationManager.address,
          borrower
        ),
        'Smart Contract not allowed'
      );
    });
  });
});
