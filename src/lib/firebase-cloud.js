import { collection, doc, getDocs, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { getBlob, getStorage, ref, uploadBytes } from "firebase/storage";

// Only loaded when cloud sync is switched on.
export function startCloud(app) {
  return {
    cloudApi: { db: getFirestore(app), collection, doc, getDocs, setDoc, serverTimestamp },
    imageApi: { storage: getStorage(app), ref, uploadBytes, getBlob },
  };
}
