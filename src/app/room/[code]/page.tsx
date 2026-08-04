'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Shield, Plus, LogIn } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedName = localStorage.getItem('ubezhishe_username');
    if (savedName) {
      setUsername(savedName);
    }

    let id = localStorage.getItem('ubezhishe_user_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('ubezhishe_user_id', id);
    }
  }, []);

  const handleCreateRoom = async () => {
    if (!username.trim()) {
      setError('Введите имя');
      return;
    }
    setLoading(true);
    setError('');

    const userId = localStorage.getItem('ubezhishe_user_id') || crypto.randomUUID();
    localStorage.setItem('ubezhishe_username', username.trim());

    const { data: code, error: rpcErr } = await supabase.rpc('create_room', {
      p_host_id: userId,
      p_host_name: username.trim(),
    });

    if (rpcErr) {
      setError(rpcErr.message);
      setLoading(false);
    } else {
      router.push(`/room/${code}`);
    }
  };

  const handleJoinRoom = async () => {
    if (!username.trim() || !roomCode.trim()) {
      setError('Заполните все поля');
      return;
    }
    setLoading(true);
    setError('');

    const userId = localStorage.getItem('ubezhishe_user_id') || crypto.randomUUID();
    const cleanCode = roomCode.trim().toUpperCase();
    localStorage.setItem('ubezhishe_username', username.trim());

    const { error: rpcErr } = await supabase.rpc('join_room', {
      p_room_code: cleanCode,
      p_user_id: userId,
      p_player_name: username.trim(),
    });

    if (rpcErr) {
      setError(rpcErr.message);
      setLoading(false);
    } else {
      router.push(`/room/${cleanCode}`);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-950 border border-emerald-800 text-emerald-400 mb-2">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-wider text-zinc-100">Убежище</h1>
          <p className="text-xs text-zinc-400">Карточная игра на выживание</p>
        </div>

        {error && (
          <div className="bg-rose-950/80 border border-rose-800 text-rose-200 text-xs p-3 rounded-2xl text-center">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block mb-1.5">
              Ваш никнейм
            </label>
            <input
              type="text"
              placeholder="Введите имя..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="pt-2 border-t border-zinc-800/80 space-y-3">
            <button
              onClick={handleCreateRoom}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs py-3.5 rounded-2xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40"
            >
              <Plus className="w-4 h-4" />
              <span>Создать новую комнату</span>
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-zinc-800"></div>
              <span className="flex-shrink mx-3 text-[10px] text-zinc-600 font-bold uppercase">или</span>
              <div className="flex-grow border-t border-zinc-800"></div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="КОД"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="w-28 bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-3 text-xs font-mono font-bold text-center text-zinc-100 uppercase focus:outline-none focus:border-emerald-500 transition"
              />
              <button
                onClick={handleJoinRoom}
                disabled={loading}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs py-3.5 rounded-2xl border border-zinc-700 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Войти</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
