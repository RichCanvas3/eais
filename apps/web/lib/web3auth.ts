import { Web3Auth } from "@web3auth/modal";
import { OpenloginAdapter } from "@web3auth/openlogin-adapter";
import { MetamaskAdapter } from "@web3auth/metamask-adapter";

import { CHAIN_NAMESPACES } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";

export function createWeb3Auth(clientId: string, chainIdHex: string, rpcUrl: string) {
  const privateKeyProvider = new EthereumPrivateKeyProvider({
    config: {
      chainConfig: {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: chainIdHex,
        rpcTarget: rpcUrl,
        displayName: "Sepolia Testnet",
        blockExplorerUrl: "https://sepolia.etherscan.io",
        ticker: "ETH",
        tickerName: "Ethereum",
        decimals: 18,
      },
    },
  });

  const web3auth = new Web3Auth({
    clientId,
    privateKeyProvider: privateKeyProvider as any,
    web3AuthNetwork: 'sapphire_devnet',
  });

  // Configure Openlogin adapter
  const openloginAdapter = new OpenloginAdapter();
  web3auth.configureAdapter(openloginAdapter as any);

  // Add MetaMask support with proper chain configuration
  const metamaskAdapter = new MetamaskAdapter({
    clientId,
    chainConfig: {
      chainNamespace: CHAIN_NAMESPACES.EIP155,
      chainId: chainIdHex,
      rpcTarget: rpcUrl,
      displayName: "Sepolia Testnet",
      blockExplorerUrl: "https://sepolia.etherscan.io",
      ticker: "ETH",
      tickerName: "Ethereum",
      decimals: 18,
    },
  });
  web3auth.configureAdapter(metamaskAdapter as any);


  return web3auth;
}


