import {
  DAppClient,
  DAppClientOptions,
  OperationRequestInput,
  PartialTezosTransactionOperation,
} from "@airgap/beacon-sdk";
import { EVENTS, RESPONSE_CODES, STATUS, config } from "./config";

import { EventEmitter } from "events";
import { MetaTxDAppClient } from "./dappClient";
import { NativeMetaTransactionRequest } from "./types";
import axios from "axios";

const eventEmitter = new EventEmitter();

const axiosInstance = axios.create({
  method: "GET",
  timeout: 30000,
  responseType: "json",
});

// Key inside local storage
const META_TX_ENABLED: any = "meta-tx-enabled";
export class BiconomyDappClient extends MetaTxDAppClient {
  private isBiconomy = true;
  private status;
  private apiKey: string;
  private dappAPIMap: { [apiName: string]: string };
  private smartContractEntryPointsMap: { [address: string]: string } = {};
  private strictMode = false;
  private providerId;
  private readViaContract = false;
  private READY = STATUS.BICONOMY_READY;
  private LOGIN_CONFIRMATION = EVENTS.LOGIN_CONFIRMATION;
  private ERROR = EVENTS.BICONOMY_ERROR;
  private pendingLoginTransactions: any;
  private jsonRPC: any;
  private beaconClient: DAppClient;

  constructor(
    dappClientConfig: DAppClientOptions,
    options: {
      apiKey: string;
      providerId?: string;
      strictMode?: boolean;
      readViaContract?: boolean;
      debug?: boolean;
    }
  ) {
    super(dappClientConfig);

    this.beaconClient = new DAppClient(dappClientConfig);

    this.isBiconomy = true;
    this.status = STATUS.INIT;
    this.apiKey = options.apiKey;
    this.dappAPIMap = {};
    this.strictMode = options.strictMode || false;
    this.providerId = options.providerId || 0;
    this.readViaContract = options.readViaContract || false;
    this.READY = STATUS.BICONOMY_READY;
    this.LOGIN_CONFIRMATION = EVENTS.LOGIN_CONFIRMATION;
    this.ERROR = EVENTS.BICONOMY_ERROR;
    this.pendingLoginTransactions = {};
    this.jsonRPC = {
      messageId: 0,
    };
    if (options.debug) {
      config.logsEnabled = true;
    }
    this.setMetaTxEnabled(true);
    this.initApiKey(this.apiKey);
  }

  /**
   * Depends on whether meta tx is enabled,
   * decides whether to override or not
   *
   * @param input
   */
  async requestOperation(input: OperationRequestInput) {
    const metaTxStatus = await this.storage.get(META_TX_ENABLED);
    if (metaTxStatus === "enabled") {
      return this.requestMetaTransaction(input);
    } else {
      const op = this.beaconClient.requestOperation.bind(this);
      return op(input);
    }
  }

  /**
   * Toggle the meta tx enable status
   */
  async toggleMetaTxStatus() {
    const currStatus = await this.storage.get(META_TX_ENABLED);

    if (currStatus === "enabled") {
      await this.storage.set(META_TX_ENABLED, "disabled");
      return false;
    } else {
      await this.storage.set(META_TX_ENABLED, "enabled");
      return true;
    }
  }

  private async setMetaTxEnabled(status: boolean) {
    // Local storage cannot support booleans
    // Converting boolean to string - enabled/disabled
    const metaTxStatus = status ? "enabled" : "disabled";
    return this.storage.set(META_TX_ENABLED, metaTxStatus);
  }

  async isMetaTxEnabled() {
    return this.storage.get(META_TX_ENABLED);
  }

  private async requestMetaTransaction(input: OperationRequestInput) {
    const {
      operationDetails,
      senderId,
    } = (await this.requestMetaTransactionSignature(input)) as {
      operationDetails: PartialTezosTransactionOperation[];
      senderId: string;
    };

    const accountInfo = await this.getActiveAccount();
    if (!accountInfo) {
      throw new Error("No active account");
    }

    const { address, publicKey } = accountInfo;
    const { baseURL } = config;

    const { parameters, destination, amount } = operationDetails[0];
    if (!parameters) {
      throw new Error("Invalid parameters");
    }

    console.log("Estimate gas ...");
    const { storageLimit, gasLimit } = await this.estimateGas(
      address,
      operationDetails[0].amount,
      operationDetails[0].destination,
      operationDetails[0].parameters
    );

    console.log("Forming meta tx req ...");
    const metaTxRequest: NativeMetaTransactionRequest = {
      metaTxData: {
        params: JSON.stringify(operationDetails[0].parameters?.value as any),
        from: publicKey,
        gasLimit,
        storageLimit,
        contractAddress: operationDetails[0].destination,
        methodType: "write",
        amount: Number(operationDetails[0].amount),
        entrypoint: operationDetails[0].parameters?.entrypoint as any,
        apiId: "8",
      },
      networkId: this.chainId,
      dappId: "09",
    };

    console.log("Sending to biconomy ...");
    const metaTxApi = `${baseURL}/meta-tx`;
    const { status, data } = await axiosInstance.post(metaTxApi, metaTxRequest);

    if (status !== 200 && status !== 201) {
      throw new Error(data);
    }

    console.log("Response received: ", data);

    return {
      senderId,
      transactionHash: data.result,
    };
  }

  isReady() {
    return this.status === STATUS.BICONOMY_READY;
  }

  /**
   * Function to initialize the biconomy object with DApp information.
   * It fetches the dapp's smart contract from biconomy database and initialize the decoders for each smart
   * contract which will be used to decode information during function calls.
   * @param apiKey API key used to authenticate the request at biconomy server
   **/
  private async initApiKey(apiKey: string) {
    try {
      const { baseURL } = config;

      // Check current network id and dapp network id registered on dashboard
      const getDappAPI = `${baseURL}/api/${config.version}/dapp`;
      const { status, data: dappResponse } = await axiosInstance.get(
        getDappAPI
      );

      if (status !== 200) {
        eventEmitter.emit(
          EVENTS.BICONOMY_ERROR,
          formatMessage(
            RESPONSE_CODES.ERROR_RESPONSE,
            "Error while initializing Biconomy"
          ),
          dappResponse
        );
      }

      _logMessage(JSON.stringify(dappResponse));

      // No Dapp found
      if (!dappResponse || !dappResponse.dapp) {
        if (dappResponse.log) {
          eventEmitter.emit(
            EVENTS.BICONOMY_ERROR,
            formatMessage(RESPONSE_CODES.ERROR_RESPONSE, dappResponse.log)
          );
        } else {
          eventEmitter.emit(
            EVENTS.BICONOMY_ERROR,
            formatMessage(
              RESPONSE_CODES.DAPP_NOT_FOUND,
              `No Dapp Registered with apikey ${apiKey}`
            )
          );
        }
      }

      // Dapp found
      const dappNetworkId = dappResponse.dapp.networkId;
      const dappId = dappResponse.dapp._id;
      _logMessage(
        `Network id corresponding to dapp id ${dappId} is ${dappNetworkId}`
      );

      // Get dapps smart contract data from biconomy servers
      const getDAppInfoAPI = `${baseURL}/api/${config.version}/smart-contract`;
      const {
        status: getDAppInfoAPIStatus,
        data: dappInfoResponse,
      } = await axiosInstance.get(getDAppInfoAPI);

      if (getDAppInfoAPIStatus !== 200) {
        eventEmitter.emit(
          EVENTS.BICONOMY_ERROR,
          formatMessage(
            RESPONSE_CODES.ERROR_RESPONSE,
            "Error while initializing Biconomy"
          ),
          dappInfoResponse
        );
      }

      if (!dappInfoResponse && dappInfoResponse.flag != 143) {
        eventEmitter.emit(
          EVENTS.BICONOMY_ERROR,
          formatMessage(
            RESPONSE_CODES.SMART_CONTRACT_NOT_FOUND,
            `Error getting smart contract for dappId ${dappId}`
          )
        );
        return;
      }

      const smartContractList = dappInfoResponse.smartContracts;
      if (smartContractList && smartContractList.length > 0) {
        smartContractList.forEach((contract: any) => {
          this.smartContractEntryPointsMap[contract.address.toLowerCase()] =
            contract.entryPoints;
        });
        this.checkUserLogin(dappId);
      } else {
        if (this.strictMode) {
          this.status = STATUS.NO_DATA;
          eventEmitter.emit(
            EVENTS.BICONOMY_ERROR,
            formatMessage(
              RESPONSE_CODES.SMART_CONTRACT_NOT_FOUND,
              `No smart contract registered for dappId ${dappId} on Mexa Dashboard`
            )
          );
        } else {
          this.checkUserLogin(dappId);
        }
      }
    } catch (error) {
      eventEmitter.emit(
        EVENTS.BICONOMY_ERROR,
        formatMessage(
          RESPONSE_CODES.ERROR_RESPONSE,
          "Error while initializing Biconomy"
        ),
        error
      );
    }
  }

  private async checkUserLogin(dappId: string) {
    const userLocalAccount = getFromStorage(config.USER_ACCOUNT);
    if (userLocalAccount) {
      const accountInfo = await this.getActiveAccount();
      if (!accountInfo) {
        eventEmitter.emit(
          EVENTS.BICONOMY_ERROR,
          formatMessage(
            RESPONSE_CODES.USER_ACCOUNT_NOT_FOUND,
            "Could not get user account"
          )
        );
      }

      const { publicKey } = accountInfo as any;
      localStorage.setItem(config.USER_ACCOUNT, publicKey);
      eventEmitter.emit(EVENTS.SMART_CONTRACT_DATA_READY, dappId, this);
    }
  }
}

/**
 * Single method to be used for logging purpose.
 *
 * @param {string} message Message to be logged
 */
function _logMessage(message: string) {
  if (config && config.logsEnabled && console.log) {
    console.log(message);
  }
}

function formatMessage(code: number | string, message: string) {
  return {
    code,
    message,
  };
}

// On getting smart contract data get the API data also
eventEmitter.on(EVENTS.SMART_CONTRACT_DATA_READY, (dappId, engine) => {
  // Get DApp API information from Database
  // let getAPIInfoAPI = `${baseURL}/api/${config.version}/meta-api`;
  // fetch(getAPIInfoAPI, getFetchOptions("GET", engine.apiKey))
  //   .then((response) => response.json())
  //   .then(function (response) {
  //     if (response && response.listApis) {
  //       let apiList = response.listApis;
  //       for (let i = 0; i < apiList.length; i++) {
  //         let contractAddress = apiList[i].contractAddress;
  //         // TODO: In case of SCW(Smart Contract Wallet) there'll be no contract address. Save SCW as key in that case.
  //         if (contractAddress) {
  //           if (!engine.dappAPIMap[contractAddress]) {
  //             engine.dappAPIMap[contractAddress] = {};
  //           }
  //           engine.dappAPIMap[contractAddress][apiList[i].method] = apiList[i];
  //         } else {
  //           if (!engine.dappAPIMap[config.SCW]) {
  //             engine.dappAPIMap[config.SCW] = {};
  //           }
  //           engine.dappAPIMap[config.SCW][apiList[i].method] = apiList[i];
  //         }
  //       }
  //       eventEmitter.emit(EVENTS.DAPP_API_DATA_READY, engine);
  //     }
  //   })
  //   .catch(function (error) {
  //     _logMessage(error);
  //   });
});

eventEmitter.on(EVENTS.DAPP_API_DATA_READY, (engine) => {
  engine.status = STATUS.BICONOMY_READY;
  eventEmitter.emit(STATUS.BICONOMY_READY);
});

function removeFromStorage(key: string) {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(key);
  }
}

function getFromStorage(key: string) {
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(key);
  }

  return null;
}

eventEmitter.on(EVENTS.DAPP_API_DATA_READY, (engine) => {
  engine.status = STATUS.BICONOMY_READY;
  eventEmitter.emit(STATUS.BICONOMY_READY);
});
