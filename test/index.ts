/* eslint-disable */
import { MockLocalStorage } from "./test-utils/MockLocalStorage";
(global as any).localStorage = new MockLocalStorage();

/**
 * Create a JSDOM instance to support localStorage and other DOM methods
 */
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});

(global as any).window = dom.window;
(global as any).document = dom.window.document;

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import "mocha";
import * as sinon from "sinon";

import { BiconomyDappClient } from "../src";
import { NetworkType, LocalStorage } from "@airgap/beacon-sdk";

// use chai-as-promised plugin
chai.use(chaiAsPromised);
const expect = chai.expect;

describe(`DAppClient`, () => {
  before(function () {
    /**
     * This is used to mock the window object
     *
     * We cannot do it globally because it fails in the storage tests because of security policies
     */
    this.jsdom = require("jsdom-global")(
      "<!doctype html><html><body></body></html>",
      {
        url: "http://localhost/",
      }
    );
  });

  after(function () {
    /**
     * Remove jsdom again because it's only needed in this test
     */
    this.jsdom();
    sinon.restore();
  });

  beforeEach(() => {
    sinon.restore();
  });

  it(`should initialize without an error`, async () => {
    const bcnmyClient = new BiconomyDappClient(
      {
        name: "Quote DApp",
        iconUrl: "https://avatars0.githubusercontent.com/u/50363773?s=60&v=4",
        preferredNetwork: NetworkType.DELPHINET,
        storage: new LocalStorage(),
      },
      {
        apiKey: "x51aFf3c5.9d71642c-30b6-44a7-a2f4-c031b73de9c1",
        providerId: "42",
      }
    );
    expect(bcnmyClient).to.not.be.undefined;
  });
});
