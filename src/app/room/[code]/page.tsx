'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Briefcase,
  HeartPulse,
  Palette,
  Backpack,
  Scroll,
  Zap,
  HelpCircle,
  AlertTriangle,
  Skull,
  ShieldCheck,
  PartyPopper,
  Mic,
  X
} from 'lucide-react';

const CARD_CATEGORIES = [
  { key: 'profession', label: 'Профессия', icon: Briefcase, color: 'text-sky-400', border: 'border-sky-500/40', angle: -15, translateY: 8 },
  { key: 'health', label: 'Здоровье', icon: HeartPulse, color: 'text-rose-400', border: 'border-rose-500/40', angle: -9, translateY: 2 },
  { key: 'hobby', label: 'Хобби', icon: Palette, color: 'text-purple-400', border: 'border-purple-500/40', angle: -3, translateY: 0 },
  { key: 'baggage', label: 'Багаж', icon: Backpack, color: 'text-amber-400', border: 'border-amber-500/40', angle: 3, translateY: 0 },
  { key: 'fact', label: 'Факты', icon: Scroll, color: 'text-indigo-400', border: 'border-indigo-500/40', angle: 9, translateY: 2 },
  { key: 'special_condition', label: 'Спец. условие', icon: Zap, color: 'text-emerald-400', border: 'border-emerald-500/40', angle: 15, translateY: 8 },
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

  const [cardRevealOverlay, setCardRevealOverlay] = useState<{
    playerName: string;
    categoryKey: string;
    categoryLabel: string;
    val: string;
    color: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedPlayerIdRef = useRef<string | null>(null);
  selectedPlayerIdRef.current = selectedPlayerId;

  const channelRef = useRef<any>(null);
  const overlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const id = localStorage.getItem('ubezhishe_user_id');
    if (!id) {
      router.push('/');
      return;
    }
    setUserId(id);
  }, [router]);

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

  const showCardOverlay = (data: { playerName: string; categoryKey: string; categoryLabel: string; val: string; color: string }) => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    setCardRevealOverlay(data);
    overlayTimerRef.current = setTimeout(() => {
      setCardRevealOverlay(null);
    }, 5000);
  };

  useEffect(() => {
    if (!room?.id || !userId) return;

    const channel = supabase
      .channel(`realtime_room_${room.id}`, {
        config: { broadcast: { self: true } },
      })
      .on('broadcast', { event: 'card_revealed' }, (payload) => {
        if (payload?.payload) {
          showCardOverlay(payload.payload);
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        () => refreshRoomState(room.id)
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
          if (selectedPlayerIdRef.current) {
            fetchInspectedCards(selectedPlayerIdRef.current);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [room?.id, userId]);

  useEffect(() => {
    if (room?.id && userId && room?.phase !== 'LOBBY') {
      fetchMyCard(room.id, userId);
      fetchVotes(room.id, userId);
    }
  }, [room?.id, room?.phase, userId]);

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

  useEffect(() => {
    if (room?.current_speaker_id) {
      setSelectedPlayerId(room.current_speaker_id);
    }
  }, [room?.current_speaker_id]);

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
      if (!selectedPlayerIdRef.current && data.length > 0) {
        setSelectedPlayerId(data[0].id);
      }
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
    if (!room || !myCard) return;
    setActionLoading(true);
    setError('');

    const mePlayer = players.find((p) => p.user_id === userId);
    const cat = CARD_CATEGORIES.find((c) => c.key === fieldKey);
    const val = myCard[fieldKey]?.val || '';

    const { error: err } = await supabase.rpc('reveal_card_and_next_turn', {
      p_room_id: room.id,
      p_user_id: userId,
      p_field_key: fieldKey,
    });

    if (err) {
      setError(err.message);
    } else {
      if (channelRef.current && mePlayer && cat) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'card_revealed',
          payload: {
            playerName: mePlayer.name,
            categoryKey: cat.key,
            categoryLabel: cat.label,
            val,
            color: cat.color,
          },
        });
      }
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
  const kickedPlayers = players.filter((p) => p.is_kicked);
  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);
  const isMyTurn = room?.phase === 'SPEECH' && room?.current_speaker_id === me?.id;
  const survivorsGoal = Math.ceil((room?.total_initial_players || players.length) / 2);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const OverlayIcon = cardRevealOverlay
    ? CARD_CATEGORIES.find((c) => c.key === cardRevealOverlay.categoryKey)?.icon || Zap
    : Zap;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 pb-72 p-3 sm:p-6 max-w-5xl mx-auto flex flex-col gap-5 font-sans">
      
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
          <button onClick={() => setError('')} className="font-bold ml-3 text-rose-400 hover:text-rose-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Условия Бункера */}
      {room?.phase !== 'LOBBY' && (
        <div className="bg-zinc-900/40 border border-amber-900/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-500 text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4" />
            <span>Условия катастрофы</span>
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
        <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">Список игроков:</p>
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
                {isSpeaking && (
                  <span className="bg-amber-400 text-zinc-950 text-[9px] px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                    <Mic className="w-2.5 h-2.5" /> СПИКЕР
                  </span>
                )}
                {p.is_kicked && <span className="text-[9px] text-rose-400 font-extrabold">ИЗГНАН</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. РЯД КАРТ ВЫБРАННОГО ИГРОКА */}
      {selectedPlayer && inspectedCards && (
        <div className="bg-zinc-900/70 border border-zinc-800/80 backdrop-blur-xl rounded-3xl p-5 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                Игрок: <span className="text-emerald-400">{selectedPlayer.name}</span>
              </h2>
            </div>
            {room?.current_speaker_id === selectedPlayer.id && (
              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs px-3 py-1 rounded-full animate-pulse font-semibold flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" /> Выступает
              </span>
            )}
          </div>

          <div className="flex gap-3 overflow-x-auto py-2 scrollbar-thin scrollbar-thumb-zinc-800">
            {CARD_CATEGORIES.map((cat) => {
              const IconComponent = cat.icon;
              const val = inspectedCards[cat.key];
              const isRevealed = inspectedCards[`${cat.key}_revealed`];
              return (
                <div
                  key={cat.key}
                  className={`w-36 sm:w-44 h-56 bg-zinc-900 border-2 ${cat.border} rounded-2xl p-3 flex flex-col justify-between shrink-0 shadow-xl relative overflow-hidden`}
                >
                  <div className="flex items-center gap-1.5">
                    <IconComponent className={`w-4 h-4 shrink-0 ${cat.color}`} />
                    <span className={`text-[10px] font-black uppercase tracking-wider ${cat.color}`}>{cat.label}</span>
                  </div>

                  <div className="my-auto text-center px-1">
                    {isRevealed ? (
                      <p className="text-xs font-bold text-zinc-100 leading-snug">
                        {val}
                      </p>
                    ) : (
                      <HelpCircle className="w-8 h-8 text-zinc-700 mx-auto" />
                    )}
                  </div>

                  <div className="text-center">
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      isRevealed ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {isRevealed ? 'Открыта' : 'Закрыта'}
                    </span>
                  </div>
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
              Ваша очередь выступать! Выберите карту из своей колоды и нажмите «Раскрыть».
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
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Общее обсуждение</h3>
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
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Голосование за изгнание</h3>
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

      {/* 6. ЛИЧНАЯ КОЛОДА КАРТ */}
      {room?.phase !== 'LOBBY' && room?.phase !== 'ENDED' && myCard && (
        <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none pb-2 pt-10 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent">
          <div className="max-w-4xl mx-auto px-4 pointer-events-auto relative">
            
            <div className="flex items-center justify-center mb-2">
              {isMyTurn ? (
                <span className="bg-emerald-500 text-zinc-950 text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-lg shadow-emerald-500/30 animate-bounce flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-zinc-950" /> Ваш ход! Раскройте одну карту
                </span>
              ) : (
                <span className="bg-zinc-900/90 border border-zinc-800 text-zinc-400 text-[10px] font-bold uppercase px-3 py-1 rounded-full backdrop-blur-md">
                  Ваша колода
                </span>
              )}
            </div>

            <div className="flex justify-center items-end -space-x-8 sm:-space-x-12 min-h-[230px] pt-4 pb-2">
              {CARD_CATEGORIES.map((cat, index) => {
                const IconComponent = cat.icon;
                const item = myCard[cat.key];
                const isSelected = activeDeckCard === cat.key;
                const canShowRevealButton = isSelected && isMyTurn && !item?.revealed;

                return (
                  <div
                    key={cat.key}
                    onClick={() => setActiveDeckCard(isSelected ? null : cat.key)}
                    style={{
                      transform: isSelected
                        ? 'translateY(-48px) rotate(0deg) scale(1.12)'
                        : `translateY(${cat.translateY}px) rotate(${cat.angle}deg)`,
                      zIndex: isSelected ? 40 : index + 10,
                    }}
                    className={`group relative w-32 sm:w-36 h-48 sm:h-52 bg-zinc-900 border-2 ${cat.border} rounded-2xl p-3 flex flex-col justify-between shadow-2xl transition-all duration-300 ease-out cursor-pointer select-none ${
                      isSelected
                        ? 'ring-4 ring-emerald-500/80 shadow-emerald-900/50'
                        : 'hover:-translate-y-12 hover:rotate-0 hover:z-30 hover:scale-105'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <IconComponent className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${cat.color}`} />
                      <span className={`text-[9px] font-black uppercase tracking-wider ${cat.color}`}>{cat.label}</span>
                    </div>

                    <div className="my-auto text-center px-1 z-10">
                      <p className="text-xs font-bold text-zinc-100 leading-tight">
                        {item?.val}
                      </p>
                    </div>

                    <div className="z-10 mt-1">
                      {item?.revealed ? (
                        <div className="w-full bg-zinc-800/80 text-zinc-400 text-[9px] font-bold py-1 rounded-lg text-center border border-zinc-700/50 uppercase">
                          Открыта
                        </div>
                      ) : canShowRevealButton ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRevealCard(cat.key);
                          }}
                          disabled={actionLoading}
                          className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[10px] font-black py-1.5 rounded-lg transition shadow-md active:scale-95"
                        >
                          Раскрыть
                        </button>
                      ) : null}
                    </div>

                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}

      {/* 7. ОВЕРЛЕЙ РАСКРЫТОЙ КАРТЫ (5 СЕКУНД) */}
      {cardRevealOverlay && (
        <div className="fixed inset-0 bg-zinc-950/85 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border-2 border-emerald-500/50 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-[0_0_50px_rgba(16,185,129,0.2)] text-center relative overflow-hidden space-y-4">
            
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950 px-3 py-1 rounded-full border border-emerald-800">
                Карта раскрыта!
              </span>
              <h3 className="text-lg font-black text-zinc-100 pt-2">
                {cardRevealOverlay.playerName}
              </h3>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-inner space-y-2 flex flex-col items-center">
              <OverlayIcon className={`w-10 h-10 ${cardRevealOverlay.color}`} />
              <p className={`text-xs font-extrabold uppercase tracking-wider ${cardRevealOverlay.color}`}>
                {cardRevealOverlay.categoryLabel}
              </p>
              <p className="text-base sm:text-lg font-black text-zinc-100 leading-snug">
                {cardRevealOverlay.val}
              </p>
            </div>

            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full w-full transition-all duration-[5000ms] ease-linear w-0" />
            </div>

          </div>
        </div>
      )}

      {/* 8. ОКНО РЕЗУЛЬТАТОВ ИГРЫ */}
      {room?.phase === 'ENDED' && (
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-2xl z-[100] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 text-center shadow-2xl">
            <div>
              {me?.is_kicked ? (
                <div className="space-y-2 flex flex-col items-center">
                  <Skull className="w-12 h-12 text-rose-500" />
                  <h2 className="text-2xl font-black text-rose-500 uppercase tracking-wide">
                    Вы не выжили
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Вас не пустили в бункер. Вы остались снаружи.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 flex flex-col items-center">
                  <PartyPopper className="w-12 h-12 text-emerald-400" />
                  <h2 className="text-2xl font-black text-emerald-400 uppercase tracking-wide">
                    Вы выжили!
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Поздравляем! Вы вошли в число тех, кто попал в бункер.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-2xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Выжили ({activePlayers.length})
                </h3>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {activePlayers.map((p) => (
                    <li key={p.id} className="text-xs text-zinc-200 font-medium flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {p.name} {p.user_id === userId && <span className="text-[10px] text-emerald-400 font-bold">(Вы)</span>}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-rose-950/30 border border-rose-900/50 rounded-2xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Skull className="w-4 h-4" /> Погибли ({kickedPlayers.length})
                </h3>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {kickedPlayers.length === 0 ? (
                    <li className="text-xs text-zinc-500 italic">Никто не погиб</li>
                  ) : (
                    kickedPlayers.map((p) => (
                      <li key={p.id} className="text-xs text-zinc-400 font-medium flex items-center gap-2 line-through">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        {p.name} {p.user_id === userId && <span className="text-[10px] text-rose-400 font-bold">(Вы)</span>}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <button
              onClick={() => router.push('/')}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs py-3 rounded-2xl border border-zinc-700 transition active:scale-95 shadow-lg"
            >
              Вернуться на главную
            </button>
          </div>
        </div>
      )}

    </main>
  );
}
