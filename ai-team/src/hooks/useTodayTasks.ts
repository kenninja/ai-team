'use client';
import { useEffect, useState } from 'react';
import { clientDb } from '@/lib/firebase-client';
import { doc, onSnapshot } from 'firebase/firestore';

export type Task = {
  id: string;
  title: string;
  source: 'mail' | 'slack' | 'other' | 'gmail';
  deadline: string | null;
  deadlineTime: string | null;
  priority: 'high' | 'medium' | 'low';
  completed: boolean;
};

export function useTodayTasks(syncCode: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!syncCode) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(doc(clientDb, 'rooms', syncCode), (snap) => {
      if (snap.exists() && snap.data().tasks) {
        const allTasks: Task[] = snap.data().tasks;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dayAfter = new Date(today);
        dayAfter.setDate(today.getDate() + 2);

        const filtered = allTasks.filter((t) => {
          if (t.completed || !t.deadline) return false;
          const d = new Date(t.deadline + 'T00:00:00');
          return d >= today && d < dayAfter;
        });

        filtered.sort((a, b) => {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return a.deadline.localeCompare(b.deadline);
        });

        setTasks(filtered);
      } else {
        setTasks([]);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [syncCode]);

  return { tasks, loading };
}
