# Transaction status

## Transaction Lifecycle

Each transaction submitted to Biconomy undergoes various stages. The corresponding statuses are listed below:

- `Queued`
- `Broadcasted`
- `Success`
- `Failure`

TODO
[Diagram](...)

## Querying operation hash

<!-- tabs:start -->

#### **NPM(ES6)**

```js
const transactionHash = await wallet.client.getTransactionHash();
console.log(
  `Transaction hash for the requested operation is: ${transactionHash}`
);
```

#### **NPM(ES5)**

```js
wallet.client.getTransactionHash(function (error, transactionHash) {
  if (error) {
    /** On error logic **/
    console.error(error);
    throw new Error(error);
  }

  console.log(
    `Transaction hash for the requested operation is: ${transactionHash}`
  );
  /** On success logic **/
});
```

<!-- tabs:end -->
