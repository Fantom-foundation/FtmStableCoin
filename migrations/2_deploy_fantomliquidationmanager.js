 
/* const { deployProxy, upgradeProxy, prepareUpgrade } = require('@openzeppelin/truffle-upgrades');

var FantomLiquidationManager = artifacts.require("../contracts/liquidator/FantomLiquidationManager.sol");

module.exports = async function(deployer) {
	const fantomLiquidationManager = await deployProxy(FantomLiquidationManager, ["0xe8A06462628b49eb70DBF114EA510EB3BbBDf559", "0xcb20a1A22976764b882C2f03f0C8523F3df54b10"], { deployer });
} */


// note from Iwan Effendi
// The above migration script doesn't work on the forked Fantom Mainnet. So I use the script below
// Please use the above script if it works for your deployment
const FantomLiquidationManager = artifacts.require('FantomLiquidationManager');
const FantomMintTokenRegistry = artifacts.require('FantomMintTokenRegistry');
const FantomDeFiTokenStorage = artifacts.require('FantomDeFiTokenStorage');
const FantomMint = artifacts.require('FantomMint');
const FantomMintAddressProvider = artifacts.require('FantomMintAddressProvider');
const FantomMintRewardDistribution= artifacts.require('FantomMintRewardDistribution');
const FantomFUSD = artifacts.require('FantomFUSD');
const TestToken = artifacts.require('TestToken');
const TestPriceOracleProxy = artifacts.require('TestPriceOracleProxy');

const etherToWei = (n) => {
    return new web3.utils.BN(
      web3.utils.toWei(n.toString(), 'ether')
    )
}

module.exports = async function(deployer, network, accounts) {

    await deployer.deploy(FantomMintAddressProvider);
    const fantomMintAddressProvider = await FantomMintAddressProvider.deployed();
    await fantomMintAddressProvider.initialize(accounts[0]);

    await deployer.deploy(FantomLiquidationManager);
    const fantomLiquidationManager = await FantomLiquidationManager.deployed();
    await fantomLiquidationManager.initialize(accounts[0], fantomMintAddressProvider.address);

    await deployer.deploy(FantomMint);
    const fantomMint = await FantomMint.deployed();
    await fantomMint.initialize(accounts[0], fantomMintAddressProvider.address);

    await deployer.deploy(FantomMintTokenRegistry);
    const fantomMintTokenRegistry = await FantomMintTokenRegistry.deployed();
    await fantomMintTokenRegistry.initialize(accounts[0]);

    await deployer.deploy(FantomDeFiTokenStorage);
    const collateralPool = await FantomDeFiTokenStorage.deployed();
    await collateralPool.initialize(fantomMintAddressProvider.address, true);

    await deployer.deploy(FantomDeFiTokenStorage);
    const debtPool = await FantomDeFiTokenStorage.deployed();
    await debtPool.initialize(fantomMintAddressProvider.address, true);

    await deployer.deploy(FantomFUSD);
    const fantomFUSD = await FantomFUSD.deployed();
    await fantomFUSD.initialize(accounts[0]);

    await deployer.deploy(FantomMintRewardDistribution);
    const fantomMintRewardDistribution = await FantomMintRewardDistribution.deployed();
    await fantomMintRewardDistribution.initialize(accounts[0], fantomMintAddressProvider.address);

    await fantomMintAddressProvider.setFantomMint(fantomMint.address);
    await fantomMintAddressProvider.setCollateralPool(collateralPool.address);
    await fantomMintAddressProvider.setDebtPool(debtPool.address);
    await fantomMintAddressProvider.setTokenRegistry(fantomMintTokenRegistry.address);
    await fantomMintAddressProvider.setRewardDistribution(fantomMintRewardDistribution.address);
    await fantomMintAddressProvider.setFantomLiquidationManager(fantomLiquidationManager.address);

    await fantomFUSD.addMinter(fantomMint.address);

    await fantomLiquidationManager.updateFantomMintContractAddress(fantomMint.address);
    await fantomLiquidationManager.updateFantomUSDAddress(fantomFUSD.address);

    console.log('network: ', network);
    if (network === 'ganache') {

        await deployer.deploy(TestToken);
        const testToken = await TestToken.deployed();
        await testToken.initialize("wFTM", "wFTM", 18);

        await deployer.deploy(TestPriceOracleProxy);
        const testPriceOracleProxy = await TestPriceOracleProxy.deployed();        
        await testPriceOracleProxy.setPrice(testToken.address, etherToWei(1));
        await testPriceOracleProxy.setPrice(fantomFUSD.address, etherToWei(1));

        await fantomMintAddressProvider.setPriceOracleProxy(testPriceOracleProxy.address);

        await fantomMintTokenRegistry.addToken(testToken.address,"", testPriceOracleProxy.address, 18,  true, true, false);
        await fantomMintTokenRegistry.addToken(fantomFUSD.address,"", testPriceOracleProxy.address, 18,  true, false, true);
        await testToken.mint(accounts[2], etherToWei(9999));
        await testToken.approve(fantomMint.address, etherToWei(9999), {from: accounts[2]});
        await fantomMint.mustDeposit(testToken.address, etherToWei(9999), {from: accounts[2]});
        await fantomMint.mustMintMax(fantomFUSD.address, 32000, {from: accounts[2]});
    }else{
        //todo: add correct lines of code here for live deployment
    }



} 