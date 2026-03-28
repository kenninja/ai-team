'use client';

import { useEffect, useMemo, useState } from 'react';
import { clientDb } from '@/lib/firebase-client';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import type { WorkLog } from '@/types/workLog';

export default function WorkLogSummary() {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];

        const q = query(
          collection(clientDb, 'work_logs'),
          where('date', '>=', weekAgoStr),
          orderBy('date', 'desc')
        );
        const snapshot = await getDocs(q);
        setLogs(snapshot.docs.map((d) => d.data() as WorkLog));
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const summary = useMemo(() => {
    return logs.reduce<Record<string, number>>((acc, log) => {
      acc[log.category] = (acc[log.category] ?? 0) + 1;
      return acc;
    }, {});
  }, [logs]);

  return (
    <div className="border-2 border-gray-200 shadow-sm rounded-2xl p-4 bg-white">
      <h2 className="font-bold text-sm text-gray-500 mb-3">今週の業務ログ</h2>
      {loading ? (
        <div className="text-sm text-gray-400 text-center py-4">読み込み中...</div>
      ) : Object.keys(summary).length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-4">今週のログはありません</div>
      ) : (
        <div>
          {Object.entries(summary).map(([cat, count]) => (
            <div key={cat} className="flex justify-between text-sm py-1 border-b border-gray-100">
              <span>{cat}</span>
              <span className="font-bold">{count}件</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

