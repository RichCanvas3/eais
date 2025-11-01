import { Web3Auth } from "@web3auth/modal";
import { OpenloginAdapter } from "@web3auth/openlogin-adapter";

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

  // Configure Openlogin adapter for social login only (no external wallets)
  const openloginAdapter = new OpenloginAdapter({
    adapterSettings: {
      uxMode: "popup", // or "redirect" 
      // No external wallet adapters configured, so only social login will show
    },
  });
  web3auth.configureAdapter(openloginAdapter as any);

  return web3auth;
}


