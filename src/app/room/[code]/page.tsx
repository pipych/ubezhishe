'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const CARD_CATEGORIES = [
  { key: 'profession', label: 'Профессия', icon: '💼', border: 'border-sky-500/50', bg: 'from-sky-950/80 to-zinc-900', text: 'text-sky-300' },
  { key: 'health', label: 'Здоровье', icon: '🫀', border: 'border-emerald-500/50', bg: 'from-emerald-950/80 to-zinc-900', text: 'text-emerald-300' },
  { key: 'hobby', label: 'Хобби', icon: '🎨', border: 'border-purple-500/50', bg: 'from-purple-950/80 to-zinc-900', text: 'text-purple-300' },
  { key: 'baggage', label: 'Багаж', icon: '🎒', border: 'border-amber-500/50', bg: 'from-amber-950/80 to-zinc-900', text: 'text-amber-300' },
  { key: 'fact', label: 'Факты', icon: '📜', border: 'border-indigo-500/50', bg: 'from-indigo-950/80 to-zinc-900', text: 'text-indigo-300' },
  { key: 'special_condition', label: 'Спец. условие', icon: '⚡', border: 'border-rose-500/50', bg: 'from-rose-950/80 to-zinc-900', text: 'text-rose-300' },
];

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.code as string)?.toUpperCase();

  const [userId, setUserId] = useState<string>('');
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [myCard, setMyCard] = useState<any>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [inspectedCards, setInspectedCards] = useState<any>(null);

  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [activeDeckCard, setActiveDeckCard] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Авторизация
  useEffect(() => {
    const id = localStorage.getItem('ubezhishe_user_id');
    if (!id) {
      router.push('/');
      return;
    }
    setUserId(id);
  }, [router]);

  // 2. Первоначальная загрузка комнаты
  useEffect(() => {
    if (!roomCode || !userId) return;

    const fetchInitialRoom = async () => {
      try {
        const { data: roomData, error: roomErr } = await supabase
          .from('rooms')
          .select('*')
          .eq('code', roomCode)
          .single();

        if (roomErr || !roomData) throw new Error('Комната не найдена');
        setRoom(roomData);

        await fetchPlayers(roomData.id);
      } catch (err: any) {
        setError(err.message || 'Ошибка загрузки комнаты');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialRoom();
  }, [roomCode, userId]);

  // 3. Подписка Realtime
  useEffect(() => {
    if (!room?.id || !userId) return;

    const channel = supabase
      .channel(`room_channel_${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (payload) => setRoom(payload.new)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
        () => fetchPlayers(room.id)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_cards' },
        () => {
          fetchMyCard(room.id, userId);
          if (selectedPlayerId) fetchInspectedCards(selectedPlayerId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, userId, selectedPlayerId]);

  // 4. Загрузка карт при изменении фазы игры
  useEffect(() => {
    if (room?.id && userId && room?.phase !== 'LOBBY') {
      fetchMyCard(room.id, userId);
      fetchVotes(room.id, userId);
    }
  }, [room?.id, room?.phase, userId]);

  // 5. Синхронизация таймера
  useEffect(() => {
    if (!room?.phase_expires_at) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(room.phase_expires_at).getTime() - Date.now()) / 1000));
      setTimeLeft(diff);

      if (diff === 0 && room.host_id === userId && room.phase !== 'LOBBY' && room.phase !== 'ENDED') {
        supabase.rpc('handle_phase_timeout', { p_room_id: room.id }).then(() => refreshRoomState(room.id));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [room?.phase_expires_at, room?.host_id, room?.phase, room?.id, userId]);

  // 6. Автофокус на спикера
  useEffect(() => {
    if (room?.current_speaker_id) {
      setSelectedPlayerId(room.current_speaker_id);
    }
  }, [room?.current_speaker_id]);

  // 7. Просмотр карт выбранного игрока
  useEffect(() => {
    if (selectedPlayerId) {
      fetchInspectedCards(selectedPlayerId);
    }
  }, [selectedPlayerId]);

  const refreshRoomState = async (roomId: string) => {
    const { data: freshRoom } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (freshRoom) setRoom(freshRoom);
  };

  const fetchPlayers = async (roomId: string) => {
    const { data } = await supabase.from('players').select('*').eq('room_id', roomId);
    if (data) {
      setPlayers(data);
      if (!selectedPlayerId && data.length > 0) setSelectedPlayerId(data[0].id);
    }
  };

  const fetchMyCard = async (roomId: string, currentUserId: string) => {
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', currentUserId)
      .maybeSingle();

    if (!player) return;

    const { data: card } = await supabase
      .from('player_cards')
      .select('*')
      .eq('player_id', player.id)
      .maybeSingle();

    if (card) setMyCard(card);
  };

  const fetchVotes = async (roomId: string, currentUserId: string) => {
    const { data: myPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', currentUserId)
      .maybeSingle();

    if (!myPlayer) return;

    const { data: vote } = await supabase
      .from('votes')
      .select('target_id')
      .eq('room_id', roomId)
      .eq('voter_id', myPlayer.id)
      .maybeSingle();

    if (vote) setMyVote(vote.target_id);
  };

  const fetchInspectedCards = async (playerId: string) => {
    const { data } = await supabase
      .from('public_player_cards')
      .select('*')
      .eq('player_id', playerId)
      .maybeSingle();

    if (data) setInspectedCards(data);
  };

  const handleStartGame = async () => {
    if (!room) return;
    setActionLoading(true);
    setError('');

    const { error: rpcErr } = await supabase.rpc('start_game', { p_room_id: room.id });
    if (rpcErr) {
      setError(`Ошибка запуска: ${rpcErr.message}`);
    } else {
      await refreshRoomState(room.id);
      await fetchMyCard(room.id, userId);
    }
    setActionLoading(false);
  };

  const handleRevealCard = async (fieldKey: string) => {
    if (!room) return;
    setActionLoading(true);
    setError('');

    const { error: err } = await supabase.rpc('reveal_card_and_next_turn', {
      p_room_id: room.id,
      p_user_id: userId,
      p_field_key: fieldKey,
    });

    if (err) {
      setError(err.message);
    } else {
      await refreshRoomState(room.id);
      await fetchMyCard(room.id, userId);
    }
    setActionLoading(false);
  };

  const handleSkipDiscussion = async () => {
    if (!room) return;
    setActionLoading(true);
    const { error: err } = await supabase.rpc('skip_discussion', { p_room_id: room.id, p_user_id: userId });
    if (err) {
      setError(err.message);
    } else {
      await refreshRoomState(room.id);
    }
    setActionLoading(false);
  };

  const handleCastVote = async () => {
    if (!selectedTarget || !room) return;
    setActionLoading(true);
    const { error: err } = await supabase.rpc('cast_vote', {
      p_room_id: room.id,
      p_voter_user_id: userId,
      p_target_player_id: selectedTarget,
    });
    if (err) {
      setError(err.message);
    } else {
      setMyVote(selectedTarget);
      await refreshRoomState(room.id);
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <p className="text-xs text-zinc-500 font-mono animate-pulse">Загрузка игры...</p>
      </main>
    );
  }

  const isHost = room?.host_id === userId;
  const me = players.find((p) => p.user_id === userId);
  const activePlayers = players.filter((p) => !p.is_kicked);
  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);
  const isMyTurn = room?.phase === 'SPEECH' && room?.current_speaker_id === me?.id;
  const survivorsGoal = Math.ceil((room?.total_initial_players || players.length) / 2);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 pb-56 p-3 sm:p-6 max-w-5xl mx-auto flex flex-col gap-5 font-sans">
      
      {/* 1. Верхний баннер */}
      <div className="bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-xl rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="bg-emerald-950 text-emerald-400 font-mono text-xs font-bold px-3 py-1 rounded-full border border-emerald-800/50">
            {room?.code}
          </span>
          <div>
            <h1 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Раунд {room?.round_number || 1} • <span className="text-emerald-400">{room?.phase}</span>
            </h1>
            <p className="text-[11px] text-zinc-400">
              Мест в бункере: {survivorsGoal} из {room?.total_initial_players || players.length}
            </p>
          </div>
        </div>

        {room?.phase !== 'LOBBY' && room?.phase !== 'ENDED' && (
          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 px-4 py-1.5 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-mono text-sm font-bold text-emerald-400">{formatTimer(timeLeft)}</span>
          </div>
        )}

        {isHost && room?.phase === 'LOBBY' && (
          <button
            onClick={handleStartGame}
            disabled={actionLoading}
            className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs px-6 py-2.5 rounded-full transition shadow-lg shadow-emerald-950/40 active:scale-95 disabled:opacity-50"
          >
            {actionLoading ? 'Запуск...' : `Запустить игру (${players.length} чел.)`}
          </button>
        )}
      </div>

      {/* Ошибки */}
      {error && (
        <div className="bg-rose-950/80 border border-rose-800 text-rose-200 text-xs p-3.5 rounded-2xl flex justify-between items-center shadow-lg">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold ml-3 text-rose-400 hover:text-rose-100">✕</button>
        </div>
      )}

      {/* 2. Условия Бункера */}
      {room?.phase !== 'LOBBY' && (
        <div className="bg-zinc-900/40 border border-amber-900/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-500 text-xs font-bold uppercase tracking-wider">
            <span>⚠️</span> Условия катастрофы
          </div>
          <p className="text-xs text-amber-100/90 font-medium">{room?.bunker_info?.catastrophe}</p>
          <div className="flex flex-wrap gap-4 text-[11px] text-zinc-400 pt-1">
            <span>🏢 {room?.bunker_info?.size}</span>
            <span>🥫 {room?.bunker_info?.food}</span>
            <span>⏳ {room?.bunker_info?.duration}</span>
          </div>
        </div>
      )}

      {/* 3. НАВИГАЦИОННЫЙ БАР ИГРОКОВ */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">Список игроков (нажмите для просмотра):</p>
        <div className="flex items-center gap-2.5 overflow-x-auto py-2 px-1 scrollbar-thin scrollbar-thumb-zinc-800">
          {players.map((p) => {
            const isSpeaking = room?.current_speaker_id === p.id;
            const isSelected = selectedPlayerId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlayerId(p.id)}
                className={`min-w-max px-4 py-2.5 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-emerald-500 text-zinc-950 border-emerald-300 shadow-lg shadow-emerald-950/50 scale-105'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                } ${p.is_kicked ? 'opacity-40 line-through bg-rose-950/30 border-rose-900/40 text-rose-300' : ''}`}
              >
                <span>{p.name}</span>
                {isSpeaking && <span className="bg-amber-400 text-zinc-950 text-[9px] px-2 py-0.5 rounded-full font-black">СПИКЕР</span>}
                {p.is_kicked && <span className="text-[9px] text-rose-400 font-extrabold">ИЗГНАН</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. СЦЕНА: Карты выбранного игрока */}
      {selectedPlayer && inspectedCards && (
        <div className="bg-zinc-900/70 border border-zinc-800/80 backdrop-blur-xl rounded-3xl p-5 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                Игрок: <span className="text-emerald-400">{selectedPlayer.name}</span>
              </h2>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                {selectedPlayer.is_kicked ? 'Игрок изгнан — все его карты открыты' : 'Показываются только открытые характеристики'}
              </p>
            </div>
            {room?.current_speaker_id === selectedPlayer.id && (
              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs px-3 py-1 rounded-full animate-pulse font-semibold">
                Выступает (2 мин)
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CARD_CATEGORIES.map((cat) => {
              const val = inspectedCards[cat.key];
              const isRevealed = inspectedCards[`${cat.key}_revealed`];
              return (
                <div
                  key={cat.key}
                  className={`bg-gradient-to-br ${cat.bg} border ${cat.border} rounded-2xl p-3.5 flex flex-col justify-between min-h-[90px] shadow-md`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{cat.icon}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${cat.text}`}>{cat.label}</span>
                  </div>
                  <p className="text-xs font-semibold text-zinc-100 leading-tight mt-2">
                    {isRevealed ? val : '••••••••••••'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Управление фазами */}
      {room?.phase === 'SPEECH' && (
        <div className="bg-zinc-900/50 border border-emerald-900/40 rounded-2xl p-4 text-center">
          {isMyTurn ? (
            <p className="text-xs text-emerald-400 font-bold animate-pulse uppercase tracking-wider">
              🗣️ Ваша очередь выступать! Нажмите «Раскрыть» на одной из своих карт внизу.
            </p>
          ) : (
            <p className="text-xs text-zinc-400">
              Сейчас очередь игрока <span className="text-zinc-200 font-bold">{players.find((p) => p.id === room.current_speaker_id)?.name}</span>.
            </p>
          )}
        </div>
      )}

      {room?.phase === 'DISCUSSION' && (
        <div className="bg-zinc-900/60 border border-amber-900/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Общее обсуждение (5 min)</h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Проголосовали за пропуск: {room?.skip_votes?.length || 0} из {activePlayers.length}
            </p>
          </div>
          <button
            onClick={handleSkipDiscussion}
            disabled={actionLoading}
            className="bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold text-xs px-5 py-2.5 rounded-full transition active:scale-95"
          >
            Пропустить обсуждение
          </button>
        </div>
      )}

      {room?.phase === 'VOTING' && !me?.is_kicked && (
        <div className="bg-zinc-900/80 border border-rose-900/50 rounded-2xl p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Голосование за изгнание (20 сек)</h3>
            <span className="font-mono text-xs text-rose-300 font-bold">{timeLeft}с</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {activePlayers
              .filter((p) => p.user_id !== userId)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedTarget(p.id)}
                  className={`p-3 rounded-xl border text-xs font-semibold text-left transition ${
                    selectedTarget === p.id
                      ? 'bg-rose-950 border-rose-500 text-rose-100 shadow-md'
                      : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
          </div>

          <button
            onClick={handleCastVote}
            disabled={!selectedTarget || actionLoading}
            className="w-full bg-rose-600 hover:bg-rose-500 text-zinc-950 font-bold text-xs py-2.5 rounded-full transition active:scale-95 disabled:opacity-40"
          >
            {myVote ? 'Голос зафиксирован (изменить)' : 'Подтвердить голос'}
          </button>
        </div>
      )}

      {/* 6. ЛИЧНАЯ КОЛОДА КАРТ (Фиксированный Низ) */}
      {room?.phase !== 'LOBBY' && myCard && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 border-t border-zinc-800 backdrop-blur-2xl p-3 z-50">
          <div className="max-w-5xl mx-auto space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Твоя колода карт</span>
              {isMyTurn && <span className="text-[10px] bg-emerald-500 text-zinc-950 font-bold px-2.5 py-0.5 rounded-full animate-bounce">ТВОЙ ХОД!</span>}
            </div>

            <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 px-1 scrollbar-thin scrollbar-thumb-zinc-800">
              {CARD_CATEGORIES.map((cat) => {
                const item = myCard[cat.key];
                const isSelected = activeDeckCard === cat.key;
                return (
                  <div
                    key={cat.key}
                    onClick={() => setActiveDeckCard(isSelected ? null : cat.key)}
                    className={`w-36 sm:w-40 bg-gradient-to-br ${cat.bg} border ${cat.border} rounded-2xl p-3 flex flex-col justify-between shrink-0 transition-all duration-300 cursor-pointer shadow-xl ${
                      isSelected ? '-translate-y-3 scale-105 border-white shadow-2xl' : 'hover:-translate-y-1'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs">{cat.icon}</span>
                      <span className={`text-[9px] font-bold uppercase ${cat.text}`}>{cat.label}</span>
                    </div>

                    <p className="text-xs font-bold text-zinc-100 my-2 leading-tight">
                      {item?.val}
                    </p>

                    <div>
                      {item?.revealed ? (
                        <span className="text-[9px] bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 px-2 py-0.5 rounded-full block text-center">
                          Открыта
                        </span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRevealCard(cat.key);
                          }}
                          disabled={!isMyTurn || actionLoading}
                          className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[10px] font-extrabold py-1.5 rounded-full transition active:scale-95 disabled:opacity-30 disabled:hover:bg-emerald-500"
                        >
                          Раскрыть
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
