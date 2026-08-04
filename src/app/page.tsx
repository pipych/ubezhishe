'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Получение или генерация анонимного ID игрока
  const getUserId = () => {
    let userId = localStorage.getItem('ubezhishe_user_id');
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem('ubezhishe_user_id', userId);
    }
    return userId;
  };

  // Генерация 6-значного кода комнаты
  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(floor(random() * chars.length));
    }
    return result;
  };

  // Создание комнаты
  const handleCreateRoom = async () => {
    if (!name.trim()) return setError('Введи имя');
    setLoading(true);
    setError('');

    try {
      const userId = getUserId();
      const roomCode = generateRoomCode();

      // 1. Создаем комнату
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .insert([{ code: roomCode, host_id: userId }])
        .select()
        .single();

      if (roomErr) throw roomErr;

      // 2. Добавляем хоста в игроки
      const { error: playerErr } = await supabase
        .from('players')
        .insert([{ room_id: room.id, user_id: userId, name: name.trim() }]);

      if (playerErr) throw playerErr;

      router.push(`/room/${room.code}`);
    } catch (err: any) {
      setError(err.message || 'Ошибка создания комнаты');
    } finally {
      setLoading(false);
    }
  };

  // Вход в существующую комнату
  const handleJoinRoom = async () => {
    if (!name.trim()) return setError('Введи имя');
    if (!code.trim()) return setError('Введи код комнаты');
    setLoading(true);
    setError('');

    try {
      const userId = getUserId();
      const cleanCode = code.trim().toUpperCase();

      // 1. Ищем комнату
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('id, code')
        .eq('code', cleanCode)
        .single();

      if (roomErr || !room) throw new Error('Комната не найдена');

      // 2. Регистрируем игрока
      const { error: playerErr } = await supabase
        .from('players')
        .upsert([{ room_id: room.id, user_id: userId, name: name.trim() }], {
          onConflict: 'room_id,user_id',
        });

      if (playerErr) throw playerErr;

      router.push(`/room/${room.code}`);
    } catch (err: any) {
      setError(err.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 antialiased">
      <div className="w-full max-w-md bg-zinc-900/70 border border-zinc-800/80 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6">
        
        {/* Заголовок */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-black tracking-wider uppercase text-emerald-500">
            Убежище
          </h1>
          <p className="text-xs text-zinc-400 font-medium">
            Психологическая игра на выживание
          </p>
        </div>

        {/* Форма */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5 px-3">
              Имя игрока
            </label>
            <input
              type="text"
              placeholder="Введи никнейм"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-full px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="pt-2 border-t border-zinc-800/80">
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5 px-3">
              Код комнаты (для подключения)
            </label>
            <input
              type="text"
              maxLength={6}
              placeholder="X7K2P9"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-full px-4 py-2.5 text-sm text-center tracking-widest font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition uppercase"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-400 text-center font-medium px-2">
              {error}
            </p>
          )}

          {/* Кнопки-пилюли */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              onClick={handleJoinRoom}
              disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold text-xs py-2.5 px-5 rounded-full transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-950/40"
            >
              Войти в игру
            </button>
            <button
              onClick={handleCreateRoom}
              disabled={loading}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-semibold text-xs py-2.5 px-5 rounded-full transition-all active:scale-95 disabled:opacity-50"
            >
              Создать комнату
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}
