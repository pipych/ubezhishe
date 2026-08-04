'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { 
  Dna, 
  Briefcase, 
  HeartPulse, 
  Palette, 
  Luggage, 
  Scroll, 
  ShieldAlert, 
  Users, 
  Mic, 
  Clock, 
  CheckCircle2, 
  Eye, 
  EyeOff,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const CARDS_CONFIG = [
  { key: 'biology', title: 'Биология', icon: Dna },
  { key: 'profession', title: 'Профессия', icon: Briefcase },
  { key: 'health', title: 'Здоровье', icon: HeartPulse },
  { key: 'hobby', title: 'Хобби', icon: Palette },
  { key: 'baggage', title: 'Багаж', icon: Luggage },
  { key: 'fact', title: 'Факты', icon: Scroll },
];

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.code as string)?.toUpperCase();

  const [userId, setUserId] = useState<string>('');
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [myCards, setMyCards] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState<'table' | 'bunker'>('table');
  const [deckExpanded, setDeckExpanded] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Инициализация юзера (сохранение в localStorage)
  useEffect(() => {
    let storedId = localStorage.getItem('ubezhishe_user_id');
    if (!storedId) {
      storedId = 'user_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('ubezhishe_user_id', storedId);
    }
    setUserId(storedId);
  }, []);

  // Загрузка данных комнаты по коду
  useEffect(() => {
    if (!roomCode || !userId) return;

    const fetchData = async () => {
      setLoading(true);
      // Комната по коду
      const { data: roomData } = await supabase.from('rooms').select('*').eq('code', roomCode).single();
      if (!roomData) {
        setLoading(false);
        return;
      }
      setRoom(roomData);

      // Игроки
      const { data: playersData } = await supabase.from('players').select('*').eq('room_id', roomData.id);
      if (playersData) setPlayers(playersData);

      // Карты текущего игрока
      const { data: playerRecord } = await supabase.from('players').select('id').eq('room_id', roomData.id).eq('user_id', userId).single();
      if (playerRecord) {
        const { data: cardsData } = await supabase.from('player_cards').select('*').eq('player_id', playerRecord.id).single();
        if (cardsData) setMyCards(cardsData);
      }
      setLoading(false);
    };

    fetchData();

    // Подписка на Realtime изменения
    let roomSubscription: any;

    const setupRealtime = async () => {
      const { data: rData } = await supabase.from('rooms').select('id').eq('code', roomCode).single();
      if (!rData) return;

      roomSubscription = supabase
        .channel(`room_${rData.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${rData.id}` }, (payload) => {
          setRoom(payload.new);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${rData.id}` }, async () => {
          const { data } = await supabase.from('players').select('*').eq('room_id', rData.id);
          if (data) setPlayers(data);
        })
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (roomSubscription) supabase.removeChannel(roomSubscription);
    };
  }, [roomCode, userId]);

  // Загрузка карт при изменении игрока или фазы
  useEffect(() => {
    if (!userId || !room?.id) return;
    const fetchCards = async () => {
      const { data: p } = await supabase.from('players').select('id').eq('room_id', room.id).eq('user_id', userId).single();
      if (p) {
        const { data: c } = await supabase.from('player_cards').select('*').eq('player_id', p.id).single();
        if (c) setMyCards(c);
      }
    };
    fetchCards();
  }, [room?.phase, userId, room?.id]);

  // Кнопка «Дальше» в стартовом оверлее
  const handleReadyStart = async () => {
    if (!room?.id) return;
    const { data: p } = await supabase.from('players').select('id').eq('room_id', room.id).eq('user_id', userId).single();
    if (!p) return;

    await supabase.rpc('player_ready_start', {
      p_room_id: room.id,
      p_user_id: p.id
    });
  };

  // Открытие своей карты
  const handleRevealCard = async (cardKey: string) => {
    if (!myCards) return;
    const currentCardObj = myCards[cardKey];
    if (currentCardObj?.revealed) return;

    const updatedCardObj = { ...currentCardObj, revealed: true };
    const updatedCards = { ...myCards, [cardKey]: updatedCardObj };

    setMyCards(updatedCards);

    await supabase
      .from('player_cards')
      .update({ [cardKey]: updatedCardObj })
      .eq('id', myCards.id);
  };

  if (loading) {
    return <div className="min-h-screen bg-[#0f1115] text-white flex items-center justify-center">Загрузка бункера...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0f1115] text-white flex flex-col items-center p-4 font-sans select-none pb-24">
      {/* Шапка */}
      <div className="w-full max-w-md bg-[#181b22] border border-[#262b35] rounded-xl p-3 flex items-center justify-between mb-4 shadow-lg">
        <span className="bg-[#22c55e]/10 text-[#22c55e] px-3 py-1 rounded-lg font-mono font-bold text-sm tracking-wider">
          {room?.code}
        </span>
        <div className="text-center">
          <div className="text-xs text-gray-400 uppercase tracking-widest font-semibold">
            Раунд {room?.round_number || 1} • {room?.phase}
          </div>
          <div className="text-sm font-bold text-gray-200">
            Мест в бункере: 1 из {players.length}
          </div>
        </div>
        <div className="bg-[#22c55e]/20 text-[#22c55e] px-2.5 py-1 rounded-lg text-sm font-bold flex items-center gap-1">
          <Clock className="w-4 h-4" /> 00:48
        </div>
      </div>

      {/* ФАЗА: START_OVERLAY (Условия выживания) */}
      {room?.phase === 'START_OVERLAY' && (
        <div className="w-full max-w-md bg-[#181b22] border border-[#d97706]/40 rounded-2xl p-5 shadow-2xl relative animate-fadeIn">
          <div className="text-center text-xs font-bold text-[#d97706] tracking-widest uppercase mb-1">
            Начало игры • Ознакомление
          </div>
          <h2 className="text-xl font-extrabold text-center mb-4">Условия выживания</h2>

          {/* Катастрофа */}
          <div className="bg-[#12141a] border border-[#262b35] rounded-xl p-3.5 mb-3">
            <div className="flex items-center gap-2 text-[#f59e0b] font-bold text-sm mb-1">
              <ShieldAlert className="w-4 h-4" /> Катастрофа
            </div>
            <div className="text-base font-bold text-white mb-1">{room?.bunker_info?.catastrophe}</div>
            <div className="text-xs text-gray-400 leading-relaxed">{room?.bunker_info?.catastrophe_desc}</div>
          </div>

          {/* Цель выживания */}
          <div className="bg-[#12141a] border border-[#262b35] rounded-xl p-3.5 mb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-[#22c55e] font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" /> Цель выживания
              </div>
              <span className="text-[10px] bg-[#22c55e]/10 text-[#22c55e] px-2 py-0.5 rounded font-bold">
                {room?.bunker_info?.can_exit ? 'Можно выходить' : 'Без выхода'}
              </span>
            </div>
            <div className="text-sm font-bold text-white mb-1">{room?.bunker_info?.goal_title}</div>
            <div className="text-xs text-gray-400 leading-relaxed">{room?.bunker_info?.goal_desc}</div>
          </div>

          {/* Параметры бункера */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-[#12141a] border border-[#262b35] rounded-xl p-2.5 text-center">
              <div className="text-[10px] text-gray-400 uppercase font-bold">Площадь</div>
              <div className="text-xs font-extrabold text-white mt-1">{room?.bunker_info?.size}</div>
            </div>
            <div className="bg-[#12141a] border border-[#262b35] rounded-xl p-2.5 text-center">
              <div className="text-[10px] text-gray-400 uppercase font-bold">Еда</div>
              <div className="text-xs font-extrabold text-white mt-1">{room?.bunker_info?.food}</div>
            </div>
            <div className="bg-[#12141a] border border-[#262b35] rounded-xl p-2.5 text-center">
              <div className="text-[10px] text-gray-400 uppercase font-bold">Срок</div>
              <div className="text-xs font-extrabold text-white mt-1">{room?.bunker_info?.duration}</div>
            </div>
          </div>

          <div className="text-center text-xs text-gray-400 mb-3">
            Готовы начать: <span className="text-white font-bold">{room?.bunker_info?.ready_user_ids?.length || 0}</span> из {players.length} игроков
          </div>

          <button
            onClick={handleReadyStart}
            className="w-full bg-[#22c55e] hover:bg-[#1ea34d] text-black font-extrabold py-3.5 rounded-xl transition shadow-lg text-base"
          >
            ДАЛЬШЕ
          </button>
        </div>
      )}

      {/* ФАЗА: SPEECH / DISCUSSION / VOTING */}
      {room?.phase !== 'START_OVERLAY' && (
        <div className="w-full max-w-md flex flex-col gap-4">
          {/* Список игроков */}
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Список игроков:</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {players.map((p) => (
              <div key={p.id} className="bg-[#181b22] border border-[#262b35] px-3 py-2 rounded-xl flex items-center gap-2">
                <span className="font-bold text-sm text-white">{p.name}</span>
                {room?.current_speaker_id === p.id && (
                  <span className="bg-[#f59e0b]/20 text-[#f59e0b] text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                    <Mic className="w-3 h-3" /> СПИКЕР
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Карточки игрока (Слот текущего просмотра) */}
          <div className="bg-[#181b22] border border-[#262b35] rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-gray-300">Игрок: Вы</span>
              <span className="text-xs bg-[#22c55e]/10 text-[#22c55e] px-2 py-0.5 rounded font-bold flex items-center gap-1">
                <Mic className="w-3 h-3" /> Выступает
              </span>
            </div>

            {/* Карты сеткой */}
            <div className="grid grid-cols-3 gap-2">
              {CARDS_CONFIG.map((conf) => {
                const cardData = myCards?.[conf.key];
                const isRevealed = cardData?.revealed;
                const IconComponent = conf.icon;

                return (
                  <div
                    key={conf.key}
                    onClick={() => !isRevealed && handleRevealCard(conf.key)}
                    className={`bg-[#12141a] border rounded-xl p-3 flex flex-col justify-between min-h-[110px] cursor-pointer transition relative overflow-hidden ${
                      isRevealed ? 'border-[#22c55e]/50 bg-[#22c55e]/5' : 'border-[#262b35] hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-gray-400">
                      <span className="flex items-center gap-1 truncate">
                        <IconComponent className="w-3.5 h-3.5 text-[#22c55e]" /> {conf.title}
                      </span>
                    </div>

                    <div className="my-auto text-center py-2">
                      {isRevealed ? (
                        <span className="text-xs font-bold text-white leading-tight block">
                          {cardData.val}
                        </span>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-gray-500">
                          <EyeOff className="w-5 h-5 mb-1 opacity-50" />
                          <span className="text-[10px] uppercase font-bold tracking-wider">Закрыта</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Выдвижной веер карт снизу */}
      <div className="fixed bottom-16 left-0 right-0 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-end gap-[-20px] px-4">
          {CARDS_CONFIG.map((conf, index) => {
            const cardData = myCards?.[conf.key];
            const isRevealed = cardData?.revealed;
            const IconComponent = conf.icon;

            return (
              <div
                key={conf.key}
                onClick={() => !isRevealed && handleRevealCard(conf.key)}
                style={{
                  transform: `rotate(${(index - 2.5) * 6}deg) translateY(${deckExpanded ? '0px' : '30px'})`,
                  zIndex: index,
                }}
                className={`w-24 h-36 bg-[#181b22] border rounded-xl p-2 flex flex-col justify-between shadow-2xl cursor-pointer transition-all duration-300 origin-bottom ${
                  isRevealed ? 'border-[#22c55e] bg-[#1a211e]' : 'border-[#262b35] hover:-translate-y-4'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold text-gray-400">
                  <IconComponent className="w-3 h-3 text-[#22c55e]" />
                </div>
                <div className="text-[10px] text-center font-bold text-gray-200 line-clamp-3">
                  {isRevealed ? cardData.val : conf.title}
                </div>
                <div className="text-[8px] text-center text-gray-500 uppercase">
                  {isRevealed ? 'Открыта' : 'Скрыта'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Плавающая кнопка разворота колоды */}
      <button
        onClick={() => setDeckExpanded(!deckExpanded)}
        className="fixed bottom-20 right-4 bg-[#22c55e] text-black p-3 rounded-full shadow-lg z-30 font-bold flex items-center justify-center"
      >
        {deckExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
      </button>

      {/* Навигационное меню снизу */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#12141a] border-t border-[#262b35] p-3 flex justify-around items-center z-20">
        <button
          onClick={() => setSelectedTab('table')}
          className={`flex-1 py-2 text-center font-bold text-sm rounded-xl transition ${
            selectedTab === 'table' ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'text-gray-400 hover:text-white'
          }`}
        >
          Стол
        </button>
        <button
          onClick={() => setSelectedTab('bunker')}
          className={`flex-1 py-2 text-center font-bold text-sm rounded-xl transition ${
            selectedTab === 'bunker' ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'text-gray-400 hover:text-white'
          }`}
        >
          Бункер
        </button>
      </div>
    </div>
  );
}
