import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Config do app web. Não é segredo — chave de API do Firebase é identificador de
 * projeto, não credencial; quem protege os dados são as regras em firestore.rules.
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

/** Inicialização preguiçosa: quem só abre o quadro não paga por nada extra. */
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
