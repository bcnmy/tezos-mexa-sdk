## Waiting for operation confirmation

<!-- tabs:start -->

#### **ES6**

```js
const transactionHash = await wallet.client.getTransactionHash();
console.log(
  `Transaction hash for the requested operation is: ${transactionHash}`
);
```

#### **ES5**

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
