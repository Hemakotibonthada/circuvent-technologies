import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_CV365_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_CV365_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_CV365_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_CV365_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_CV365_FIREBASE_APP_ID,
};

const appName = "cv365";
const app = getApps().find((a) => a.name === appName)
  ? getApp(appName)
  : initializeApp(firebaseConfig, appName);

const db = getFirestore(app);

export { db, collection, addDoc, serverTimestamp };
