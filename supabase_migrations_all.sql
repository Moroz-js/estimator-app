-- ============================================
-- ПОЛНАЯ СХЕМА БАЗЫ ДАННЫХ
-- Estimator App - Supabase Database Schema
-- ============================================
-- Этот файл содержит полную схему БД
-- Выполните в Supabase SQL Editor для создания/обновления
-- ============================================

-- ============================================
-- ТАБЛИЦА: projects
-- ============================================
-- Основная таблица проектов
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) 
    REFERENCES auth.users (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- ============================================
-- ТАБЛИЦА: project_members
-- ============================================
-- Участники проектов и система приглашений
CREATE TABLE IF NOT EXISTS public.project_members (
  id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor'::text,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active'::text,
  invited_by UUID NULL,
  invited_by_email TEXT NULL,
  
  CONSTRAINT project_members_pkey PRIMARY KEY (id),
  CONSTRAINT project_members_project_user_unique UNIQUE (project_id, user_id),
  CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) 
    REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT project_members_invited_by_fkey FOREIGN KEY (invited_by) 
    REFERENCES auth.users (id),
  CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) 
    REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT project_members_role_check CHECK (
    (role = ANY (ARRAY['owner'::text, 'editor'::text, 'viewer'::text]))
  ),
  CONSTRAINT project_members_status_check CHECK (
    (status = ANY (ARRAY['pending'::text, 'active'::text]))
  )
) TABLESPACE pg_default;

-- ============================================
-- ИНДЕКСЫ
-- ============================================

-- Индексы для projects
-- (нет дополнительных индексов, только PRIMARY KEY)

-- Индексы для project_members
CREATE INDEX IF NOT EXISTS project_members_project_id_idx 
  ON public.project_members USING btree (project_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS project_members_user_id_idx 
  ON public.project_members USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_project_members_user_invited 
  ON public.project_members USING btree (user_id, invited_by) TABLESPACE pg_default;

-- ============================================
-- RPC ФУНКЦИИ
-- ============================================

-- Функция для поиска пользователя по email
-- Используется при приглашении пользователей в проект
CREATE OR REPLACE FUNCTION find_user_id_by_email(user_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id UUID;
BEGIN
  -- Ищем пользователя в auth.users по email
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;
  
  RETURN user_id;
END;
$$;

-- Даём права на выполнение функции аутентифицированным пользователям
GRANT EXECUTE ON FUNCTION find_user_id_by_email(TEXT) TO authenticated;

COMMENT ON FUNCTION find_user_id_by_email IS 'Находит ID пользователя по email адресу';

-- Функция для получения email пользователя по ID
-- Используется для отображения списка участников проекта
CREATE OR REPLACE FUNCTION get_user_email_by_id(user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Получаем email пользователя из auth.users
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = user_id
  LIMIT 1;
  
  RETURN user_email;
END;
$$;

-- Даём права на выполнение функции аутентифицированным пользователям
GRANT EXECUTE ON FUNCTION get_user_email_by_id(UUID) TO authenticated;

COMMENT ON FUNCTION get_user_email_by_id IS 'Получает email пользователя по его ID';

-- ============================================
-- КОММЕНТАРИИ К ТАБЛИЦАМ И КОЛОНКАМ
-- ============================================

COMMENT ON TABLE public.projects IS 'Проекты оценки задач';
COMMENT ON COLUMN public.projects.payload IS 'JSON данные проекта (эпики, задачи, стек)';

COMMENT ON TABLE public.project_members IS 'Участники проектов и приглашения';
COMMENT ON COLUMN public.project_members.role IS 'Роль: owner (владелец), editor (редактор), viewer (просмотр)';
COMMENT ON COLUMN public.project_members.status IS 'Статус: pending (ожидает), active (активен)';
COMMENT ON COLUMN public.project_members.invited_by IS 'ID пользователя, который пригласил (NULL для владельца)';
COMMENT ON COLUMN public.project_members.invited_by_email IS 'Email пригласившего (для быстрого отображения)';

-- ============================================
-- ПОЛИТИКИ БЕЗОПАСНОСТИ (RLS)
-- ============================================
-- ВАЖНО: RLS отключен для упрощения
-- Страница /project/[id]/preview доступна всем без авторизации
-- Если знаешь ID проекта, можешь посмотреть превью

-- Раскомментируйте и настройте RLS при необходимости:
-- ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- ============================================
-- СХЕМА ГОТОВА
-- ============================================
-- Версия: 1.0
-- Дата: 2025-11-21
-- ============================================
