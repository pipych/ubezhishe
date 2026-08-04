-- ============================================================
-- FIX: "Operator does not exist: uuid = text"
-- Запусти этот скрипт в Supabase SQL Editor
-- ============================================================
-- Проблема: RPC-функции объявлены с TEXT-параметрами для UUID-полей.
-- PostgreSQL не может сравнить uuid = text без явного приведения.
-- Решение: пересоздаём функции с ::uuid кастом внутри тела.

-- 1. create_room — создаёт комнату + хоста
CREATE OR REPLACE FUNCTION create_room(p_host_id text, p_host_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code text;
  v_room_id uuid;
  v_catastrophe text;
  v_goal text;
  v_size text;
  v_food text;
  v_duration text;
BEGIN
  -- Генерируем уникальный 6-значный код
  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    IF NOT EXISTS (SELECT 1 FROM rooms WHERE code = v_code) THEN
      EXIT;
    END IF;
  END LOOP;

  -- Берём случайную катастрофу
  SELECT jsonb_build_object(
    'catastrophe', title,
    'catastrophe_desc', description,
    'goal_title', goal_title,
    'goal_desc', goal_description,
    'can_exit', can_exit,
    'size', size,
    'food', food,
    'duration', duration,
    'ready_user_ids', '[]'::jsonb,
    'revealed_rooms', '[]'::jsonb
  ) INTO v_catastrophe
  FROM catastrophes
  ORDER BY random()
  LIMIT 1;

  -- Создаём комнату
  INSERT INTO rooms (code, host_id, bunker_info, phase, round_number, total_initial_players)
  VALUES (v_code, p_host_id::uuid, v_catastrophe::jsonb, 'LOBBY', 1, 1)
  RETURNING id INTO v_room_id;

  -- Добавляем хоста как игрока
  INSERT INTO players (room_id, user_id, name)
  VALUES (v_room_id, p_host_id::uuid, p_host_name);

  RETURN v_code;
END;
$$;

-- 2. join_room — вход в комнату
CREATE OR REPLACE FUNCTION join_room(p_room_code text, p_user_id text, p_player_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  SELECT id INTO v_room_id FROM rooms WHERE code = p_room_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена';
  END IF;

  INSERT INTO players (room_id, user_id, name)
  VALUES (v_room_id, p_user_id::uuid, p_player_name)
  ON CONFLICT (room_id, user_id) DO UPDATE SET name = p_player_name;

  -- Обновляем счётчик игроков
  UPDATE rooms SET total_initial_players = (
    SELECT count(*) FROM players WHERE room_id = v_room_id
  ) WHERE id = v_room_id;
END;
$$;

-- 3. start_game — запуск игры
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_player_count int;
BEGIN
  SELECT count(*) INTO v_player_count FROM players WHERE room_id = p_room_id;
  IF v_player_count < 2 THEN
    RAISE EXCEPTION 'Нужно минимум 2 игрока';
  END IF;

  UPDATE rooms
  SET
    phase = 'START_OVERLAY',
    total_initial_players = v_player_count,
    phase_expires_at = now() + interval '2 minutes'
  WHERE id = p_room_id;
END;
$$;

-- 4. player_ready_start — игрок нажал «Дальше»
CREATE OR REPLACE FUNCTION player_ready_start(p_room_id uuid, p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ready jsonb;
  v_total int;
  v_player_id uuid;
BEGIN
  -- Получаем player_id по user_id
  SELECT id INTO v_player_id FROM players
  WHERE room_id = p_room_id AND user_id = p_user_id::uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Игрок не найден';
  END IF;

  SELECT bunker_info->'ready_user_ids' INTO v_ready FROM rooms WHERE id = p_room_id;

  -- Добавляем user_id в список готовых (если ещё нет)
  IF NOT v_ready ? p_user_id THEN
    v_ready := v_ready || to_jsonb(p_user_id);
    UPDATE rooms SET bunker_info = jsonb_set(bunker_info, '{ready_user_ids}', v_ready) WHERE id = p_room_id;
  END IF;

  -- Считаем общее количество игроков
  SELECT count(*) INTO v_total FROM players WHERE room_id = p_room_id;

  -- Если все готовы — начинаем игру
  IF jsonb_array_length(v_ready) >= v_total THEN
    PERFORM assign_cards(p_room_id);
    UPDATE rooms SET phase = 'SPEECH', phase_expires_at = now() + interval '1 minute' WHERE id = p_room_id;
  END IF;
END;
$$;

-- 5. assign_cards — раздача карт всем игрокам
CREATE OR REPLACE FUNCTION assign_cards(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_player record;
  v_card record;
BEGIN
  FOR v_player IN SELECT id FROM players WHERE room_id = p_room_id LOOP
    -- Берём случайную карту
    SELECT jsonb_build_object(
      'biology', jsonb_build_object('val', biology, 'revealed', false),
      'profession', jsonb_build_object('val', profession, 'revealed', false),
      'health', jsonb_build_object('val', health, 'revealed', false),
      'hobby', jsonb_build_object('val', hobby, 'revealed', false),
      'baggage', jsonb_build_object('val', baggage, 'revealed', false),
      'fact', jsonb_build_object('val', fact, 'revealed', false)
    ) INTO v_card
    FROM cards ORDER BY random() LIMIT 1;

    INSERT INTO player_cards (player_id, room_id, biology, profession, health, hobby, baggage, fact,
      biology_revealed, profession_revealed, health_revealed, hobby_revealed, baggage_revealed, fact_revealed)
    VALUES (
      v_player.id, p_room_id,
      v_card->'biology'->>'val',
      v_card->'profession'->>'val',
      v_card->'health'->>'val',
      v_card->'hobby'->>'val',
      v_card->'baggage'->>'val',
      v_card->'fact'->>'val',
      false, false, false, false, false, false
    );
  END LOOP;
END;
$$;

-- 6. reveal_card_and_next_turn — раскрыть карту + следующий ход
CREATE OR REPLACE FUNCTION reveal_card_and_next_turn(p_room_id uuid, p_user_id text, p_field_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_player_id uuid;
  v_player_count int;
  v_speaker_order jsonb;
  v_current_idx int;
  v_next_player_id uuid;
BEGIN
  -- Находим player_id
  SELECT id INTO v_player_id FROM players
  WHERE room_id = p_room_id AND user_id = p_user_id::uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Игрок не найден';
  END IF;

  -- Раскрываем поле карты
  EXECUTE format('UPDATE player_cards SET %I_revealed = true WHERE player_id = $1', p_field_key)
  USING v_player_id;

  -- Определяем порядок и следующего спикера
  SELECT count(*) INTO v_player_count FROM players WHERE room_id = p_room_id AND NOT is_kicked;

  SELECT bunker_info->'speaker_order' INTO v_speaker_order FROM rooms WHERE id = p_room_id;

  IF v_speaker_order IS NULL OR jsonb_array_length(v_speaker_order) = 0 THEN
    -- Первый раз: создаём порядок спикеров
    SELECT jsonb_agg(id ORDER BY random()) INTO v_speaker_order
    FROM players WHERE room_id = p_room_id AND NOT is_kicked;
    v_current_idx := 0;
  ELSE
    -- Ищем текущего спикера в порядке
    FOR i IN 0..jsonb_array_length(v_speaker_order)-1 LOOP
      IF (v_speaker_order->i)::text = v_player_id::text THEN
        v_current_idx := i + 1;
        EXIT;
      END IF;
    END LOOP;
    v_current_idx := coalesce(v_current_idx, 0);
  END IF;

  -- Проверяем: все ли карты раскрыты у текущего игрока
  -- Если да — переходим к следующему
  IF v_current_idx >= jsonb_array_length(v_speaker_order) THEN
    -- Все высказались — переходим к обсуждению
    UPDATE rooms SET
      phase = 'DISCUSSION',
      phase_expires_at = now() + interval '2 minutes',
      bunker_info = jsonb_set(bunker_info, '{speaker_order}', v_speaker_order),
      current_speaker_id = NULL
    WHERE id = p_room_id;
  ELSE
    -- Следующий спикер
    v_next_player_id := (v_speaker_order->v_current_idx)::uuid;
    UPDATE rooms SET
      phase = 'SPEECH',
      phase_expires_at = now() + interval '1 minute',
      bunker_info = jsonb_set(bunker_info, '{speaker_order}', v_speaker_order),
      current_speaker_id = v_next_player_id
    WHERE id = p_room_id;
  END IF;
END;
$$;

-- 7. skip_discussion — пропустить обсуждение
CREATE OR REPLACE FUNCTION skip_discussion(p_room_id uuid, p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_skip_votes text[];
BEGIN
  SELECT skip_votes INTO v_skip_votes FROM rooms WHERE id = p_room_id;

  IF v_skip_votes IS NULL THEN
    v_skip_votes := ARRAY[]::text[];
  END IF;

  IF NOT p_user_id = ANY(v_skip_votes) THEN
    v_skip_votes := array_append(v_skip_votes, p_user_id);
    UPDATE rooms SET skip_votes = v_skip_votes WHERE id = p_room_id;
  END IF;

  -- Если все активные игроки проголосовали за скип — переходим к голосованию
  IF array_length(v_skip_votes, 1) >= (SELECT count(*) FROM players WHERE room_id = p_room_id AND NOT is_kicked) THEN
    UPDATE rooms SET
      phase = 'VOTING',
      phase_expires_at = now() + interval '1 minute',
      current_speaker_id = NULL
    WHERE id = p_room_id;
  END IF;
END;
$$;

-- 8. cast_vote — проголосовать
CREATE OR REPLACE FUNCTION cast_vote(p_room_id uuid, p_voter_user_id text, p_target_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_voter_player_id uuid;
BEGIN
  -- Находим voter player_id
  SELECT id INTO v_voter_player_id FROM players
  WHERE room_id = p_room_id AND user_id = p_voter_user_id::uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Игрок не найден';
  END IF;

  -- Голосуем (upsert)
  INSERT INTO votes (room_id, voter_id, target_id)
  VALUES (p_room_id, v_voter_player_id, p_target_player_id)
  ON CONFLICT (room_id, voter_id) DO UPDATE SET target_id = p_target_player_id;
END;
$$;

-- 9. handle_phase_timeout — обработка таймаута фазы
CREATE OR REPLACE FUNCTION handle_phase_timeout(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phase text;
  v_kicked_player_id uuid;
  v_active_count int;
BEGIN
  SELECT phase INTO v_phase FROM rooms WHERE id = p_room_id;

  IF v_phase = 'SPEECH' THEN
    -- Переход к обсуждению
    UPDATE rooms SET
      phase = 'DISCUSSION',
      phase_expires_at = now() + interval '2 minutes',
      current_speaker_id = NULL
    WHERE id = p_room_id;

  ELSIF v_phase = 'DISCUSSION' THEN
    -- Переход к голосованию
    UPDATE rooms SET
      phase = 'VOTING',
      phase_expires_at = now() + interval '1 minute',
      current_speaker_id = NULL
    WHERE id = p_room_id;

  ELSIF v_phase = 'VOTING' THEN
    -- Подсчёт голосов
    SELECT target_id INTO v_kicked_player_id
    FROM votes WHERE room_id = p_room_id
    GROUP BY target_id
    ORDER BY count(*) DESC
    LIMIT 1;

    IF v_kicked_player_id IS NOT NULL THEN
      -- Изгоняем игрока
      UPDATE players SET is_kicked = true WHERE id = v_kicked_player_id;

      -- Раскрываем все его карты
      UPDATE player_cards SET
        biology_revealed = true,
        profession_revealed = true,
        health_revealed = true,
        hobby_revealed = true,
        baggage_revealed = true,
        fact_revealed = true
      WHERE player_id = v_kicked_player_id;
    END IF;

    -- Проверяем, не осталось ли достаточно мест
    SELECT count(*) INTO v_active_count
    FROM players WHERE room_id = p_room_id AND NOT is_kicked;

    IF v_active_count <= (SELECT ceil(total_initial_players::float / 2) FROM rooms WHERE id = p_room_id) THEN
      -- Игра окончена
      UPDATE rooms SET phase = 'ENDED', current_speaker_id = NULL WHERE id = p_room_id;
    ELSE
      -- Следующий раунд
      UPDATE rooms SET
        round_number = round_number + 1,
        phase = 'SPEECH',
        phase_expires_at = now() + interval '1 minute',
        current_speaker_id = NULL,
        skip_votes = NULL
      WHERE id = p_room_id;
    END IF;
  END IF;
END;
$$;
