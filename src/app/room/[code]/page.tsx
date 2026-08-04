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
  HelpCircle,
  AlertTriangle,
  Skull,
  ShieldCheck,
  PartyPopper,
  Mic,
  X,
  ChevronUp,
  ChevronDown,
  SkipForward,
  Shield,
  LayoutGrid,
  Building,
  Utensils,
  Clock,
  Vote,
  Pencil,
  Check,
  Target,
  DoorOpen,
  DoorClosed,
  Home,
  Dna,
  Copy
} from 'lucide-react';

const CARD_CATEGORIES = [
  { key: 'biology', label: 'Биология', icon: Dna, color: 'text-emerald-400', border: 'border-emerald-500/40', angle: -25, translateY: 12 },
  { key: 'profession', label: 'Профессия', icon: Briefcase, color: 'text-sky-400', border: 'border-sky-500/40', angle: -15, translateY: 6 },
  { key: 'health', label: 'Здоровье', icon: HeartPulse, color: 'text-rose-400', border: 'border-rose-500/40', angle: -5, translateY: 0 },
  { key: 'hobby', label: 'Хобби', icon: Palette, color: 'text-purple-400', border: 'border-purple-500/40', angle: 5, translateY: 0 },
  { key: 'baggage', label: 'Багаж', icon: Backpack, color: 'text-amber-400', border: 'border-amber-500/40', angle: 15, translateY: 6 },
  { key: 'fact', label: 'Факты', icon: Scroll, color: 'text-indigo-400', border: 'border-indigo-500/40', angle: 25, translateY: 12 },
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

  const [activeTab, setActiveTab] = useState<'table' | 'bunker'>('table');
  const [isDeckCollapsed, setIsDeckCollapsed] = useState<boolean>(false);

  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [editingName, setEditingName] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Оверлеи
  const [cardRevealOverlay, setCardRevealOverlay] = useState<any>(null);
  const [voteResultsOverlay, setVoteResultsOverlay] = useState<any>(null);
  const [roomRevealOverlay, setRoomRevealOverlay] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedPlayerIdRef = useRef<string | null>(null);
  selectedPlayerIdRef.current = selectedPlayerId;

  const prevPhaseRef = useRef<string | null>(null);
  const prevRoomsCountRef = useRef<number>(0);

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
        prevPhaseRef.current = roomData.phase;
        prevRoomsCountRef.current = roomData.bunker_info?.revealed_rooms?.length || 0;

        await fetchPlayers(roomData.id);
      } catch (err: any) {
        setError(err.message || 'Ошибка загрузки комнаты');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialRoom();
  }, [roomCode, userId]);

  const showCardOverlay = (data: any) => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    setCardRevealOverlay(data);
    overlayTimerRef.current = setTimeout(() => setCardRevealOverlay(null), 5000);
  };

  const showRoomOverlay = (roomObj: any) => {
    setRoomRevealOverlay(roomObj);
    setTimeout(() => setRoomRevealOverlay(null), 5000);
  };

  const showVoteResults = (roomData: any) => {
    const summary = roomData?.bunker_info?.last_voting_results;
    if (summary && Array.isArray(summary) && summary.length > 0) {
      setVoteResultsOverlay(summary);
      setTimeout(() => setVoteResultsOverlay(null), 5000);
    }
  };

  useEffect(() => {
    if (!room?.id || !userId) return;

    const channel = supabase
      .channel(`realtime_room_${room.id}`, { config: { broadcast: { self: true } } })
      .on('broadcast', { event: 'card_revealed' }, (payload) => {
        if (payload?.payload) showCardOverlay(payload.payload);
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (payload: any) => {
          const newRoom = payload.new;
          if (prevPhaseRef.current === 'VOTING' && newRoom.phase !== 'VOTING') {
            showVoteResults(newRoom);
          }

          const newRoomsArr = newRoom.bunker_info?.revealed_rooms || [];
          
          if (
            (prevPhaseRef.current === 'START_OVERLAY' && newRoom.phase === 'SPEECH' && newRoomsArr.length > 0) ||
            (newRoomsArr.length > prevRoomsCountRef.current && newRoomsArr.length > 0)
          ) {
            showRoomOverlay(newRoomsArr[newRoomsArr.length - 1]);
          }

          prevRoomsCountRef.current = newRoomsArr.length;
          prevPhaseRef.current = newRoom.phase;

          setRoom(newRoom);
        }
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
          if (selectedPlayerIdRef.current) fetchInspectedCards(selectedPlayerIdRef.current);
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
    if (!room?.phase_expires_at || room?.phase === 'START_OVERLAY') return;
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
    if (freshRoom) {
      if (prevPhaseRef.current === 'VOTING' && freshRoom.phase !== 'VOTING') {
        showVoteResults(freshRoom);
      }
      prevPhaseRef.current = freshRoom.phase;
      setRoom(freshRoom);
    }
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
    }
    setActionLoading(false);
  };

  const handleReadyStart = async () => {
    if (!room) return;
    setActionLoading(true);
    const { error: err } = await supabase.rpc('player_ready_start', { p_room_id: room.id, p_user_id: userId });
    if (err) setError(err.message);
    else await refreshRoomState(room.id);
    setActionLoading(false);
  };

  const handleUpdateName = async () => {
    const mePlayer = players.find((p) => p.user_id === userId);
    if (!mePlayer || !editingName.trim() || !room) return;

    setActionLoading(true);
    setError('');

    const cleanName = editingName.trim();
    const { error: updateErr } = await supabase
      .from('players')
      .update({ name: cleanName })
      .eq('id', mePlayer.id);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      localStorage.setItem('ubezhishe_username', cleanName);
      setIsEditingName(false);
      await fetchPlayers(room.id);
    }
    setActionLoading(false);
  };

  const handleCopyInvite = () => {
    const url = `${window.location.origin}/join/${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    if (err) setError(err.message);
    else await refreshRoomState(room.id);
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
    if (err) setError(err.message);
    else {
      setMyVote(selectedTarget);
      await refreshRoomState(room.id);
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <p className="text-sm sm:text-base text-zinc-500 font-mono animate-pulse">Загрузка игры...</p>
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
  const hasSkippedDiscussion = room?.skip_votes?.includes(userId);

  const readyUserIds = room?.bunker_info?.ready_user_ids || [];
  const hasPressedReady = readyUserIds.includes(userId);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const OverlayIcon = cardRevealOverlay
    ? CARD_CATEGORIES.find((c) => c.key === cardRevealOverlay.categoryKey)?.icon || Briefcase
    : Briefcase;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 pb-96 p-4 sm:p-8 max-w-6xl mx-auto flex flex-col gap-6 font-sans">
      
      {/* Глобальные стили анимаций оверлеев и прогресс-баров */}
      <style jsx global>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
        @keyframes overlayIn {
          from { opacity: 0; transform: scale(0.94); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes backdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-overlay-in {
          animation: overlayIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-backdrop-in {
          animation: backdropIn 0.2s ease-out forwards;
        }
        .animate-shrink-5s {
          animation: shrink 5000ms linear forwards;
        }
      `}</style>

      {/* 1. Верхний баннер */}
      <div className="bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-xl rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span className="bg-emerald-950 text-emerald-400 font-mono text-xs sm:text-sm font-bold px-3.5 py-1.5 rounded-full border border-emerald-800/50">
              {room?.code}
            </span>
            <button
              onClick={handleCopyInvite}
              className="p-2 sm:px-3 sm:py-1.5 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl text-zinc-400 hover:text-emerald-400 transition flex items-center gap-2 text-xs sm:text-sm font-medium"
              title="Скопировать ссылку-приглашение"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-emerald-400 font-bold hidden sm:inline">Скопировано!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="text-xs text-zinc-400 hidden sm:inline">Ссылка</span>
                </>
              )}
            </button>
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-zinc-300 uppercase tracking-wider">
              Раунд {room?.round_number || 1} • <span className="text-emerald-400">{room?.phase}</span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              Мест в бункере: {survivorsGoal} из {room?.total_initial_players || players.length}
            </p>
          </div>
        </div>

        {room?.phase !== 'LOBBY' && room?.phase !== 'START_OVERLAY' && room?.phase !== 'ENDED' && (
          <div className="flex items-center gap-2.5 bg-zinc-950 border border-zinc-800 px-5 py-2 rounded-full">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-mono text-base sm:text-lg font-bold text-emerald-400">{formatTimer(timeLeft)}</span>
          </div>
        )}

        {isHost && room?.phase === 'LOBBY' && (
          <button
            onClick={handleStartGame}
            disabled={actionLoading}
            className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs sm:text-sm px-7 py-3 rounded-full transition shadow-lg shadow-emerald-950/40 active:scale-95 disabled:opacity-50"
          >
            {actionLoading ? 'Запуск...' : `Запустить игру (${players.length} чел.)`}
          </button>
        )}
      </div>

      {/* Ошибки */}
      {error && (
        <div className="bg-rose-950/80 border border-rose-800 text-rose-200 text-xs sm:text-sm p-4 rounded-2xl flex justify-between items-center shadow-lg">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold ml-4 text-rose-400 hover:text-rose-100">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Панель смены ника в Лобби */}
      {room?.phase === 'LOBBY' && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-5 sm:p-6 flex items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xs sm:text-sm font-bold text-zinc-400 whitespace-nowrap">Ваш ник:</span>
            {isEditingName ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  maxLength={20}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 w-full sm:w-56"
                />
                <button
                  onClick={handleUpdateName}
                  disabled={actionLoading || !editingName.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 p-2 rounded-xl transition shrink-0"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setEditingName(me?.name || '');
                    setIsEditingName(false);
                  }}
                  className="text-zinc-500 hover:text-zinc-300 p-2 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="text-xs sm:text-sm font-bold text-emerald-400">{me?.name}</span>
                <button
                  onClick={() => {
                    setEditingName(me?.name || '');
                    setIsEditingName(true);
                  }}
                  className="text-zinc-500 hover:text-zinc-300 transition"
                  title="Изменить ник"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 italic hidden sm:block">Ожидание начала игры...</p>
        </div>
      )}

      {/* 2. ВКЛАДКА "БУНКЕР" */}
      {activeTab === 'bunker' && (
        <div className="bg-zinc-900/90 border border-amber-900/40 rounded-3xl p-6 sm:p-8 space-y-7 shadow-2xl backdrop-blur-xl animate-fadeIn">
          <div className="flex items-center gap-3 text-amber-500 border-b border-zinc-800 pb-4">
            <Shield className="w-7 h-7 sm:w-8 sm:h-8" />
            <div>
              <h2 className="text-base sm:text-lg font-bold uppercase tracking-wider text-amber-400">Информация о Бункере</h2>
              <p className="text-xs sm:text-sm text-zinc-400">Все параметры выживания и характеристики убежища</p>
            </div>
          </div>

          {/* Катастрофа */}
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Катастрофа
            </h3>
            <div className="bg-zinc-950/60 p-5 rounded-2xl border border-zinc-800/80 space-y-2">
              <p className="text-base sm:text-lg font-black text-amber-400">{room?.bunker_info?.catastrophe}</p>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-medium">{room?.bunker_info?.catastrophe_desc}</p>
            </div>
          </div>

          {/* Цель игры */}
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-400" /> Цель игры
            </h3>
            <div className="bg-zinc-950/60 p-5 rounded-2xl border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm sm:text-base font-black text-emerald-400">{room?.bunker_info?.goal_title}</p>
                <span className={`text-xs font-black px-3 py-1 rounded-full flex items-center gap-1.5 ${
                  room?.bunker_info?.can_exit 
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                }`}>
                  {room?.bunker_info?.can_exit ? <DoorOpen className="w-4 h-4" /> : <DoorClosed className="w-4 h-4" />}
                  {room?.bunker_info?.can_exit ? 'Можно выходить' : 'Выход запрещен'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-medium">{room?.bunker_info?.goal_desc}</p>
            </div>
          </div>

          {/* Параметры Бункера */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-zinc-950/60 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4">
              <Building className="w-6 h-6 text-sky-400 shrink-0" />
              <div>
                <p className="text-xs text-zinc-500 font-bold uppercase">Площадь</p>
                <p className="text-sm sm:text-base font-semibold text-zinc-200">{room?.bunker_info?.size || '—'}</p>
              </div>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4">
              <Utensils className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <p className="text-xs text-zinc-500 font-bold uppercase">Запасы Еды</p>
                <p className="text-sm sm:text-base font-semibold text-zinc-200">{room?.bunker_info?.food || '—'}</p>
              </div>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4">
              <Clock className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs text-zinc-500 font-bold uppercase">Время нахождения</p>
                <p className="text-sm sm:text-base font-semibold text-zinc-200">{room?.bunker_info?.duration || '—'}</p>
              </div>
            </div>
          </div>

          {/* КАРТОЧКИ РАСКРЫТЫХ ПОМЕЩЕНИЙ БУНКЕРА */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs sm:text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Home className="w-5 h-5 text-sky-400" /> Помещения бункера ({room?.bunker_info?.revealed_rooms?.length || 0})
            </h3>
            
            <div className="flex gap-4 overflow-x-auto py-3 scrollbar-thin scrollbar-thumb-zinc-800">
              {room?.bunker_info?.revealed_rooms?.map((rm: any, idx: number) => (
                <div
                  key={idx}
                  className="w-44 sm:w-56 h-64 sm:h-72 bg-zinc-900 border-2 border-sky-500/40 rounded-3xl p-4 flex flex-col justify-between shrink-0 shadow-xl relative overflow-hidden"
                >
                  <div className="flex items-center gap-2">
                    <Home className="w-5 h-5 text-sky-400 shrink-0" />
                    <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-sky-400">
                      Комната #{idx + 1}
                    </span>
                  </div>

                  <div className="my-auto text-center px-1 space-y-2">
                    <p className="text-sm sm:text-base font-bold text-zinc-100 leading-snug">
                      {rm.title}
                    </p>
                    <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed line-clamp-4">
                      {rm.description}
                    </p>
                  </div>

                  <div className="text-center">
                    <span className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-sky-950 text-sky-400 border border-sky-800/50">
                      Раскрыта
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. ВКЛАДКА "СТОЛ" */}
      {activeTab === 'table' && (
        <>
          {/* Список игроков */}
          <div className="space-y-2.5">
            <p className="text-xs uppercase font-bold text-zinc-500 tracking-wider px-1">Список игроков:</p>
            <div className="flex items-center gap-3 overflow-x-auto py-2 px-1 scrollbar-thin scrollbar-thumb-zinc-800">
              {players.map((p) => {
                const isSpeaking = room?.current_speaker_id === p.id;
                const isSelected = selectedPlayerId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayerId(p.id)}
                    className={`min-w-max px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold border transition-all flex items-center gap-2.5 whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-emerald-500 text-zinc-950 border-emerald-300 shadow-lg shadow-emerald-950/50 scale-105'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    } ${p.is_kicked ? 'opacity-40 line-through bg-rose-950/30 border-rose-900/40 text-rose-300' : ''}`}
                  >
                    <span>{p.name}</span>
                    {isSpeaking && (
                      <span className="bg-amber-400 text-zinc-950 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-black flex items-center gap-1">
                        <Mic className="w-3 h-3" /> СПИКЕР
                      </span>
                    )}
                    {p.is_kicked && <span className="text-[10px] sm:text-xs text-rose-400 font-extrabold">ИЗГНАН</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Карты выбранного игрока */}
          {selectedPlayer && inspectedCards && (
            <div className="bg-zinc-900/70 border border-zinc-800/80 backdrop-blur-xl rounded-3xl p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                    Игрок: <span className="text-emerald-400">{selectedPlayer.name}</span>
                  </h2>
                </div>
                {room?.current_speaker_id === selectedPlayer.id && (
                  <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs sm:text-sm px-4 py-1.5 rounded-full animate-pulse font-semibold flex items-center gap-2">
                    <Mic className="w-4 h-4" /> Выступает
                  </span>
                )}
              </div>

              <div className="flex gap-4 overflow-x-auto py-3 scrollbar-thin scrollbar-thumb-zinc-800">
                {CARD_CATEGORIES.map((cat) => {
                  const IconComponent = cat.icon;
                  const val = inspectedCards[cat.key];
                  const isRevealed = inspectedCards[`${cat.key}_revealed`];
                  return (
                    <div
                      key={cat.key}
                      className={`w-40 sm:w-52 h-64 sm:h-72 bg-zinc-900 border-2 ${cat.border} rounded-3xl p-4 flex flex-col justify-between shrink-0 shadow-xl relative overflow-hidden`}
                    >
                      <div className="flex items-center gap-2">
                        <IconComponent className={`w-5 h-5 shrink-0 ${cat.color}`} />
                        <span className={`text-xs sm:text-sm font-black uppercase tracking-wider ${cat.color}`}>{cat.label}</span>
                      </div>

                      <div className="my-auto text-center px-1">
                        {isRevealed ? (
                          <p className="text-xs sm:text-sm font-bold text-zinc-100 leading-relaxed">
                            {val}
                          </p>
                        ) : (
                          <HelpCircle className="w-10 h-10 text-zinc-700 mx-auto" />
                        )}
                      </div>

                      <div className="text-center">
                        <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
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

          {/* Управление фазой Речи */}
          {room?.phase === 'SPEECH' && (
            <div className="bg-zinc-900/50 border border-emerald-900/40 rounded-3xl p-5 text-center">
              {isMyTurn ? (
                <p className="text-xs sm:text-sm text-emerald-400 font-bold animate-pulse uppercase tracking-wider">
                  Ваша очередь выступать! Выберите карту из своей колоды и нажмите «Раскрыть».
                </p>
              ) : (
                <p className="text-xs sm:text-sm text-zinc-400">
                  Сейчас очередь игрока <span className="text-zinc-200 font-bold">{players.find((p) => p.id === room.current_speaker_id)?.name}</span>.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* 4. СТАРТОВЫЙ ОВЕРЛЕЙ КАТАСТРОФЫ И ЦЕЛИ (НА ВЕСЬ ЭКРАН) */}
      {room?.phase === 'START_OVERLAY' && (
        <div className="fixed inset-0 bg-zinc-950/95 backdrop-blur-2xl z-[130] flex items-center justify-center p-4 sm:p-6 animate-backdrop-in">
          <div className="bg-zinc-900 border-2 border-amber-500/50 rounded-3xl p-6 sm:p-10 max-w-2xl w-full shadow-2xl space-y-6 text-left overflow-y-auto max-h-[90vh] animate-overlay-in">
            
            <div className="text-center space-y-1.5">
              <span className="text-xs font-black uppercase tracking-widest text-amber-400 bg-amber-950 px-4 py-1.5 rounded-full border border-amber-800">
                Начало игры • Ознакомление
              </span>
              <h2 className="text-2xl font-black text-zinc-100 pt-2">Условия выживания</h2>
            </div>

            {/* Катастрофа */}
            <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-2xl space-y-2">
              <span className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Катастрофа
              </span>
              <h3 className="text-base sm:text-lg font-extrabold text-amber-400">{room?.bunker_info?.catastrophe}</h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">{room?.bunker_info?.catastrophe_desc}</p>
            </div>

            {/* Цель */}
            <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="w-4 h-4" /> Цель выживания
                </span>
                <span className={`text-xs font-black px-3 py-1 rounded-full flex items-center gap-1.5 ${
                  room?.bunker_info?.can_exit 
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                }`}>
                  {room?.bunker_info?.can_exit ? 'Можно выходить' : 'Выход запрещен'}
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-black text-emerald-400">{room?.bunker_info?.goal_title}</h4>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">{room?.bunker_info?.goal_desc}</p>
            </div>

            {/* Характеристики */}
            <div className="grid grid-cols-3 gap-3 text-center text-xs font-bold">
              <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800">
                <span className="text-zinc-500 block uppercase">Площадь</span>
                <span className="text-zinc-200 text-xs sm:text-sm">{room?.bunker_info?.size}</span>
              </div>
              <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800">
                <span className="text-zinc-500 block uppercase">Еда</span>
                <span className="text-zinc-200 text-xs sm:text-sm">{room?.bunker_info?.food}</span>
              </div>
              <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800">
                <span className="text-zinc-500 block uppercase">Срок</span>
                <span className="text-zinc-200 text-xs sm:text-sm">{room?.bunker_info?.duration}</span>
              </div>
            </div>

            {/* Движущийся индикатор готовности игроков */}
            <div className="space-y-2 pt-1">
              <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden border border-zinc-800 p-0.5">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((readyUserIds.length / Math.max(1, activePlayers.length)) * 100)}%` }}
                />
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 text-center">
                Готовы начать: <span className="text-emerald-400 font-bold">{readyUserIds.length}</span> из <span className="text-zinc-200 font-bold">{activePlayers.length}</span> игроков
              </p>
            </div>

            <button
              onClick={handleReadyStart}
              disabled={actionLoading || hasPressedReady}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs sm:text-sm py-4 rounded-2xl transition active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-950/50 uppercase tracking-wider"
            >
              {hasPressedReady ? 'Ожидание остальных игроков...' : 'Дальше'}
            </button>

          </div>
        </div>
      )}

      {/* 5. ОВЕРЛЕЙ РАСКРЫТОЙ КОМНАТЫ БУНКЕРА (5 СЕКУНД) */}
      {roomRevealOverlay && (
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-2xl z-[128] flex items-center justify-center p-4 sm:p-6 animate-backdrop-in">
          <div className="bg-zinc-900 border-2 border-sky-500/50 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-[0_0_50px_rgba(14,165,233,0.2)] text-center space-y-6 animate-overlay-in">
            <span className="text-xs font-black uppercase tracking-widest text-sky-400 bg-sky-950 px-4 py-1.5 rounded-full border border-sky-800">
              Новое помещение бункера!
            </span>

            {/* Карточка помещения */}
            <div className="w-full h-72 sm:h-80 bg-zinc-950 border-2 border-sky-500/40 rounded-3xl p-5 flex flex-col justify-between shadow-inner space-y-3">
              <div className="flex items-center gap-2 justify-center">
                <Home className="w-6 h-6 text-sky-400 shrink-0" />
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-sky-400">
                  Помещение
                </span>
              </div>

              <div className="my-auto text-center space-y-2.5 px-2">
                <h3 className="text-lg sm:text-xl font-black text-zinc-100 leading-snug">
                  {roomRevealOverlay.title}
                </h3>
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-medium">
                  {roomRevealOverlay.description}
                </p>
              </div>

              <div className="text-center">
                <span className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-sky-950 text-sky-400 border border-sky-800/50">
                  Бункер
                </span>
              </div>
            </div>

            {/* Движущийся прогресс-бар */}
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div className="bg-sky-500 h-full w-full animate-shrink-5s" />
            </div>
          </div>
        </div>
      )}

      {/* 6. ОВЕРЛЕЙ ГОЛОСОВАНИЯ (20 СЕКУНД) */}
      {room?.phase === 'VOTING' && !me?.is_kicked && (
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-2xl z-[110] flex items-center justify-center p-4 sm:p-6 animate-backdrop-in">
          <div className="bg-zinc-900 border-2 border-rose-900/80 rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-6 shadow-2xl text-center relative animate-overlay-in">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5 text-rose-400 font-extrabold uppercase text-xs sm:text-sm tracking-wider">
                <Vote className="w-6 h-6" />
                <span>Голосование за изгнание</span>
              </div>
              <span className="font-mono text-xs sm:text-sm bg-rose-950 text-rose-300 font-bold px-4 py-1.5 rounded-full border border-rose-800/50">
                {timeLeft}с
              </span>
            </div>

            {/* Динамический таймер-прогресс-бар для 20 сек */}
            <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
              <div
                className="bg-rose-500 h-full transition-all duration-1000 linear"
                style={{ width: `${Math.min(100, Math.max(0, (timeLeft / 20) * 100))}%` }}
              />
            </div>

            <p className="text-xs sm:text-sm text-zinc-400 text-left">
              Выберите игрока, которого хотите выгнать из бункера:
            </p>

            <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto">
              {activePlayers.map((p) => {
                const isMe = p.user_id === userId;
                return (
                  <button
                    key={p.id}
                    disabled={isMe || actionLoading}
                    onClick={() => setSelectedTarget(p.id)}
                    className={`p-4 rounded-2xl border text-xs sm:text-sm font-bold text-left transition flex items-center justify-between ${
                      isMe
                        ? 'bg-zinc-950/40 border-zinc-800/50 text-zinc-600 opacity-50 cursor-not-allowed'
                        : selectedTarget === p.id
                        ? 'bg-rose-950 border-rose-500 text-rose-100 shadow-lg shadow-rose-950/50 scale-102'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <span>{p.name}</span>
                    {isMe && <span className="text-xs text-zinc-500 font-normal">(Вы)</span>}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleCastVote}
              disabled={!selectedTarget || actionLoading}
              className="w-full bg-rose-600 hover:bg-rose-500 text-zinc-950 font-black text-xs sm:text-sm py-4 rounded-2xl transition active:scale-95 disabled:opacity-40 shadow-lg shadow-rose-950/40 uppercase tracking-wider"
            >
              {myVote ? 'Голос зафиксирован (Изменить)' : 'Подтвердить голос'}
            </button>
          </div>
        </div>
      )}

      {/* 7. ОВЕРЛЕЙ ИТОГОВ ГОЛОСОВАНИЯ В ВИДЕ СЕТКИ ПЛАШЕК С КВАДРАТИКАМИ (5 СЕКУНД) */}
      {voteResultsOverlay && (
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-2xl z-[125] flex items-center justify-center p-4 sm:p-6 animate-backdrop-in">
          <div className="bg-zinc-900 border-2 border-amber-500/50 rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-6 shadow-[0_0_50px_rgba(245,158,11,0.2)] text-center relative animate-overlay-in">
            <div className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-widest text-amber-400 bg-amber-950 px-4 py-1.5 rounded-full border border-amber-800">
                Результаты голосования
              </span>
              <h3 className="text-xl font-black text-zinc-100 pt-2">Распределение голосов</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto">
              {voteResultsOverlay.map((res: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border text-xs sm:text-sm font-bold text-left flex items-center justify-between transition ${
                    res.isKicked
                      ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300'
                  }`}
                >
                  <div className="flex flex-col gap-1 truncate pr-2">
                    <span className="truncate">{res.name}</span>
                    {res.isKicked && (
                      <span className="text-[10px] text-rose-400 font-black">ИЗГНАН</span>
                    )}
                  </div>
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center font-mono text-sm sm:text-base font-black text-amber-400 shrink-0 shadow-inner">
                    {res.votes}
                  </div>
                </div>
              ))}
            </div>

            {/* Движущийся прогресс-бар */}
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full w-full animate-shrink-5s" />
            </div>
          </div>
        </div>
      )}

      {/* 8. ФИКСИРОВАННЫЙ НИЖНИЙ БЛОК: СВОРАЧИВАЕМАЯ КОЛОДА + ПАНЕЛЬ ВКЛАДОК */}
      <div className="fixed bottom-0 left-0 right-0 z-[80] pointer-events-none flex flex-col items-center">
        
        {/* ЛИЧНАЯ КОЛОДА КАРТ */}
        {room?.phase !== 'LOBBY' && room?.phase !== 'START_OVERLAY' && room?.phase !== 'ENDED' && myCard && (
          <div className="w-full max-w-5xl px-4 pointer-events-auto transition-all duration-300">
            
            <div className="flex justify-center mb-1">
              <button
                onClick={() => setIsDeckCollapsed(!isDeckCollapsed)}
                className={`p-2 text-zinc-400 hover:text-white transition-all ${
                  isDeckCollapsed ? 'animate-bounce text-amber-400' : ''
                }`}
              >
                {isDeckCollapsed ? <ChevronUp className="w-7 h-7" /> : <ChevronDown className="w-7 h-7" />}
              </button>
            </div>

            {!isDeckCollapsed && (
              <div className="bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent pt-3 pb-2 transition-all">
                <div className="flex justify-center items-end -space-x-12 sm:-space-x-10 min-h-[260px] sm:min-h-[290px]">
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
                            ? 'translateY(-42px) rotate(0deg) scale(1.1)'
                            : `translateY(${cat.translateY}px) rotate(${cat.angle}deg)`,
                          zIndex: isSelected ? 40 : index + 10,
                        }}
                        className={`group relative w-32 sm:w-44 h-56 sm:h-64 bg-zinc-900 border-2 ${cat.border} rounded-3xl p-4 flex flex-col justify-between shadow-2xl transition-all duration-300 ease-out cursor-pointer select-none ${
                          isSelected
                            ? 'ring-4 ring-emerald-500/80 shadow-emerald-900/50'
                            : 'hover:-translate-y-12 hover:rotate-0 hover:z-30 hover:scale-105'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <IconComponent className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${cat.color}`} />
                          <span className={`text-xs sm:text-sm font-black uppercase tracking-wider ${cat.color}`}>{cat.label}</span>
                        </div>

                        <div className="my-auto text-center px-1 z-10">
                          <p className="text-xs sm:text-sm font-bold text-zinc-100 leading-relaxed">
                            {item?.val}
                          </p>
                        </div>

                        <div className="z-10 mt-1">
                          {item?.revealed ? (
                            <div className="w-full bg-zinc-800/80 text-zinc-400 text-xs font-bold py-1.5 rounded-xl text-center border border-zinc-700/50 uppercase">
                              Открыта
                            </div>
                          ) : canShowRevealButton ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRevealCard(cat.key);
                              }}
                              disabled={actionLoading}
                              className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black py-2 rounded-xl transition shadow-md active:scale-95"
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
            )}
          </div>
        )}

        {/* ПАНЕЛЬ ВКЛАДОК СТОЛ И БУНКЕР С КНОПКОЙ СКИПА */}
        <div className="w-full bg-zinc-950/95 border-t border-zinc-800/90 backdrop-blur-2xl px-6 py-4 pointer-events-auto">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            
            <button
              onClick={() => setActiveTab('table')}
              className={`flex-1 py-3 rounded-2xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 border ${
                activeTab === 'table'
                  ? 'bg-zinc-800 border-zinc-700 text-emerald-400 shadow-lg'
                  : 'bg-zinc-900/50 border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-5 h-5" />
              <span>Стол</span>
            </button>

            {room?.phase === 'DISCUSSION' && (
              <button
                onClick={handleSkipDiscussion}
                disabled={actionLoading || hasSkippedDiscussion}
                title="Пропустить обсуждение"
                className={`w-14 h-14 rounded-full shrink-0 flex items-center justify-center transition border shadow-xl ${
                  hasSkippedDiscussion
                    ? 'bg-amber-950/40 border-amber-800/50 text-amber-600 opacity-60'
                    : 'bg-amber-500 hover:bg-amber-400 border-amber-300 text-zinc-950 animate-pulse active:scale-90'
                }`}
              >
                <SkipForward className="w-6 h-6 fill-current" />
              </button>
            )}

            <button
              onClick={() => setActiveTab('bunker')}
              className={`flex-1 py-3 rounded-2xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 border ${
                activeTab === 'bunker'
                  ? 'bg-zinc-800 border-zinc-700 text-amber-400 shadow-lg'
                  : 'bg-zinc-900/50 border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Shield className="w-5 h-5" />
              <span>Бункер</span>
            </button>

          </div>
        </div>

      </div>

      {/* 9. ОВЕРЛЕЙ РАСКРЫТОЙ КАРТЫ (5 СЕКУНД) */}
      {cardRevealOverlay && (
        <div className="fixed inset-0 bg-zinc-950/85 backdrop-blur-md z-[120] flex items-center justify-center p-4 sm:p-6 animate-backdrop-in">
          <div className="bg-zinc-900 border-2 border-emerald-500/50 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-[0_0_50px_rgba(16,185,129,0.2)] text-center relative overflow-hidden space-y-5 animate-overlay-in">
            <div className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-950 px-4 py-1.5 rounded-full border border-emerald-800">
                Карта раскрыта!
              </span>
              <h3 className="text-xl font-black text-zinc-100 pt-2">
                {cardRevealOverlay.playerName}
              </h3>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-inner space-y-3 flex flex-col items-center">
              <OverlayIcon className={`w-12 h-12 ${cardRevealOverlay.color}`} />
              <p className={`text-xs sm:text-sm font-extrabold uppercase tracking-wider ${cardRevealOverlay.color}`}>
                {cardRevealOverlay.categoryLabel}
              </p>
              <p className="text-lg sm:text-xl font-black text-zinc-100 leading-snug">
                {cardRevealOverlay.val}
              </p>
            </div>

            {/* Движущийся прогресс-бар */}
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full w-full animate-shrink-5s" />
            </div>
          </div>
        </div>
      )}

      {/* 10. ОКНО РЕЗУЛЬТАТОВ ИГРЫ */}
      {room?.phase === 'ENDED' && (
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-2xl z-[100] flex items-center justify-center p-4 sm:p-6 animate-backdrop-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-10 max-w-xl w-full space-y-7 text-center shadow-2xl animate-overlay-in">
            <div>
              {me?.is_kicked ? (
                <div className="space-y-3 flex flex-col items-center">
                  <Skull className="w-14 h-14 text-rose-500" />
                  <h2 className="text-2xl sm:text-3xl font-black text-rose-500 uppercase tracking-wide">
                    Вы не выжили
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-400">
                    Вас не пустили в бункер. Вы остались снаружи.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 flex flex-col items-center">
                  <PartyPopper className="w-14 h-14 text-emerald-400" />
                  <h2 className="text-2xl sm:text-3xl font-black text-emerald-400 uppercase tracking-wide">
                    Вы выжили!
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-400">
                    Поздравляем! Вы вошли в число тех, кто попал в бункер.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-2xl p-5 space-y-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" /> Выжили ({activePlayers.length})
                </h3>
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {activePlayers.map((p) => (
                    <li key={p.id} className="text-xs sm:text-sm text-zinc-200 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      {p.name} {p.user_id === userId && <span className="text-xs text-emerald-400 font-bold">(Вы)</span>}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-rose-950/30 border border-rose-900/50 rounded-2xl p-5 space-y-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                  <Skull className="w-5 h-5" /> Погибли ({kickedPlayers.length})
                </h3>
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {kickedPlayers.length === 0 ? (
                    <li className="text-xs sm:text-sm text-zinc-500 italic">Никто не погиб</li>
                  ) : (
                    kickedPlayers.map((p) => (
                      <li key={p.id} className="text-xs sm:text-sm text-zinc-400 font-medium flex items-center gap-2 line-through">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        {p.name} {p.user_id === userId && <span className="text-xs text-rose-400 font-bold">(Вы)</span>}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <button
              onClick={() => router.push('/')}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs sm:text-sm py-4 rounded-2xl border border-zinc-700 transition active:scale-95 shadow-lg"
            >
              Вернуться на главную
            </button>
          </div>
        </div>
      )}

    </main>
  );
}
