// to deploy locally
// run: npx hardhat node on a terminal
// then run: npx hardhat run --network localhost scripts/deploy_all.js

async function main(network) {
  console.log('network: ', network.name);

  const [deployer, borrower, bidder] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log(`Deployer's address: `, deployerAddress);

  const etherToWei = (n) => {
    return new web3.utils.BN(web3.utils.toWei(n.toString(), 'ether'));
  };

  ///
  const FantomMintAddressProvider = await ethers.getContractFactory(
    'FantomMintAddressProvider'
  );
  const fantomMintAddressProvider = await FantomMintAddressProvider.deploy();
  await fantomMintAddressProvider.deployed();
  await fantomMintAddressProvider.initialize(deployerAddress);
  console.log(
    'FantomMintAddressProvider deployed at',
    fantomMintAddressProvider.address
  );
  ///

  ///
  const FantomLiquidationManager = await ethers.getContractFactory(
    'FantomLiquidationManager'
  );
  const fantomLiquidationManager = await FantomLiquidationManager.deploy();
  await fantomLiquidationManager.deployed();
  console.log(
    'FantomLiquidationManager deployed at',
    fantomLiquidationManager.address
  );
  await fantomLiquidationManager.initialize(
    deployerAddress,
    fantomMintAddressProvider.address
  );

  ///

  ///
  const FantomProxyAdmin = await ethers.getContractFactory('FantomProxyAdmin');
  const fantomProxyAdmin = await FantomProxyAdmin.deploy();
  await fantomProxyAdmin.deployed();
  ///

  let PROXY_ADMIN_ADDRESS;
  switch (network.name) {
    case 'mainnet':
      PROXY_ADMIN_ADDRESS = '0x???'; //TODO: get the correct one
      break;
    default:
      PROXY_ADMIN_ADDRESS = fantomProxyAdmin.address;
      break;
  }

  const FantomLiquidationManagerImpl = await ethers.getContractFactory(
    'FantomLiquidationManager'
  );
  const fantomLiquidationManagerImpl = await FantomLiquidationManagerImpl.deploy();
  await fantomLiquidationManagerImpl.deployed();
  console.log(
    'FantomLiquidationManager Implementation deployed at',
    fantomLiquidationManagerImpl.address
  );
  ///

  ///
  const FantomLiquidationManagerProxy = await ethers.getContractFactory(
    'FantomUpgradeabilityProxy'
  );
  const fantomLiquidationManagerProxy = await FantomLiquidationManagerProxy.deploy(
    fantomLiquidationManagerImpl.address,
    PROXY_ADMIN_ADDRESS,
    []
  );
  await fantomLiquidationManagerProxy.deployed();
  console.log(
    'FantomLiquidationManagerProxy deployed at',
    fantomLiquidationManagerProxy.address
  );
  const fantomLiquidationManagerProxy2 = await ethers.getContractAt(
    'FantomLiquidationManager',
    fantomLiquidationManagerProxy.address
  );
  //console.log(fantomLiquidationManagerProxy2.address);
  await fantomLiquidationManagerProxy2.initialize(
    //await fantomLiquidationManagerProxy.initialize(
    deployerAddress,
    fantomMintAddressProvider.address
  );
  ///

  ///
  const FantomMint = await ethers.getContractFactory('FantomMint');
  const fantomMint = await FantomMint.deploy();
  await fantomMint.deployed();
  console.log('FantomMint deployed at', fantomMint.address);
  await fantomMint.initialize(
    deployerAddress,
    fantomMintAddressProvider.address
  );
  ///

  ///
  const FantomMintTokenRegistry = await ethers.getContractFactory(
    'FantomMintTokenRegistry'
  );
  const fantomMintTokenRegistry = await FantomMintTokenRegistry.deploy();
  await fantomMintTokenRegistry.deployed();
  console.log(
    'FantomMintTokenRegistry deployed at',
    fantomMintTokenRegistry.address
  );
  await fantomMintTokenRegistry.initialize(deployerAddress);
  ///

  ///
  const CollateralPool = await ethers.getContractFactory(
    'FantomDeFiTokenStorage'
  );
  const collateralPool = await CollateralPool.deploy();
  await collateralPool.deployed();
  console.log(
    'FantomDeFiTokenStorage (Collateral Pool) deployed at',
    collateralPool.address
  );
  await collateralPool.initialize(fantomMintAddressProvider.address, true);
  ///

  ///
  const DebtPool = await ethers.getContractFactory('FantomDeFiTokenStorage');
  const debtPool = await DebtPool.deploy();
  await debtPool.deployed();
  console.log(
    'FantomDeFiTokenStorage (Debt Pool) deployed at',
    debtPool.address
  );
  await debtPool.initialize(fantomMintAddressProvider.address, true);
  ///

  ///
  const FantomFUSD = await ethers.getContractFactory('FantomFUSD');
  const fantomFUSD = await FantomFUSD.deploy();
  await fantomFUSD.deployed();
  console.log('FantomFUSD deployed at', fantomFUSD.address);
  //await fantomFUSD.initialize(deployerAddress); //why not working??
  await fantomFUSD.init(deployerAddress); // if initialize in FantomFUSD is renamed to another name such as init, it will work
  await fantomFUSD.addMinter(fantomMint.address); //TODO: FantomFUSD needs to  run the initialize function first
  ///

  ///
  const FantomMintRewardDistribution = await ethers.getContractFactory(
    'FantomMintRewardDistribution'
  );
  const fantomMintRewardDistribution = await FantomMintRewardDistribution.deploy();
  fantomMintRewardDistribution.deployed();
  console.log(
    'FantomMintRewardDistribution deployed at',
    fantomMintRewardDistribution.address
  );
  await fantomMintRewardDistribution.initialize(
    deployerAddress,
    fantomMintAddressProvider.address
  );
  ///

  ///
  let wFTMAddress;
  let priceOracleProxyAddress;
  let mockToken2;

  if (network.name === 'localhost' || network.name === 'testnet') {
    const MockToken = await ethers.getContractFactory('MockToken');
    const mockToken = await MockToken.deploy();
    await mockToken.deployed();
    mockToken2 = mockToken;
    console.log('MockToken deployed at', mockToken.address);
    wFTMAddress = mockToken.address;
    await mockToken.initialize('wFTM', 'wFTM', 18);
  }

  switch (network.name) {
    case 'mainnet':
      wFTMAddress = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83';
      break;
    //case 'testnet':
    //  wFTMAddress = '0xf1277d1ed8ad466beddf92ef448a132661956621';
    //  break;
    default:
      break;
  }

  if (network.name === 'localhost' || network.name === 'testnet') {
    const MockPriceOracleProxy = await ethers.getContractFactory(
      'MockPriceOracleProxy'
    );
    const mockPriceOracleProxy = await MockPriceOracleProxy.deploy();
    await mockPriceOracleProxy.deployed();
    console.log(
      'MockPriceOracleProxy deployed at',
      mockPriceOracleProxy.address
    );
    priceOracleProxyAddress = mockPriceOracleProxy.address;

    // set the initial value; 1 wFTM = 1 USD; 1 fUSD = 1 USD
    console.log('Setting the initial price of FUSD and wFTM...');
    await mockPriceOracleProxy.setPrice(wFTMAddress, etherToWei(1).toString());
    await mockPriceOracleProxy.setPrice(
      fantomFUSD.address,
      etherToWei(1).toString()
    );
  }
  switch (network.name) {
    case 'mainnet':
      priceOracleProxyAddress = '0x????'; //TODO: get the correct address
      break;
    //case 'testnet':
    //priceOracleProxyAddress = '0x????'; //TODO: get the correct address
    //break;
    default:
      break;
  }

  ///

  ///
  console.log('Address Provider settings...');
  await fantomMintAddressProvider.setFantomMint(fantomMint.address);
  await fantomMintAddressProvider.setCollateralPool(collateralPool.address);
  await fantomMintAddressProvider.setDebtPool(debtPool.address);
  await fantomMintAddressProvider.setTokenRegistry(
    fantomMintTokenRegistry.address
  );
  await fantomMintAddressProvider.setRewardDistribution(
    fantomMintRewardDistribution.address
  );
  await fantomMintAddressProvider.setPriceOracleProxy(priceOracleProxyAddress);
  await fantomMintAddressProvider.setFantomLiquidationManager(
    fantomLiquidationManager.address
  );

  console.log('Register Token...');
  await fantomMintTokenRegistry.addToken(
    wFTMAddress,
    '',
    priceOracleProxyAddress,
    18,
    true,
    true,
    false
  );
  // TODO: the FantomFUSD needs to run the initialize function first
  await fantomMintTokenRegistry.addToken(
    fantomFUSD.address,
    '',
    priceOracleProxyAddress,
    18,
    true,
    false,
    true
  );

  console.log('Liquidation Manager setting...');
  await fantomLiquidationManager.updateFantomMintContractAddress(
    fantomMint.address
  );
  await fantomLiquidationManager.updateFantomUSDAddress(fantomFUSD.address);
  let fantomFeeVault;
  switch (network.name) {
    case 'mainnet':
      fantomFeeVault = '0x????'; //TODO get the correct address
      break;
    //case 'testnet':
    //fantomFeeVault = '0x????'; //TODO get the correct address
    //break;
    default:
      fantomFeeVault = deployerAddress;
      break;
  }
  await fantomLiquidationManager.updateFantomFeeVault(fantomFeeVault);

  console.log('Finished!');

  if (network.name === 'localhost' || network.name === 'testnet') {
    await fantomFUSD.mint(
      await bidder.getAddress(),
      etherToWei(9999).toString()
    );

    await mockToken2.mint(
      await borrower.getAddress(),
      etherToWei(9999).toString()
    );

    await mockToken2
      .connect(borrower)
      .approve(fantomMint.address, etherToWei(9999).toString());

    await fantomMint
      .connect(borrower)
      .mustDeposit(mockToken2.address, etherToWei(9999).toString());
    await fantomMint.connect(borrower).mustMintMax(fantomFUSD.address, 32000);
  }

  const collateralIsEligible = await fantomLiquidationManager.collateralIsEligible(
    await borrower.getAddress()
  );
  console.log('collateralIsEligible:', collateralIsEligible);
  ///
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main(network)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
