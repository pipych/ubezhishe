'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Shield, LogIn, ArrowLeft } from 'lucide-react';

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.code as string)?.toUpperCase();

  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [needName, setNeedName] = useState(false);

  useEffect(() => {
    // Создаём user ID если нет
    let id = localStorage.getItem('ubezhishe_user_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('ubezhishe_user_id', id);
    }

    // Проверяем сохранённый ник
    const savedName = localStorage.getItem('ubezhishe_username');
    if (savedName) {
      // Ник есть — авто-вход
      setUsername(savedName);
      autoJoin(savedName, id);
    } else {
      // Ника нет — показываем форму
      setNeedName(true);
      setLoading(false);
    }
  }, []);

  const autoJoin = async (name: string, userId: string) => {
    setJoining(true);
    setError('');

    const { error: rpcErr } = await supabase.rpc('join_room', {
      p_room_code: roomCode,
      p_user_id: userId,
      p_player_name: name.trim(),
    });

    if (rpcErr) {
      setError(rpcErr.message);
      setNeedName(true);
      setLoading(false);
      setJoining(false);
    } else {
      localStorage.setItem('ubezhishe_username', name.trim());
      router.push(`/room/${roomCode}`);
    }
  };

  const handleJoin = async () => {
    if (!username.trim()) {
      setError('Введите имя');
      return;
    }

    const userId = localStorage.getItem('ubezhishe_user_id') || crypto.randomUUID();
    localStorage.setItem('ubezhishe_user_id', userId);
    await autoJoin(username, userId);
  };

  if (loading && !needName) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 font-sans gap-4">
        <Shield className="w-10 h-10 text-emerald-500 animate-pulse" />
        <p className="text-xs text-zinc-500 font-mono">Подключение к комнате {roomCode}...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-950 border border-emerald-800 text-emerald-400 mb-2">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-wider text-zinc-100">Убежище</h1>
          <p className="text-xs text-zinc-400">
            Приглашение в комнату{' '}
            <span className="bg-emerald-950 text-emerald-400 font-mono text-xs font-bold px-2 py-0.5 rounded-full border border-emerald-800/50">
              {roomCode}
            </span>
          </p>
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
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              maxLength={20}
              autoFocus
              className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={joining || !username.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs py-3.5 rounded-2xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40"
          >
            <LogIn className="w-4 h-4" />
            <span>{joining ? 'Входим...' : 'Войти в игру'}</span>
          </button>

          <button
            onClick={() => router.push('/')}
            className="w-full text-zinc-500 hover:text-zinc-300 text-[11px] font-medium transition flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>На главную</span>
          </button>
        </div>
      </div>
    </main>
  );
}
