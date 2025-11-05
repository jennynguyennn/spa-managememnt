"use client";
import React, { useState, useEffect } from "react";
import { supabase } from '../../lib/supabaseClient';

export default function MemberForm({ onSaved, editing, setEditing }: any) {
  const [form, setForm] = useState({
    id_number: "",
    full_name: "",
    mobile: "",
    id_card_created_date: "",
    note: "", // new field
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        id_number: editing.id_number ?? "",
        full_name: editing.full_name ?? "",
        mobile: editing.mobile ?? "",
        id_card_created_date: editing.id_card_created_date
          ? String(editing.id_card_created_date).slice(0, 10)
          : "",
        note: editing.note ?? "", // initialize when editing
      });
    } else {
      setForm({ id_number: "", full_name: "", mobile: "", id_card_created_date: "", note: "" });
    }
  }, [editing]);

  async function handleSubmit(e: any) {
    e.preventDefault();
    setLoading(true);

    // required validation
    if (!form.id_number.trim() || !form.full_name.trim()) {
      alert("Vui lòng nhập CCCD và Tên khách hàng (ID number and Name are required).");
      setLoading(false);
      return;
    }

    try {
      if (editing && editing.id) {
        const { data, error } = await supabase
          .from("members")
          .update({
            id_number: form.id_number.trim(),
            full_name: form.full_name.trim(),
            mobile: form.mobile.trim() || null,
            id_card_created_date: form.id_card_created_date || null,
            note: form.note?.trim() || null, // include note
          })
          .eq("id", editing.id)
          .select()
          .maybeSingle();

        if (error) throw error;
        setEditing(null);
        await onSaved?.(data);
      } else {
        const { data, error } = await supabase
          .from("members")
          .insert([
            {
              id_number: form.id_number.trim(),
              full_name: form.full_name.trim(),
              mobile: form.mobile.trim() || null,
              id_card_created_date: form.id_card_created_date || null,
              note: form.note?.trim() || null, // include note
            },
          ])
          .select()
          .maybeSingle();

        if (error) throw error;
        await onSaved?.(data);
      }

      setForm({ id_number: "", full_name: "", mobile: "", id_card_created_date: "", note: "" });
    } catch (err: any) {
      console.error("member submit error:", err);
      alert("Error: " + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 bg-white shadow-sm border rounded p-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700">CCCD</label>
          <input
            value={form.id_number}
            onChange={(e) => setForm({ ...form, id_number: e.target.value })}
            placeholder="e.g. 12345"
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
            required
            aria-required
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Tên Khách Hàng</label>
          <input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Fullname"
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
            required
            aria-required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Số Điện Thoại</label>
          <input
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            placeholder="+84..."
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
          />
        </div>

        <div className="sm:col-span-1">
          <label className="block text-sm font-medium text-gray-700">Ngày cấp CCCD</label>
          <input
            type="date"
            value={form.id_card_created_date}
            onChange={(e) => setForm({ ...form, id_card_created_date: e.target.value })}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
          />
        </div>
      </div>

      {/* Note field - free text, not used in QR */}
      <div className="mt-3">
        <label className="block text-sm font-medium text-gray-700">Ghi Chú</label>
        <textarea
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="Ghi chú thêm về khách hàng..."
          className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
          rows={3}
        />
      </div>

      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
        >
          {editing ? (loading ? "Đang cập nhật..." : "Cập nhật") : loading ? "Đang lưu..." : "Thêm Thành Viên"}
        </button>

        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm({ id_number: "", full_name: "", mobile: "", id_card_created_date: "", note: "" });
            }}
            className="inline-flex items-center gap-2 bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
          >
            Hủy
          </button>
        )}
      </div>
    </form>
  );
}