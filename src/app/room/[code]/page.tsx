'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.code as string)?.toUpperCase();

  const [userId, setUserId] = useState<string>('');
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [myCard, setMyCard] = useState<any>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = localStorage.getItem('ubezhishe_user_id');
    if (!id) {
      router.push('/');
      return;
    }
    setUserId(id);
    initRoom(id);
  }, [roomCode]);

  const initRoom = async (currentUserId: string) => {
    try {
      const { data: roomData, error: roomErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', roomCode)
        .single();

      if (roomErr || !roomData) throw new Error('Комната не найдена');
      setRoom(roomData);

      fetchPlayers(roomData.id);

      const channel = supabase
        .channel(`room_${roomData.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomData.id}` },
          (payload) => setRoom(payload.new)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomData.id}` },
          () => fetchPlayers(roomData.id)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomData.id}` },
          () => fetchVotes(roomData.id, currentUserId)
        )
        .subscribe();

      if (roomData.phase !== 'LOBBY') {
        fetchMyCard(roomData.id, currentUserId);
        fetchVotes(roomData.id, currentUserId);
      }

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayers = async (roomId: string) => {
    const { data } = await supabase.from('players').select('*').eq('room_id', roomId);
    if (data) setPlayers(data);
  };

  const fetchMyCard = async (roomId: string, currentUserId: string) => {
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', currentUserId)
      .single();

    if (!player) return;

    const { data: card } = await supabase
      .from('player_cards')
      .select('*')
      .eq('player_id', player.id)
      .single();

    if (card) setMyCard(card);
  };

  const fetchVotes = async (roomId: string, currentUserId: string) => {
    const { data: myPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', currentUserId)
      .single();

    if (!myPlayer) return;

    const { data: vote } = await supabase
      .from('votes')
      .select('target_id')
      .eq('room_id', roomId)
      .eq('voter_id', myPlayer.id)
      .single();

    if (vote) {
      setMyVote(vote.target_id);
      setSelectedTarget(vote.target_id);
    } else {
      setMyVote(null);
    }
  };

  const handleStartGame = async () => {
    if (!room) return;
    setActionLoading(true);
    const { error: rpcErr } = await supabase.rpc('start_game', { p_room_id: room.id });
    if (rpcErr) setError(rpcErr.message);
    setActionLoading(false);
  };

  const handleRevealField = async (fieldKey: string) => {
    if (!myCard) return;
    const updatedField = { ...myCard[fieldKey], revealed: true };

    const { error: updateErr } = await supabase
      .from('player_cards')
      .update({ [fieldKey]: updatedField })
      .eq('player_id', myCard.player_id);

    if (!updateErr) {
      setMyCard((prev: any) => ({ ...prev, [fieldKey]: updatedField }));
    }
  };

  const handleCastVote = async () => {
    if (!selectedTarget || !room) return;
    setActionLoading(true);
    setError('');

    const { error: rpcErr } = await supabase.rpc('cast_vote', {
      p_room_id: room.id,
      p_voter_user_id: userId,
      p_target_player_id: selectedTarget,
    });

    if (rpcErr) {
      setError(rpcErr.message);
    } else {
      setMyVote(selectedTarget);
    }
    setActionLoading(false);
  };

  const handleTallyAndKick = async () => {
    if (!room) return;
    setActionLoading(true);
    setError('');

    const { error: rpcErr } = await supabase.rpc('tally_votes_and_kick', {
      p_room_id: room.id,
    });

    if (rpcErr) setError(rpcErr.message);
    setActionLoading(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <p className="text-xs text-zinc-500 font-mono animate-pulse">Загрузка комнаты...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 gap-4">
        <p className="text-xs text-rose-400 font-medium">{error}</p>
        <button
          onClick={() => setError('')}
          className="bg-zinc-800 text-zinc-200 text-xs px-5 py-2.5 rounded-full border border-zinc-700"
        >
          Закрыть
        </button>
      </main>
    );
  }

  const isHost = room?.host_id === userId;
  const me = players.find((p) => p.user_id === userId);
  const activePlayers = players.filter((p) => !p.is_kicked);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 max-w-4xl mx-auto flex flex-col gap-6">
      
      {/* 1. Шапка комнаты */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-xl rounded-3xl p-4 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Комната</span>
            <span className="bg-emerald-950/80 text-emerald-400 text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border border-emerald-800/50">
              {room?.code}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Фаза: <span className="text-zinc-200 font-semibold">{room?.phase}</span>
          </p>
        </div>

        {isHost && room?.phase === 'LOBBY' && (
          <button
            onClick={handleStartGame}
            disabled={actionLoading}
            className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs px-6 py-2.5 rounded-full transition active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-950/40"
          >
            Начать игру ({players.length} игрок.)
          </button>
        )}
      </div>

      {/* 2. Условия Бункера и Катастрофа */}
      {room?.phase !== 'LOBBY' && (
        <div className="bg-zinc-900/60 border border-amber-900/30 backdrop-blur-xl rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <h2 className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Условия Убежища и Катастрофа
            </h2>
            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full font-medium">
              Общая информация
            </span>
          </div>

          <div className="bg-amber-950/20 border border-amber-900/40 rounded-2xl p-4">
            <p className="text-[10px] text-amber-500/80 uppercase font-bold tracking-wider mb-1">
              Причина катастрофы
            </p>
            <p className="text-sm font-bold text-amber-100 leading-snug">
              {room?.bunker_info?.catastrophe || 'Ядерный удар с последующей радиоактивной зимой. Поверхность заражена.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-3">
              <p className="text-[10px] text-zinc-400 uppercase font-medium">Вместимость / Площадь</p>
              <p className="text-xs font-semibold text-zinc-100 mt-0.5">
                {room?.bunker_info?.size || '150 кв. м (мест: 5)'}
              </p>
            </div>

            <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-3">
              <p className="text-[10px] text-zinc-400 uppercase font-medium">Запасы ресурсов</p>
              <p className="text-xs font-semibold text-zinc-100 mt-0.5">
                {room?.bunker_info?.food || 'Еда и фильтры на 1.5 года'}
              </p>
            </div>

            <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-3">
              <p className="text-[10px] text-zinc-400 uppercase font-medium">Время в изоляции</p>
              <p className="text-xs font-semibold text-zinc-100 mt-0.5">
                {room?.bunker_info?.duration || '12 месяцев'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Уведомление для изгнанного игрока */}
      {me?.is_kicked && (
        <div className="bg-rose-950/40 border border-rose-900/60 rounded-3xl p-4 text-center">
          <p className="text-xs text-rose-300 font-semibold uppercase tracking-wider">
            Вас изгнали из бункера
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">
            Вы больше не можете голосовать, но можете следить за ходом игры.
          </p>
        </div>
      )}

      {/* 4. Список игроков в Лобби */}
      {room?.phase === 'LOBBY' && (
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-3xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
            Игроки в комнате ({players.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {players.map((p) => (
              <div
                key={p.id}
                className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-3 flex items-center justify-between"
              >
                <span className="text-xs font-medium text-zinc-200">{p.name}</span>
                {p.user_id === room.host_id && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
                    Хост
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Блок голосования */}
      {room?.phase === 'VOTING' && !me?.is_kicked && (
        <div className="bg-zinc-900/60 border border-rose-900/40 backdrop-blur-xl rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
              Голосование за изгнание
            </h2>
            {myVote && (
              <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 px-2.5 py-0.5 rounded-full font-medium">
                Голос зафиксирован
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {activePlayers
              .filter((p) => p.user_id !== userId)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedTarget(p.id)}
                  className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-all flex items-center justify-between ${
                    selectedTarget === p.id
                      ? 'bg-rose-950/60 border-rose-500 text-rose-100 shadow-md shadow-rose-950/50'
                      : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-300 hover:bg-zinc-800/80'
                  }`}
                >
                  <span>{p.name}</span>
                  {selectedTarget === p.id && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  )}
                </button>
              ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
            <button
              onClick={handleCastVote}
              disabled={!selectedTarget || actionLoading}
              className="bg-rose-600 hover:bg-rose-500 text-zinc-950 font-bold text-xs px-6 py-2.5 rounded-full transition active:scale-95 disabled:opacity-40"
            >
              {myVote ? 'Изменить голос' : 'Отдать голос'}
            </button>

            {isHost && (
              <button
                onClick={handleTallyAndKick}
                disabled={actionLoading}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-semibold text-xs px-5 py-2.5 rounded-full transition active:scale-95 disabled:opacity-50"
              >
                Подвести итоги и изгнать
              </button>
            )}
          </div>
        </div>
      )}

      {/* 6. Личная карточка характеристик */}
      {room?.phase !== 'LOBBY' && myCard && (
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-xl rounded-3xl p-5 sm:p-6 space-y-4">
          <h2 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            Твоя карточка персонажа
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: 'profession', label: 'Профессия' },
              { key: 'health', label: 'Здоровье' },
              { key: 'hobby', label: 'Хобби' },
              { key: 'baggage', label: 'Багаж' },
              { key: 'fact', label: 'Факты' },
              { key: 'special_condition', label: 'Спец. условие' },
            ].map(({ key, label }) => {
              const item = myCard[key];
              return (
                <div
                  key={key}
                  className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-zinc-400 uppercase font-medium">{label}</p>
                    <p className="text-xs font-semibold text-zinc-100">
                      {item?.revealed ? item?.val : '••••••••••••'}
                    </p>
                  </div>

                  {!item?.revealed && (
                    <button
                      onClick={() => handleRevealField(key)}
                      className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[10px] font-semibold px-3 py-1.5 rounded-full transition active:scale-95"
                    >
                      Открыть
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </main>
  );
}
