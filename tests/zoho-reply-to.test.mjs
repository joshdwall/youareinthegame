import assert from "node:assert/strict";
import test from "node:test";
import { shouldSetZohoReplyToHeader, verifiedReplyToAddress } from "../workers/zoho-mail.mjs";

test("verifiedReplyToAddress prefers ZOHO_REPLY_TO then howdy@", () => {
  assert.equal(verifiedReplyToAddress({ ZOHO_REPLY_TO: "Howdy@YouAreInTheGame.com" }), "howdy@youareinthegame.com");
  assert.equal(verifiedReplyToAddress({}), "howdy@youareinthegame.com");
});

test("Reply-To header only when verified flag matches desk replyTo", () => {
  const env = { ZOHO_REPLY_TO_VERIFIED: "1", ZOHO_REPLY_TO: "howdy@youareinthegame.com" };
  assert.equal(shouldSetZohoReplyToHeader(env, "howdy@youareinthegame.com"), true);
  assert.equal(shouldSetZohoReplyToHeader(env, "newalias@youareinthegame.com"), false);
  assert.equal(shouldSetZohoReplyToHeader({ ...env, ZOHO_REPLY_TO_VERIFIED: "0" }, "howdy@youareinthegame.com"), false);
  assert.equal(shouldSetZohoReplyToHeader({}, "howdy@youareinthegame.com"), false);
});
