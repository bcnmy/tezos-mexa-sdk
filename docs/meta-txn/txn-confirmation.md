## Waiting for operation confirmation

The following snippet shows an example how the transaction confirmation can be queried using Biconomy SDK.

<!-- tabs:start -->

#### **ES6**

```js
const { opHash, counter } = await wallet.client.getTransactionHash();
console.log(`Hash for the requested operation is: ${opHash}`);
await wallet.client.confirmation(opHash, counter);
```

#### **ES5**

```js
wallet.client.getTransactionHash(function (error, result) {
  if (error) {
    /** On error logic **/
    console.error(error);
    throw new Error(error);
  }

  console.log(`Hash for the requested operation is: ${result.opHash}`);
  txnConfirmation(result.opHash, result.counter);
});

function txnConfirmation(opHash, counter) {
  wallet.client.confirmation(opHash, counter, function (error, result) {
    if (error) {
      /** On error logic **/
      console.error(error);
      throw new Error(error);
    }

    console.log(`Operation hash: ${opHash} is confirmed`);
    /** On confirmation logic **/
  });
}
```

<!-- tabs:end -->
