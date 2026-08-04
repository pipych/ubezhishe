-- ============================================================
-- TIMER UPDATE: речь 2 мин, обсуждение 5 мин
-- Запусти в Supabase SQL Editor
-- ============================================================

-- reveal_card_and_next_turn: SPEECH таймер 1мин → 2мин
CREATE OR REPLACE FUNCTION reveal_card_and_next_turn(p_room_id uuid, p_user_id text, p_field_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_player_id uuid; v_speaker_order jsonb; v_current_idx int := 0; v_next_player_id uuid;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE room_id = p_room_id AND user_id = p_user_id::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Игрок не найден'; END IF;
  EXECUTE format('UPDATE player_cards SET %I_revealed = true WHERE player_id = $1', p_field_key) USING v_player_id;
  SELECT bunker_info->'speaker_order' INTO v_speaker_order FROM rooms WHERE id = p_room_id;
  IF v_speaker_order IS NULL OR jsonb_array_length(v_speaker_order) = 0 THEN
    SELECT jsonb_agg(id ORDER BY random()) INTO v_speaker_order FROM players WHERE room_id = p_room_id AND NOT is_kicked;
  ELSE
    FOR i IN 0..jsonb_array_length(v_speaker_order)-1 LOOP
      IF (v_speaker_order->i)::text = v_player_id::text THEN v_current_idx := i + 1; EXIT; END IF;
    END LOOP;
  END IF;
  IF v_current_idx >= jsonb_array_length(v_speaker_order) THEN
    UPDATE rooms SET phase = 'DISCUSSION', phase_expires_at = now() + interval '5 minutes', bunker_info = jsonb_set(bunker_info, '{speaker_order}', v_speaker_order), current_speaker_id = NULL WHERE id = p_room_id;
  ELSE
    v_next_player_id := (v_speaker_order->v_current_idx)::uuid;
    UPDATE rooms SET phase = 'SPEECH', phase_expires_at = now() + interval '2 minutes', bunker_info = jsonb_set(bunker_info, '{speaker_order}', v_speaker_order), current_speaker_id = v_next_player_id WHERE id = p_room_id;
  END IF;
END; $$;

-- handle_phase_timeout: DISCUSSION таймер 2мин → 5мин
CREATE OR REPLACE FUNCTION handle_phase_timeout(p_room_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_phase text; v_kicked_player_id uuid; v_active_count int;
BEGIN
  SELECT phase INTO v_phase FROM rooms WHERE id = p_room_id;
  IF v_phase = 'SPEECH' THEN
    UPDATE rooms SET phase = 'DISCUSSION', phase_expires_at = now() + interval '5 minutes', current_speaker_id = NULL WHERE id = p_room_id;
  ELSIF v_phase = 'DISCUSSION' THEN
    UPDATE rooms SET phase = 'VOTING', phase_expires_at = now() + interval '1 minute', current_speaker_id = NULL WHERE id = p_room_id;
  ELSIF v_phase = 'VOTING' THEN
    SELECT target_id INTO v_kicked_player_id FROM votes WHERE room_id = p_room_id GROUP BY target_id ORDER BY count(*) DESC LIMIT 1;
    IF v_kicked_player_id IS NOT NULL THEN
      UPDATE players SET is_kicked = true WHERE id = v_kicked_player_id;
      UPDATE player_cards SET biology_revealed = true, profession_revealed = true, health_revealed = true, hobby_revealed = true, baggage_revealed = true, fact_revealed = true WHERE player_id = v_kicked_player_id;
    END IF;
    SELECT count(*) INTO v_active_count FROM players WHERE room_id = p_room_id AND NOT is_kicked;
    IF v_active_count <= (SELECT ceil(total_initial_players::float / 2) FROM rooms WHERE id = p_room_id) THEN
      UPDATE rooms SET phase = 'ENDED', current_speaker_id = NULL WHERE id = p_room_id;
    ELSE
      UPDATE rooms SET round_number = round_number + 1, phase = 'SPEECH', phase_expires_at = now() + interval '2 minutes', current_speaker_id = NULL, skip_votes = NULL WHERE id = p_room_id;
    END IF;
  END IF;
END; $$;

-- start_game: тоже обновим START_OVERLAY чтобы было 2 мин (было 2 мин, ок)
-- player_ready_start: SPEECH после готовности тоже 2 мин
CREATE OR REPLACE FUNCTION player_ready_start(p_room_id uuid, p_user_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_ready jsonb; v_total int;
BEGIN
  SELECT bunker_info->'ready_user_ids' INTO v_ready FROM rooms WHERE id = p_room_id;
  IF NOT v_ready ? p_user_id THEN
    v_ready := v_ready || to_jsonb(p_user_id);
    UPDATE rooms SET bunker_info = jsonb_set(bunker_info, '{ready_user_ids}', v_ready) WHERE id = p_room_id;
  END IF;
  SELECT count(*) INTO v_total FROM players WHERE room_id = p_room_id;
  IF jsonb_array_length(v_ready) >= v_total THEN
    PERFORM assign_cards(p_room_id);
    UPDATE rooms SET phase = 'SPEECH', phase_expires_at = now() + interval '2 minutes' WHERE id = p_room_id;
  END IF;
END; $$;
