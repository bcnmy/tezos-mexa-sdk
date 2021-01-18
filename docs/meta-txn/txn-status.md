# Transaction status

## Transaction Lifecycle

- Queued
- Broadcasted
- Success
- Failure

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

#### **JS file**

```js
await wallet.client.getTransactionHash();
```

<!-- tabs:end -->
