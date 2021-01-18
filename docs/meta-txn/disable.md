# Disabling meta transactions

To disable the meta transactions,

<!-- tabs:start -->

#### **ES6**

```js
let metaTxnEnabled = await wallet.client.isMetaTxEnabled();
if (metaTxnEnabled) {
  metaTxnEnabled = await wallet.client.toggleMetaTxStatus();
}
```

#### **ES5**

```js
let metaTxnEnabled;

wallet.client.isMetaTxEnabled(function (error, metaTxnEnabled) {
  if (error) {
    /** On error logic **/
    console.error(error);
    throw new Error(error);
  }

  /** On success logic **/
  if (metaTxnEnabled) {
    metaTxnEnabled = wallet.client.toggleMetaTxStatus(
      toggleMetaTxStatusCallback
    );
  }
});

function toggleMetaTxStatusCallback(error, updatedStatus) {
  if (error) {
    /** On error logic **/
    console.error(error);
    throw new Error(error);
  }

  metaTxnEnabled = updatedStatus;
}
```

<!-- tabs:end -->
