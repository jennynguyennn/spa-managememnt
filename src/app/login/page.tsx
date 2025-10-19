"use client";
import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const r = useRouter();

  async function handleSignIn(e:any) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
    r.push('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-semibold text-gray-800">Quản Lý Thẻ Thành Viên</h1>
        </div>

        <form
          onSubmit={handleSignIn}
          className="p-6 rounded shadow bg-white w-full space-y-4"
          aria-label="Staff sign in form"
        >
          <h2 className="text-xl mb-0 font-medium text-gray-800">Đăng Nhập</h2>

          <input
            value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="email"
            className="w-full px-3 py-2 rounded border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />

          <input
            value={password}
            onChange={e=>setPassword(e.target.value)}
            placeholder="password"
            type="password"
            className="w-full px-3 py-2 rounded border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />

          <button
            type="submit"
            className="w-full px-3 py-2 rounded bg-gray-100 text-gray-900 border border-gray-300 hover:bg-gray-200"
          >
            Đăng Nhập
          </button>
        </form>
      </div>
    </div>
  );
}