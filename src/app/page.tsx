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
    const savedId = localStorage.getItem('ubezhishe_user_id');
    if (!savedId) {
      const newId = crypto.randomUUID();
      localStorage.setItem('ubezhishe_user_id', newId);
    }
    const savedName = localStorage.getItem('ubezhishe_username');
    if (savedName) {
      setUsername(savedName);
    }
  }, []);

  const handleCreateRoom = async () => {
    if (!username.trim()) {
      setError('Введите ваш никнейм');
      return;
    }
    setLoading(true);
    setError('');

    const userId = localStorage.getItem('ubezhishe_user_id');
    localStorage.setItem('ubezhishe_username', username.trim());

    try {
      const { data, error: rpcError } = await supabase.rpc('create_room', {
        p_host_user_id: userId,
        p_host_name: username.trim(),
      });

      if (rpcError) throw rpcError;
      router.push(`/room/${data}`);
    } catch (err: any) {
      setError(err.message || 'Ошибка создания комнаты');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!username.trim()) {
      setError('Введите ваш никнейм');
      return;
    }
    if (!roomCode.trim()) {
      setError('Введите код комнаты');
      return;
    }
    setLoading(true);
    setError('');

    const userId = localStorage.getItem('ubezhishe_user_id');
    localStorage.setItem('ubezhishe_username', username.trim());

    try {
      const { data, error: rpcError } = await supabase.rpc('join_room', {
        p_room_code: roomCode.trim().toUpperCase(),
        p_user_id: userId,
        p_player_name: username.trim(),
      });

      if (rpcError) throw rpcError;
      router.push(`/room/${roomCode.trim().toUpperCase()}`);
    } catch (err: any) {
      setError(err.message || 'Ошибка подключения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-10 max-w-xl w-full shadow-2xl space-y-7 backdrop-blur-xl">
        
        {/* Заголовок */}
        <div className="text-center space-y-2 flex flex-col items-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400 mb-1">
            <Shield className="w-8 h-8 sm:w-9 sm:h-9" />
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-zinc-100 tracking-wider uppercase">
            Убежище
          </h1>
          <p className="text-xs sm:text-base text-zinc-400 font-medium">
            Карточная игра на выживание
          </p>
        </div>

        {/* Ошибка */}
        {error && (
          <div className="bg-rose-950/80 border border-rose-800 text-rose-200 text-xs sm:text-sm p-4 rounded-2xl text-center">
            {error}
          </div>
        )}

        {/* Форма */}
        <div className="space-y-5">
          {/* Никнейм */}
          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-bold text-zinc-400 uppercase tracking-wider block">
              Ваш никнейм
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите имя..."
              maxLength={20}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-2xl px-5 py-3.5 sm:py-4 text-sm sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none transition"
            />
          </div>

          {/* Создать комнату */}
          <button
            onClick={handleCreateRoom}
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-black text-sm sm:text-base py-4 rounded-2xl transition flex items-center justify-center gap-2.5 active:scale-95 shadow-lg shadow-emerald-950/40 uppercase tracking-wider disabled:opacity-50"
          >
            <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>{loading ? 'Создаем...' : 'Создать новую комнату'}</span>
          </button>

          {/* Разделитель */}
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-zinc-800"></div>
            <span className="shrink-0 px-4 text-xs sm:text-sm font-bold text-zinc-500 uppercase tracking-widest">
              или
            </span>
            <div className="flex-grow border-t border-zinc-800"></div>
          </div>

          {/* Подключиться */}
          <div className="flex gap-3">
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="КОД"
              maxLength={6}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-2xl px-5 py-3.5 sm:py-4 text-sm sm:text-base font-mono font-bold text-center tracking-widest text-zinc-100 placeholder-zinc-600 focus:outline-none transition uppercase"
            />
            <button
              onClick={handleJoinRoom}
              disabled={loading}
              className="px-6 sm:px-8 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-bold text-sm sm:text-base py-3.5 sm:py-4 rounded-2xl transition flex items-center justify-center gap-2 shrink-0 active:scale-95 disabled:opacity-50"
            >
              <LogIn className="w-5 h-5 sm:w-6 sm:h-6" />
              <span>Войти</span>
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}
