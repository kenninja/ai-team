import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, Firestore } from 'firebase/firestore';

let app: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;

function getFirestoreDb(): Firestore {
  if (!firestoreDb) {
    if (getApps().length === 0) {
      app = initializeApp({
        apiKey: process.env.FIREBASE_API_KEY,
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    } else {
      app = getApps()[0];
    }
    firestoreDb = getFirestore(app);
  }
  return firestoreDb;
}

const getSyncCode = () => process.env.FIREBASE_SYNC_CODE || 'gts555';

export interface FirestoreTask {
  id: string;
  title: string;
  source: 'slack' | 'mail' | 'other';
  deadline: string | null;
  deadlineTime: string | null;
  priority: 'high' | 'medium' | 'low';
  repeat: string;
  alertBefore: string;
  completed: boolean;
  createdAt: string;
  notified: boolean;
  alertNotified: boolean;
}

export async function readTasks(): Promise<FirestoreTask[]> {
  const db = getFirestoreDb();
  const docRef = doc(db, 'rooms', getSyncCode());
  const snap = await getDoc(docRef);
  if (snap.exists() && snap.data().tasks) {
    return snap.data().tasks as FirestoreTask[];
  }
  return [];
}

export async function appendTask(task: FirestoreTask): Promise<void> {
  const db = getFirestoreDb();
  const docRef = doc(db, 'rooms', getSyncCode());
  const existing = await readTasks();
  existing.unshift(task);
  await updateDoc(docRef, { tasks: existing });
  console.log(`[firebase] タスク追加: "${task.title}" (source: ${task.source})`);
}
