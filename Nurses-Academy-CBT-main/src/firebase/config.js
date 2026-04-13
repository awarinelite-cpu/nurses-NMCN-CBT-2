import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAsSmqpkrXEMLL4wdoEn_jD3juAy8Z-w9A",
  authDomain: "nurses-nmcn-cbt.onrender.com",
  databaseURL: "https://elitecarehub-a80da-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "elitecarehub-a80da",
  storageBucket: "elitecarehub-a80da.firebasestorage.app",
  messagingSenderId: "76292607120",
  appId: "1:76292607120:web:29ac5fae7fb4e58876dc15"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
