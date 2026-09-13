-- Enum values must be committed before later migrations use them in functions and constraints.
alter type public.peer_request_status add value if not exists 'no_show';
alter type public.peer_session_status add value if not exists 'no_show';
