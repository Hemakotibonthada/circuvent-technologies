const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_CV365_FIREBASE_PROJECT_ID || "circuvent";
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_CV365_FIREBASE_API_KEY;

/**
 * Save a contact message to CV-365 Firestore via REST API.
 * This works reliably in server-side API routes (no client SDK needed).
 */
export async function saveContactMessage(data: {
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
  source: string;
}) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/contactMessages?key=${FIREBASE_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        name: { stringValue: data.name },
        email: { stringValue: data.email },
        subject: { stringValue: data.subject },
        category: { stringValue: data.category },
        message: { stringValue: data.message },
        status: { stringValue: "new" },
        source: { stringValue: data.source },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Firestore REST error ${response.status}: ${err}`);
  }

  return response.json();
}
