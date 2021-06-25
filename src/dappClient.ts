import {
  BeaconMessageType,
  DAppClient,
  DAppClientOptions,
  NetworkType,
  PartialTezosTransactionOperation,
  RequestOperationInput,
  SigningType,
} from "@airgap/beacon-sdk";
import { CODEC, encoders } from "@taquito/local-forging";
import { ChainIds, Context, TezosToolkit } from "@taquito/taquito";
import { b58cdecode, hex2buf } from "@taquito/utils";

import { NETWORK_CONFIG } from "./config";
import axios from "axios";
import { config } from "./config";

const {
  Operation,
} = require("@taquito/taquito/dist/lib/operations/operations");

const {
  valueEncoder,
  isPrim,
} = require("@taquito/local-forging/dist/lib/michelson/codec");
const blake = require("blakejs");

const PACK_INDICATOR = "05";

const axiosInstance = axios.create({
  method: "GET",
  timeout: 3000,
  responseType: "json",
});

export class MetaTxDAppClient extends DAppClient {
  private Tezos: TezosToolkit;
  protected chainId: ChainIds;
  private rpc: string;

  constructor(config: DAppClientOptions) {
    super(config);
    const preferredNetwork = config.preferredNetwork || NetworkType.DELPHINET;
    const { rpc, networkId } = NETWORK_CONFIG[String(preferredNetwork)];
    this.Tezos = new TezosToolkit(rpc);
    this.chainId = networkId;
    this.rpc = rpc;
  }

  /**
   * EstimateGas op for contract invocation
   *
   * @param source - Source address
   * @param amount - Amount to send
   * @param destination - Contract address
   * @param parameters - Entrypoint parameters and value
   */
  async estimateGas(
    source: string,
    amount: string,
    destination: string,
    parameters: any
  ) {
    // Configure the address for the estimate op.
    const signer: any = {
      publicKeyHash: async function () {
        return source;
      },
    };
    this.Tezos.setSignerProvider(signer);

    const { gasLimit, storageLimit } = await this.Tezos.estimate.transfer({
      to: destination,
      amount: parseInt(amount, 10),
      parameter: parameters,
    });
    return {
      gasLimit,
      storageLimit,
    };
  }

  /**
   * Transform the fn. parameters to construct native meta tx
   * signing payload and request a signature
   * @param input
   */
  protected async requestMetaTransactionSignature(
    input: RequestOperationInput
  ) {
    // Get active account
    const accountInfo = await this.getActiveAccount();
    if (!accountInfo) {
      throw new Error("No active account");
    }

    const hasPermisssions = await this.checkPermissions(
      BeaconMessageType.SignPayloadRequest
    );
    if (!hasPermisssions) {
      throw new Error("Not enough permissions to sign");
    }

    // Get public key from active account
    const { address, publicKey } = accountInfo;
    console.log("Public Key: ", publicKey);

    let senderIdOfWallet;

    const { operationDetails } = input;
    for (let {
      destination,
      parameters,
    } of operationDetails as PartialTezosTransactionOperation[]) {
      if (!parameters) {
        throw new Error("Not a contract transaction");
      }

      const { entrypoint, value } = parameters;
      if (!isPrim(value)) {
        throw new Error("Ill formed data");
      }

      // Get param hash
      const paramHash = this.encodeMethodParametersAsHash(value);
      console.log(paramHash);

      // Get user counter
      const counter = await this.getUserCounter(destination, address);
      const messageToSign = this.getNativeMetaTxSigningMessage(
        destination,
        counter,
        paramHash
      );
      console.log("MessageToSign", messageToSign);

      const {
        signature,
        signingType,
        senderId,
      } = await this.requestSignPayload({
        signingType: SigningType.MICHELINE,
        payload: messageToSign,
      });
      senderIdOfWallet = senderId;
      console.log(
        `Signature: ${signature}, signing type: ${signingType}, sender: ${senderId}`
      );

      parameters = this.updateFunctionParameters(
        parameters,
        publicKey,
        signature
      );
    }

    return { operationDetails, senderId: senderIdOfWallet };
  }

  /**
   * Get transaction hash against the Biconomy's requestID
   *
   * @param requestId
   * @param networkId
   * @param maxAttempts
   * @param interval
   */
  async getTransactionHash(
    requestId: string,
    networkId: string,
    maxAttempts = 20,
    interval = 2000
  ) {
    while (maxAttempts--) {
      try {
        const response = await this.trackStatus(requestId, networkId);
        console.log(response.result, response.result.operationHash);
        return {
          opHash: response.result.operationHash,
          counter: response.result.counter,
        };
      } catch (error) {
        if (maxAttempts) await sleep(interval);
      }
    }

    throw new Error("Cannot get operation hash; Please try again");
  }

  /**
   * Wait for transaction confirmation
   * @param transactionHash - Transaction Hash
   * @param counter - Counter corr. to the operation
   */
  async confirmation(transactionHash: string, counter: number) {
    const context = new Context(this.rpc);
    const op = new Operation(transactionHash, {} as any, [], context);
    await op.confirmation();
  }

  private async trackStatus(requestId: string, networkId: string) {
    const { baseURL } = config;
    const response = await axiosInstance.get(
      `${baseURL}/api/v2/meta-tx/native/status?requestId=${requestId}&networkId=${networkId}`
    );
    if (response.status !== 200) {
      throw new Error("Error occurred while querying for request status");
    }

    if (response.status === 200 && !response.data.result.operationHash) {
      throw new Error("Request not yet processed");
    } else {
      return response.data;
    }
  }

  /**
   * Get the chain id cst or hex form
   */
  private getChainIdCst() {
    // Slice first 3 bytes or 6 hex chars of chainId
    // They symbolize prefix `Net`
    let encodedChainId = Buffer.from(
      b58cdecode(this.chainId, new Uint8Array())
    ).toString("hex");
    encodedChainId = encodedChainId.slice(6);
    return encodedChainId;
  }

  /**
   * Encode an address to bytes
   * @param address
   */
  private encodeAddress(address: string) {
    const addressEncoder = encoders[CODEC.ADDRESS];
    return addressEncoder(address);
  }

  /**
   * Fetch the counter of the user from the contract
   * @param contractAddress
   */
  private async getUserCounter(contractAddress: string, walletAddress: string) {
    const contract = await this.Tezos.wallet.at(contractAddress);
    const { user_store } = await contract.storage();

    let counter = 0;
    try {
      counter = await user_store.get(walletAddress);
      if (counter === null || counter === undefined) {
        counter = 0;
      }
    } catch (error) {
      console.log("counter not initialized in big_map");
    }

    return counter.toString();
  }

  /**
   * Form parameter hash using blake2b 256 bit algo.
   *
   * @param entryPointArgs
   */
  private encodeMethodParametersAsHash(entryPointArgs: any) {
    const fnParamsWithoutPubKeySig = entryPointArgs.args[0];
    const paramsEncodedAsBytes = valueEncoder(fnParamsWithoutPubKeySig);
    const paramHashBuf = blake.blake2b(
      hex2buf(PACK_INDICATOR + paramsEncodedAsBytes),
      null,
      32
    );
    const paramHash = Buffer.from(paramHashBuf).toString("hex");
    return paramHash;
  }

  /**
   * Pack chainId, contractAddress, counter and blakeHash to
   * to form a native meta tx signing message
   *
   * @param address - Contract address for which the native meta tx is being formed
   * @param counter - Counter of the user address
   * @param paramHash - Blake2b hash of the entrypoint args
   *
   * @returns {string} - Hex string without `0x` prefix
   */
  private getNativeMetaTxSigningMessage(
    address: string,
    counter: string,
    paramHash: string
  ) {
    const addressEncoded = this.encodeAddress(address);
    const chainIdCst = this.getChainIdCst();

    const messageToSign = valueEncoder({
      prim: "Pair",
      args: [
        {
          prim: "Pair",
          args: [
            {
              bytes: `${chainIdCst}`,
              annots: [`%chain_id`],
            },
            {
              bytes: `${addressEncoded}`,
            },
          ],
        },
        {
          prim: "Pair",
          args: [
            { int: `${counter}`, annots: [`%counter`] },
            { bytes: `${paramHash}`, annots: [`%param_hash`] },
          ],
        },
      ],
    });
    return PACK_INDICATOR + messageToSign;
  }

  /**
   * Update the entrypoint params to include pub key and signature for meta tx
   * @param parameters
   * @param publicKey
   * @param signature
   */
  private updateFunctionParameters(
    parameters: any,
    publicKey: string,
    signature: string
  ) {
    parameters.value["args"][1] = {
      prim: "Pair",
      args: [
        {
          prim: "Some",
          args: [
            {
              string: `${publicKey}`,
            },
          ],
        },
        {
          prim: "Some",
          args: [
            {
              string: `${signature}`,
            },
          ],
        },
      ],
    };

    return parameters;
  }
}

async function sleep(ms: number) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
}
