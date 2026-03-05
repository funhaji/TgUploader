"use client";

import { useEffect, useState } from "react";
import { UploadRecord } from "../../../lib/db";
import { Copy, Trash, RefreshCw } from "lucide-react";

type Stats = {
  totalUploads: number;
  totalUsers: number;
  recentUploads: UploadRecord[];
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/stats");
    if (res.ok) {
      setStats(await res.json());
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleDelete = async (code: string) => {
    if (!confirm("Are you sure?")) return;
    const res = await fetch(`/api/admin/upload/${code}`, {
      method: "DELETE"
    });
    if (res.ok) {
      fetchStats();
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!stats) return <div className="p-8">Error loading stats.</div>;

  return (
    <div className="min-h-screen p-8 bg-gray-50 text-gray-800">
      <h1 className="mb-8 text-3xl font-bold">Admin Dashboard</h1>

      <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-2">
        <div className="p-6 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-600">Total Users</h2>
          <p className="mt-2 text-4xl font-bold text-blue-600">{stats.totalUsers}</p>
        </div>
        <div className="p-6 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-600">Total Uploads</h2>
          <p className="mt-2 text-4xl font-bold text-green-600">{stats.totalUploads}</p>
        </div>
      </div>

      <div className="p-6 bg-white rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Recent Uploads</h2>
          <button onClick={fetchStats} className="p-2 text-gray-500 hover:text-blue-500">
            <RefreshCw size={20} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b">
                <th className="p-3">Code</th>
                <th className="p-3">Type</th>
                <th className="p-3">Views</th>
                <th className="p-3">Created</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentUploads.map((upload) => (
                <tr key={upload.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-mono">{upload.code}</td>
                  <td className="p-3">{upload.type}</td>
                  <td className="p-3">{upload.access_count} / {upload.max_access ?? "∞"}</td>
                  <td className="p-3 text-sm text-gray-500">
                    {new Date(upload.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(`https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME}?start=${upload.code}`)}
                        className="p-1 text-blue-500 hover:text-blue-700"
                        title="Copy Link"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(upload.code)}
                        className="p-1 text-red-500 hover:text-red-700"
                        title="Delete"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
