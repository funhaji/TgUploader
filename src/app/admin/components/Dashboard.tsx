"use client";

import { useEffect, useState } from "react";
import { UploadRecord } from "../../../lib/db";
import { Copy, Trash, RefreshCw, Users, FileText, Activity } from "lucide-react";
import clsx from "clsx";

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
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (e) {
      console.error(e);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats) return <div className="p-8 text-center text-red-500">Error loading stats. Please refresh.</div>;

  return (
    <div className="min-h-screen p-6 md:p-12 bg-gray-50 text-gray-800 font-sans">
      <header className="flex items-center justify-between mb-10 max-w-6xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage your Telegram bot content</p>
        </div>
        <button 
          onClick={fetchStats} 
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <RefreshCw size={16} />
          Refresh Data
        </button>
      </header>

      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 gap-6 mb-10 md:grid-cols-2 lg:grid-cols-3">
          <StatCard 
            title="Total Users" 
            value={stats.totalUsers} 
            icon={<Users className="w-6 h-6 text-blue-600" />} 
            color="bg-blue-50 border-blue-100" 
          />
          <StatCard 
            title="Active Uploads" 
            value={stats.totalUploads} 
            icon={<FileText className="w-6 h-6 text-green-600" />} 
            color="bg-green-50 border-green-100" 
          />
          <StatCard 
            title="System Status" 
            value="Online" 
            icon={<Activity className="w-6 h-6 text-purple-600" />} 
            color="bg-purple-50 border-purple-100" 
            isText
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">Recent Uploads</h2>
            <span className="text-xs font-medium px-2 py-1 bg-gray-200 rounded-full text-gray-600">
              Latest 5
            </span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <th className="p-4 w-32">Code</th>
                  <th className="p-4 w-24">Type</th>
                  <th className="p-4 w-32">Views / Limit</th>
                  <th className="p-4">Content Preview</th>
                  <th className="p-4 w-32">Created</th>
                  <th className="p-4 w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.recentUploads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      No uploads found. Start by sending a file to the bot!
                    </td>
                  </tr>
                ) : (
                  stats.recentUploads.map((upload) => (
                    <tr key={upload.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="p-4">
                        <span className="font-mono text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded">
                          {upload.code}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={clsx(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
                          upload.type === 'text' ? 'bg-yellow-100 text-yellow-800' :
                          upload.type === 'photo' ? 'bg-blue-100 text-blue-800' :
                          upload.type === 'video' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        )}>
                          {upload.type}
                        </span>
                      </td>
                      <td className="p-4 text-sm">
                        <span className="font-medium text-gray-900">{upload.access_count}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-gray-600">{upload.max_access ?? "∞"}</span>
                      </td>
                      <td className="p-4 text-sm text-gray-600 max-w-xs truncate" title={upload.text_content || upload.file_name || ""}>
                         {upload.text_content || upload.file_name || <span className="italic text-gray-400">No preview</span>}
                      </td>
                      <td className="p-4 text-sm text-gray-500 whitespace-nowrap">
                        {new Date(upload.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigator.clipboard.writeText(`https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME}?start=${upload.code}`)}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Copy Telegram Link"
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(upload.code)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Upload"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, isText }: { title: string, value: string | number, icon: React.ReactNode, color: string, isText?: boolean }) {
  return (
    <div className={clsx("p-6 rounded-xl border shadow-sm transition-shadow hover:shadow-md bg-white", color)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <h3 className={clsx("font-bold text-gray-900", isText ? "text-2xl" : "text-4xl")}>
            {value}
          </h3>
        </div>
        <div className="p-3 bg-white rounded-lg shadow-sm">
          {icon}
        </div>
      </div>
    </div>
  );
}
