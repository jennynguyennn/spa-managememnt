"use client";
import { useState, useEffect } from "react";
import { supabase } from '../../lib/supabaseClient';
// ...existing code...
export default function MemberForm({ onSaved, editing, setEditing }: any) {
  const [form, setForm] = useState({ id_number: "", full_name: "", mobile: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editing) setForm(editing);
  }, [editing]);

  async function handleSubmit(e: any) {
    e.preventDefault();
    setLoading(true);

    try {
      if (editing) {
        const { error } = await supabase
          .from("members")
          .update({
            id_number: form.id_number,
            full_name: form.full_name,
            mobile: form.mobile,
          })
          .eq("id", editing.id);

        if (error) throw error;
        setEditing(null);
      } else {
        const { error } = await supabase.from("members").insert([
          {
            id_number: form.id_number,
            full_name: form.full_name,
            mobile: form.mobile,
          },
        ]);
        if (error) throw error;
      }

      setForm({ id_number: "", full_name: "", mobile: "" });
      onSaved?.(); // reload members in dashboard
    } catch (err: any) {
      alert("Error: " + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 bg-white shadow-sm border rounded p-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700">ID number</label>
          <input
            value={form.id_number}
            onChange={(e) => setForm({ ...form, id_number: e.target.value })}
            placeholder="e.g. 12345"
            className="mt-1 block w-full border-gray-200 rounded px-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Full name"
            className="mt-1 block w-full border-gray-200 rounded px-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Mobile</label>
          <input
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            placeholder="+6012..."
            className="mt-1 block w-full border-gray-200 rounded px-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
        >
          {editing ? "Update" : loading ? "Saving..." : "Add member"}
        </button>

        {editing && (
          <button
            type="button"
            onClick={() => { setEditing(null); setForm({ id_number: "", full_name: "", mobile: "" }); }}
            className="inline-flex items-center gap-2 bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
// ...existing code...