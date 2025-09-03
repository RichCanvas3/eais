import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";

export function createWeb3Auth(clientId: string, chainIdHex: string, rpcUrl: string) {
  const privateKeyProvider = new EthereumPrivateKeyProvider({
    config: {
      chainConfig: {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: chainIdHex,
        rpcTarget: rpcUrl,
      },
    },
  });

  const web3auth = new Web3Auth({
    clientId,
    privateKeyProvider: privateKeyProvider as any,
    web3AuthNetwork: 'sapphire_devnet',
  });
  return web3auth;
}


