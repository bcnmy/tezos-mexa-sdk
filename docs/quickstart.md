# Getting started

1. Go to Mexa Dashboard to register your DApp and methods on which to enable meta transactions and copy your API Key.
2. Install Biconomy SDK (Mexa)

## Installation

SDK can be installed either via `npm` repository or using standalone javascript file using html `<script/>` tag

<!-- tabs:start -->

#### **NPM(ES6)**

```sh
npm i something-biconomy-tezos --save
```

#### **NPM(ES5)**

```sh
npm i something-biconomy-tezos --save
```

#### **JS file**

```sh
<script src="https://cdn.jsdelivr.net/npm/@biconomy/mexa@1/dist/mexa.min.js"></script>
```

<!-- tabs:end -->

### Mexa Initialization

<!-- tabs:start -->

#### **NPM(ES6)**

### Initialize Mexa with API Key {docsify-ignore}

```js
import { BiconomyDAppClient } from "something-biconomy-tezos";

const options = {
  name: "",
  iconUrl: "",
  preferredNetwork: "delphinet",
};
const bcnmyDappClient = new BiconomyDappClient(options, {
  apiKey: "",
});
```

### Initialize Taquito beacon wallet module

```js
import { BeaconWallet } from "@taquito/beacon-wallet";

const wallet = new BeaconWallet(options);
wallet.client = bcnmyDappClient;
```

#### **NPM(ES5)**

### Initialize Mexa with API Key {docsify-ignore}

```js
const { BiconomyDAppClient } = require("something-biconomy-tezos");

const options = {
  name: "",
  iconUrl: "",
  preferredNetwork: "delphinet",
};
const bcnmyDappClient = new BiconomyDappClient(options, {
  apiKey: "",
});
```

### Initialize Taquito beacon wallet module

```js
const { BeaconWallet } = require("@taquito/beacon-wallet");

const wallet = new BeaconWallet(options);
wallet.client = bcnmyDappClient;
```

#### **JS file**

### Initialize your DApp after Mexa initialization {docsify-ignore}

```js

```

<!-- tabs:end -->

Congratulations 👏  
You have now enabled meta transactions in your DApp. Interact with taquito beacon wallet the way you have been doing it.
Now whenever there is a write transaction action(registered in mexa dashboard also) initiated from the user , Mexa will ask for user’s signature and handle the transaction rather than sending signed transaction directly to blockchain from user’s wallet.
