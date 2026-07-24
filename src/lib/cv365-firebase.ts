// CV-365 Firestore contact bridge — Firebase is imported lazily (dynamic
// import inside the submit path) so the heavy SDK is NOT in the initial page
// bundle; it only loads when a visitor actually submits the contact form.

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_CV365_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_CV365_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_CV365_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_CV365_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_CV365_FIREBASE_APP_ID,
};

const appName = "cv365";

/**
 * Save a contact message to CV-365 Firestore (client-side).
 * Firestore rules allow public creates on contactMessages.
 */
export async function saveContactMessage(data: {
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
  source: string;
}) {
  const [{ initializeApp, getApps, getApp }, { getFirestore, collection, addDoc, Timestamp }] =
    await Promise.all([import("firebase/app"), import("firebase/firestore")]);
  const app = getApps().find((a) => a.name === appName)
    ? getApp(appName)
    : initializeApp(firebaseConfig, appName);
  const db = getFirestore(app);
  return addDoc(collection(db, "contactMessages"), {
    ...data,
    status: "new",
    createdAt: Timestamp.now(),
  });
}
