export type NativeMetaTransactionRequest = {
  metaTxData: {
    params: string;
    from: string;
    gasPrice?: number;
    gasLimit: number;
    storageLimit: number;
    contractAddress: string;
    methodType: "read" | "write";
    amount: number;
    entrypoint: string;
    apiId: string;
  };
  networkId: string;
  dappId: string;
};
