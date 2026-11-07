import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * The web app's config. It is not a secret -- a Firebase API key is a project
 * identifier, not a credential; what protects the data are the rules in
 * firestore.rules.
 */
const config = {
  apiKey: "AIzaSyCcBw2edbq0x15csy4h4w_ZBZOGnpNvBro",
  authDomain: "issues-latam-tools.firebaseapp.com",
  projectId: "issues-latam-tools",
  storageBucket: "issues-latam-tools.firebasestorage.app",
  messagingSenderId: "997009996536",
  appId: "1:997009996536:web:dee241748a0457cec0590d",
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

/** Lazy initialisation: whoever only opens the board pays for nothing extra. */
export function getDb(): Firestore {
  if (!db) {
    app ??= initializeApp(config);
    db = getFirestore(app);
  }
  return db;
}

export function getFirebaseApp(): FirebaseApp {
  app ??= initializeApp(config);
  return app;
}
