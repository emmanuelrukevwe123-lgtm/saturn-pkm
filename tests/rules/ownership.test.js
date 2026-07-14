import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

let env;
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: "saturn-rules-test" }); });
afterAll(async () => { await env?.cleanup(); });

describe("owner-only Firestore access", () => {
  it("allows the owner and rejects another user", async () => {
    const owner = env.authenticatedContext("alice").firestore();
    const intruder = env.authenticatedContext("bob").firestore();
    await assertSucceeds(setDoc(doc(owner, "users/alice/notes/n1"), { title: "private" }));
    await expect(assertFails(getDoc(doc(intruder, "users/alice/notes/n1")))).resolves.toBeDefined();
  });

  it("allows only the owner to access image paths", async () => {
    const owner = env.authenticatedContext("alice").storage();
    const intruder = env.authenticatedContext("bob").storage();
    const ownerRef = ref(owner, "users/alice/images/i1");
    await assertSucceeds(uploadBytes(ownerRef, new Uint8Array([1, 2, 3]), { contentType: "image/png" }));
    await expect(assertFails(getBytes(ref(intruder, "users/alice/images/i1")))).resolves.toBeDefined();
  });
});
