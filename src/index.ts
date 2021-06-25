import {
  DAppClient,
  DAppClientOptions,
  OperationRequestInput,
  PartialTezosTransactionOperation,
} from "@airgap/beacon-sdk";
import { EVENTS, RESPONSE_CODES, STATUS, config } from "./config";

import { EventEmitter } from "events";
import { MetaTxDAppClient } from "./dappClient";
import axios from "axios";

const eventEmitter = new EventEmitter();

const axiosInstance = axios.create({
  method: "GET",
  timeout: 30000,
  responseType: "json",
  validateStatus: (status: number) => true,
});

// Key inside local storage
const META_TX_ENABLED: any = "meta-tx-enabled";

export class BiconomyDappClient extends MetaTxDAppClient {
  private isBiconomy = true;
  private status;
  private apiKey: string;
  private dappId: string | null = null;
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
      return this.requestMetaTransaction(input) as any;
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

    const metaTxRequest = {
      params: JSON.stringify(operationDetails[0].parameters),
      from: publicKey,
      gasLimit,
      storageLimit,
      to: operationDetails[0].destination,
      methodType: "write",
      amount: Number(operationDetails[0].amount),
      apiId: (this.dappAPIMap[operationDetails[0].destination.toLowerCase()][
        operationDetails[0].parameters?.entrypoint as any
      ] as any)["id"],
      networkId: this.chainId,
      dappId: String(this.dappId),
    };

    console.log("Sending to biconomy ...");
    const metaTxApi = `${baseURL}/api/v2/meta-tx/native`;
    axiosInstance.defaults.headers.common["x-api-key"] = this.apiKey;
    const { status, data } = await axiosInstance.post(metaTxApi, metaTxRequest);

    if (status !== 201) {
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
      axiosInstance.defaults.headers.common["x-api-key"] = apiKey;
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
      this.dappId = dappId;
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
      _logMessage(error);
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

  /**
   * Method used to listen to events emitted from the SDK
   */
  onEvent(type: string, callback: any) {
    if (
      type === this.READY ||
      type === this.ERROR ||
      type === this.LOGIN_CONFIRMATION
    ) {
      eventEmitter.on(type, callback);
      return this;
    } else {
      throw formatMessage(
        RESPONSE_CODES.EVENT_NOT_SUPPORTED,
        `${type} event is not supported.`
      );
    }
  }

  private async checkUserLogin(dappId: string) {
    _logMessage("Smart contract ready");
    eventEmitter.emit(EVENTS.SMART_CONTRACT_DATA_READY, dappId, this);
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
eventEmitter.on(EVENTS.SMART_CONTRACT_DATA_READY, async (dappId, engine) => {
  try {
    // Get DApp API information from Database
    const { baseURL } = config;
    let getAPIInfoAPI = `${baseURL}/api/${config.version}/meta-api`;
    axiosInstance.defaults.headers.common["x-api-key"] = engine.apiKey;
    const { status, data: response } = await axiosInstance.get(getAPIInfoAPI);
    if (status !== 200) {
      eventEmitter.emit(
        EVENTS.BICONOMY_ERROR,
        formatMessage(
          RESPONSE_CODES.ERROR_RESPONSE,
          "Error while querying meta APIs"
        ),
        response
      );
    }

    if (response && response.listApis) {
      let apiList = response.listApis;
      for (let i = 0; i < apiList.length; i++) {
        let contractAddress = apiList[i].contractAddress;
        if (contractAddress) {
          if (!engine.dappAPIMap[contractAddress]) {
            engine.dappAPIMap[contractAddress] = {};
          }
          engine.dappAPIMap[contractAddress][apiList[i].method] = apiList[i];
        } else {
          // contract address can never be null
          eventEmitter.emit(
            EVENTS.BICONOMY_ERROR,
            "Some error occured. Please contact Biconomy team."
          );
        }
      }
      eventEmitter.emit(EVENTS.DAPP_API_DATA_READY, engine);
    }
  } catch (error) {
    _logMessage(error);
  }
});

eventEmitter.on(EVENTS.DAPP_API_DATA_READY, (engine) => {
  engine.status = STATUS.BICONOMY_READY;
  eventEmitter.emit(STATUS.BICONOMY_READY);
});

eventEmitter.on(EVENTS.DAPP_API_DATA_READY, (engine) => {
  engine.status = STATUS.BICONOMY_READY;
  eventEmitter.emit(STATUS.BICONOMY_READY);
});
