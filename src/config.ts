import { ChainIds } from "@taquito/taquito";

const baseConfig = {
  version: "v1",
  loginDomainName: "Biconomy Login",
  loginVersion: "1",
  baseURL: "https://api.biconomy.io",
  JSON_RPC_VERSION: "2.0",
  logsEnabled: true,
};

const config = {
  ...baseConfig,
  nativeMetaTxUrl: `/api/${baseConfig.version}/meta-tx/native`,
  userLoginPath: `/api/${baseConfig.version}/dapp-user/login`,
  handleSignedTxUrl: `/api/${baseConfig.version}/meta-tx/sendSignedTx`,
};

const EVENTS: { [type: string]: string } = {
  SMART_CONTRACT_DATA_READY: "smart_contract_data_ready",
  DAPP_API_DATA_READY: "dapp_api_data_ready",
  LOGIN_CONFIRMATION: "login_confirmation",
  BICONOMY_ERROR: "biconomy_error",
};

const RESPONSE_CODES: { [type: string]: string } = {
  ERROR_RESPONSE: "B500",
  API_NOT_FOUND: "B501",
  USER_CONTRACT_NOT_FOUND: "B502",
  USER_NOT_LOGGED_IN: "B503",
  USER_ACCOUNT_NOT_FOUND: "B504",
  NETWORK_ID_MISMATCH: "B505",
  BICONOMY_NOT_INITIALIZED: "B506",
  NETWORK_ID_NOT_FOUND: "B507",
  SMART_CONTRACT_NOT_FOUND: "B508",
  DAPP_NOT_FOUND: "B509",
  INVALID_PAYLOAD: "B510",
  DASHBOARD_DATA_MISMATCH: "B511",
  SUCCESS_RESPONSE: "B200",
  USER_CONTRACT_CREATION_FAILED: "B512",
  EVENT_NOT_SUPPORTED: "B513",
  INVALID_DATA: "B514",
};

const BICONOMY_RESPONSE_CODES: { [type: string]: number } = {
  SUCCESS: 200,
  ACTION_COMPLETE: 143,
  USER_CONTRACT_NOT_FOUND: 148,
  ERROR_RESPONSE: 144,
};

const STATUS: { [type: string]: string } = {
  INIT: "init",
  BICONOMY_READY: "biconomy_ready",
  NO_DATA: "no_data",
};

const NETWORK_CONFIG: {
  [networkType: string]: {
    rpc: string;
    networkId: ChainIds;
  };
} = {
  mainnet: {
    rpc: "https://api.tez.ie/rpc/mainnet",
    networkId: ChainIds.MAINNET,
  },
  florencenet: {
    rpc: "https://florencenet.smartpy.io",
    networkId: ChainIds.FLORENCENET,
  }
};

export {
  config,
  EVENTS,
  RESPONSE_CODES,
  BICONOMY_RESPONSE_CODES,
  STATUS,
  NETWORK_CONFIG,
};
