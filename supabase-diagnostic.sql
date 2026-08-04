-- ============================================================
-- ДИАГНОСТИКА: показать все RPC-функции и их типы параметров
-- Запусти это ПЕРВЫМ в Supabase SQL Editor
-- ============================================================

SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_room', 'join_room', 'start_game', 
    'player_ready_start', 'assign_cards',
    'reveal_card_and_next_turn', 'skip_discussion',
    'cast_vote', 'handle_phase_timeout'
  )
ORDER BY p.proname;
