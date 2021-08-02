module.exports = {
    compilers: {
        solc: {
          version: '0.5.17',
          settings: {
            optimizer: {
              enabled: true,
              runs: 5000000
            }
          }
        }
    },
    networks: {
        ganache: {
          host: "127.0.0.1",
          port: 7545,
          network_id: "*"
        },
        development: {
          host: "operavm",
          port: 7545,
          network_id: "4002"
        },
        fork: {
          host: "127.0.0.1",
          port: 8545,
          network_id: "*"
        },
        test: {
            provider: () => new HDWalletProvider(mnemonic, `https://rpc.testnet.fantom.network`),
            network_id: 250,
        }
    },

    plugins: [
      'truffle-plugin-verify'
    ],

    api_keys: {
      ftmscan: 'MUQSNKBT19M2IXGQ18DVDTB42NXWSWNVNV'
    }
};
