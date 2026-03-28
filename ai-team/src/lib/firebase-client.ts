import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDZsCD3WIyv_DwG0F4RUb04T7yc4s6ofMU",
  authDomain: "my-tasks-74a8f.firebaseapp.com",
  projectId: "my-tasks-74a8f",
  storageBucket: "my-tasks-74a8f.firebasestorage.app",
  messagingSenderId: "265280468538",
  appId: "1:265280468538:web:85286fb38021be6e746703"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const clientDb = getFirestore(app);
