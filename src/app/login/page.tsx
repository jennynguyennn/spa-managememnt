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
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSignIn} className="p-6 rounded shadow bg-white">
        <h2 className="text-xl mb-4">Staff sign in</h2>
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" />
        <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="password" type="password" />
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}
