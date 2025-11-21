# Estimator App - Техническая спецификация

## Оглавление
1. [Обзор](#обзор)
2. [Технологический стек](#технологический-стек)
3. [Архитектура](#архитектура)
4. [Функциональность](#функциональность)
5. [API Endpoints](#api-endpoints)
6. [База данных](#база-данных)
7. [Типы данных](#типы-данных)
8. [Компоненты](#компоненты)
9. [Конфигурация](#конфигурация)

---

## Обзор

**Estimator App** - веб-приложение для создания и управления оценками времени разработки проектов. Позволяет декомпозировать проекты на эпики и задачи, оценивать трудозатраты и экспортировать результаты в Excel.

### Основные возможности
- Создание и редактирование проектов с декомпозицией на эпики и задачи
- Автоматическая генерация шаблонов задач на основе выбранного стека
- Оценка времени по типам задач (BA, NC, DE)
- Экспорт оценок в Excel формат
- Система приглашений для совместной работы
- Разделение проектов на "Мои" и "Гостевые"
- Публичные ссылки на превью проектов (без авторизации)
- **Realtime Collaboration** - совместная работа в реальном времени

---

## Технологический стек

### Frontend
- **Framework**: Next.js 14.2.5 (App Router)
- **React**: 18.3.1
- **TypeScript**: 5.4.5
- **Styling**: Custom CSS (globals.css)
- **State Management**: React Hooks (useState, useEffect, useRef)

### Backend
- **Runtime**: Next.js API Routes (Edge Runtime)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **ORM**: Supabase Client (@supabase/supabase-js 2.84.0)

### Libraries
- **Excel Generation**: ExcelJS 4.4.0
- **YAML Parsing**: js-yaml 4.1.0
- **Linting**: ESLint 8.57.0 + eslint-config-next

### Deployment
- **Hosting**: Vercel
- **Database**: Supabase Cloud
- **Environment**: Production URL - https://estimator-app-zeta.vercel.app

---

## Архитектура

### Структура проекта
```
xmethod-backlog/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API Routes
│   │   │   ├── estimate/      # Excel generation endpoint
│   │   │   └── invite/        # User invitation endpoint
│   │   ├── estimator/         # Estimator page (standalone)
│   │   ├── login/             # Login page
│   │   ├── project/           # Project pages
│   │   │   ├── new/           # Create new project
│   │   │   └── [id]/          # Edit existing project
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Home page (project list)
│   ├── components/            # React components
│   │   ├── EpicEditor.tsx     # Epic and task editor
│   │   ├── EstimatorApp.tsx   # Main estimator component
│   │   ├── InviteModal.tsx    # User invitation modal
│   │   ├── StackMultiSelect.tsx # Stack selection component
│   │   └── YAMLPreview.tsx    # YAML preview component
│   └── lib/                   # Utilities and types
│       ├── excelBuilder.ts    # Excel file generation
│       ├── supabaseClient.ts  # Supabase client setup
│       ├── types.ts           # TypeScript types
│       └── yaml.ts            # YAML generation
├── public/                    # Static files
│   ├── defaults.yaml          # Default task templates
│   └── presets.yaml           # Preset task templates
├── supabase_migrations_all.sql # Database schema
├── SHARE_FEATURE.md           # Invitation system docs
└── package.json               # Dependencies
```

### Паттерны и подходы
- **Server Components**: Используются для статических страниц
- **Client Components**: Используются для интерактивных элементов (помечены "use client")
- **API Routes**: Обработка серверной логики (генерация Excel, приглашения)
- **RPC Functions**: Безопасный доступ к auth.users через Supabase
- **Optimistic Updates**: Локальное обновление состояния перед сохранением

---

## Функциональность

### 1. Аутентификация
- Вход через Supabase Auth
- Хранение сессии в localStorage
- Автоматическая проверка сессии при загрузке
- Редирект на /login при отсутствии сессии

### 2. Управление проектами

#### Создание проекта (3 шага)
**Шаг 1: Основная информация**
- Название проекта (обязательно)
- Дата создания (автозаполнение)
- Язык проекта (English / Русский)

**Шаг 2: Тип и стек**
- Выбор типа: Web или Mobile
- Мультивыбор стека:
  - Web: Weweb, Webflow, Supabase, Figma
  - Mobile: Flutterflow, Firebase, Supabase
- Валидация: требуется минимум 1 БД (кроме Webflow) + 1 инструмент

**Шаг 3: Эпики и задачи**

*Компактная панель информации (сверху):*
- Название проекта, тип, дата в одну строку
- Стек технологий (чипы)
- Кнопка "Изменить" для возврата к настройкам
- Минимальная высота, не занимает место

*Основная рабочая область (полная ширина):*
- Автогенерация эпиков на основе выбранного стека
- Редактирование эпиков и задач
- Drag & drop для изменения порядка
- Валидация полей (тип, название, оценка)
- Подсчёт времени по типам (BA, NC, DE)
- Индикатор сохранения (✓ Сохранено / ● Есть изменения)
- Кнопки: Назад, Пригласить, Показать участников, Сохранить, Скачать XLSX
- Список участников (при нажатии "Показать участников")

#### Редактирование проекта
- Открытие существующего проекта по ID
- Автоматический переход на шаг 3, если проект заполнен
- Сводка проекта всегда видна на шаге 3
- Предупреждение при закрытии с несохранёнными изменениями

#### Управление участниками проекта
**Список участников**
- Отображение всех участников проекта
- Показ роли (Владелец/Редактор/Просмотр)
- Показ email пригласившего
- Кнопка удаления (только для владельца)

**Удаление участника**
- Доступно только владельцу проекта
- Нельзя удалить себя
- Нельзя удалить владельца
- Подтверждение перед удалением

#### Список проектов
**Мои проекты**
- Проекты, где пользователь - владелец
- Отображение названия и даты создания
- Клик для открытия

**Гостевые проекты**
- Проекты, в которые пользователь приглашён
- Отображение email пригласившего
- Визуальное отличие (синий фон)

### 3. Система приглашений

#### Приглашение пользователя
- Кнопка "Пригласить" (только для владельца)
- Модальное окно с вводом email
- Поиск пользователя в базе по email
- Добавление в project_members с ролью "viewer"
- Сохранение email приглашающего

#### Роли пользователей
- **owner**: Владелец проекта, может приглашать и удалять участников
- **editor**: Участник проекта, может редактировать эпики и задачи, но не может приглашать/удалять других

### 4. Публичные ссылки на превью

#### Кнопка "Скопировать ссылку"
- Доступна только владельцу проекта
- Мгновенно копирует ссылку в буфер обмена
- Формат: `https://domain.com/project/{id}/preview`

#### Страница превью `/project/[id]/preview`
- Доступна БЕЗ авторизации
- Read-only режим (только просмотр)
- Показывает:
  - Название проекта, тип, дату
  - Стек технологий
  - Все эпики и задачи с оценками
  - Статистику времени (BA, NC, DE, Всего)

#### Логика доступа
- Простое правило: знаешь ID проекта → можешь посмотреть превью
- Никаких дополнительных настроек не требуется
- ID проекта - это UUID (сложно угадать случайно)

#### Два способа поделиться
**Ссылка на превью:**
- Быстрая демонстрация
- Не требует авторизации
- Только просмотр

**Приглашение:**
- Совместная работа
- Требует регистрации
- Полный доступ к редактированию

### 5. Генерация шаблонов

#### Defaults (defaults.yaml)
Автоматические шаблоны задач на основе стека:
- **mobile**: Базовые задачи для мобильных приложений
- **web**: Базовые задачи для веб-приложений
- **webflow**: Специфичные задачи для Webflow
- **weweb**: Специфичные задачи для WeWeb
- **flutterflow**: Специфичные задачи для Flutterflow
- **integrations**: Дополнительные интеграции (RevenueCat)

#### Presets (presets.yaml)
Готовые шаблоны для типовых функций:
- Onboarding
- User profile
- Notifications

#### Логика генерации
1. Выбор базового шаблона (mobile/web/webflow/weweb/flutterflow)
2. Подстановка backend (Firebase/Supabase) в плейсхолдеры
3. Добавление integrations (для mobile - перед deploy)
4. Создание уникальных ID для эпиков и задач

### 6. Экспорт в Excel

#### Формат файла
- Название: `{ProjectName}_Estimate_{Date}.xlsx`
- Листы: по одному на каждый эпик
- Колонки: Type, Task, Estimate (hours), Comment

#### Структура
- Заголовок с названием проекта и датой
- Таблица задач с форматированием
- Итоговая строка с суммой часов
- Автоширина колонок

#### Генерация
- POST запрос на `/api/estimate`
- Серверная генерация через ExcelJS
- Автоматическая загрузка файла в браузере

---

## API Endpoints

### POST /api/estimate
Генерация Excel файла с оценкой проекта.

**Request Body:**
```json
{
  "project": {
    "name": "Project Name",
    "date": "2025-11-21",
    "type": "Web",
    "stack": ["Weweb", "Supabase"]
  },
  "epics": [
    {
      "id": "epic_abc123",
      "title": "Epic Title",
      "tasks": [
        {
          "id": "t_xyz789",
          "type": "DE",
          "title": "Task Title",
          "estimate": 8,
          "comment": "Optional comment"
        }
      ]
    }
  ]
}
```

**Response:**
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="ProjectName_Estimate_2025-11-21.xlsx"`
- Body: Binary Excel file

**Errors:**
- 400: Invalid request body
- 500: Excel generation failed

---

---

### POST /api/invite
Приглашение пользователя в проект.

**Request Body:**
```json
{
  "projectId": "uuid",
  "email": "user@example.com",
  "accessToken": "supabase_access_token"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Пользователь приглашён"
}
```

**Response (Error):**
```json
{
  "error": "Error message"
}
```

**Status Codes:**
- 200: Success
- 400: Missing parameters or user already added
- 401: Unauthorized
- 403: Only owner can invite
- 404: User not found
- 500: Server error

**Validation:**
- Проверка авторизации через accessToken
- Проверка роли (только owner может приглашать)
- Поиск пользователя через RPC функцию
- Проверка на дубликаты

---

### POST /api/remove-member
Удаление участника из проекта.

**Request Body:**
```json
{
  "memberId": "bigint",
  "projectId": "uuid",
  "accessToken": "supabase_access_token"
}
```

**Response (Success):**
```json
{
  "success": true
}
```

**Response (Error):**
```json
{
  "error": "Error message"
}
```

**Status Codes:**
- 200: Success
- 400: Missing parameters, cannot remove owner/self
- 401: Unauthorized
- 403: Only owner can remove members
- 404: Member not found
- 500: Server error

**Validation:**
- Проверка авторизации через accessToken
- Проверка роли (только owner может удалять)
- Нельзя удалить владельца проекта
- Нельзя удалить себя

---

## База данных

### Схема (PostgreSQL + Supabase)

#### Таблица: projects
```sql
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Поля:**
- `id`: Уникальный идентификатор проекта
- `owner_id`: ID владельца из auth.users
- `name`: Название проекта
- `payload`: JSON с полными данными проекта (project + epics)
- `created_at`: Дата создания
- `updated_at`: Дата последнего обновления

---

#### Таблица: project_members
```sql
CREATE TABLE public.project_members (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active',
  invited_by UUID REFERENCES auth.users(id),
  invited_by_email TEXT,
  
  UNIQUE(project_id, user_id),
  CHECK (role IN ('owner', 'editor', 'viewer')),
  CHECK (status IN ('pending', 'active'))
);
```

**Поля:**
- `id`: Уникальный идентификатор записи
- `project_id`: ID проекта
- `user_id`: ID пользователя
- `role`: Роль (owner/editor/viewer)
- `status`: Статус (pending/active)
- `invited_by`: ID пригласившего пользователя
- `invited_by_email`: Email пригласившего (для отображения)

**Индексы:**
```sql
CREATE INDEX project_members_project_id_idx ON project_members(project_id);
CREATE INDEX project_members_user_id_idx ON project_members(user_id);
CREATE INDEX idx_project_members_user_invited ON project_members(user_id, invited_by);
```

---

#### RPC Функции

**find_user_id_by_email**
```sql
CREATE OR REPLACE FUNCTION find_user_id_by_email(user_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID;
BEGIN
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;
  
  RETURN user_id;
END;
$$;
```

**Назначение:** Безопасный поиск пользователя по email в таблице auth.users

**Права:** Доступна authenticated пользователям

**get_user_email_by_id**
```sql
CREATE OR REPLACE FUNCTION get_user_email_by_id(user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = user_id
  LIMIT 1;
  
  RETURN user_email;
END;
$$;
```

**Назначение:** Получение email пользователя по ID для отображения списка участников

**Права:** Доступна authenticated пользователям

---

## Типы данных

### TypeScript Types

```typescript
// Тип проекта
type ProjectType = "Web" | "Mobile";

// Тип задачи
type SubtaskType = "" | "BA" | "NC" | "DE";
// BA - Business Analysis
// NC - No Code
// DE - Development

// Язык проекта
type ProjectLanguage = "en" | "ru";
// en - English
// ru - Русский

// Метаданные проекта
interface ProjectMeta {
  name: string;           // Название проекта
  date: string;           // Дата в формате YYYY-MM-DD
  type: ProjectType;      // Тип проекта
  stack: string[];        // Выбранный стек технологий
  language: ProjectLanguage; // Язык проекта
}

// Задача (подзадача эпика)
interface Subtask {
  id: string;             // Уникальный ID
  type: SubtaskType;      // Тип задачи
  title: string;          // Название задачи
  estimate?: number;      // Оценка в часах
  comment?: string;       // Комментарий
}

// Эпик (группа задач)
interface Epic {
  id: string;             // Уникальный ID
  title: string;          // Название эпика
  tasks: Subtask[];       // Список задач
}

// Полное состояние приложения
interface AppState {
  project: ProjectMeta;   // Метаданные проекта
  epics: Epic[];          // Список эпиков
}
```

### Стеки технологий

**Web Presets:**
- Weweb
- Webflow
- Supabase
- Figma

**Mobile Presets:**
- Flutterflow
- Firebase
- Supabase

**Custom:** Пользователь может добавить кастомные технологии с префиксом "Custom:"

---

## Компоненты

### EstimatorApp
**Путь:** `src/components/EstimatorApp.tsx`

**Props:**
```typescript
{
  initialState?: AppState;           // Начальное состояние (для редактирования)
  onSave?: (state: AppState) => Promise<void>;  // Callback сохранения
  onClose?: () => void;              // Callback закрытия
  projectId?: string;                // ID проекта (для приглашений)
  currentUserId?: string;            // ID текущего пользователя
  isOwner?: boolean;                 // Является ли пользователь владельцем
}
```

**Функциональность:**
- Управление состоянием проекта
- Единый интерфейс (без шагов)
- Компактная конфигурация проекта
- Автогенерация эпиков при выборе стека
- Валидация данных
- Экспорт в Excel
- Приглашение пользователей
- Управление участниками проекта

---

### ProjectConfig
**Путь:** `src/components/ProjectConfig.tsx`

**Props:**
```typescript
{
  state: AppState;                   // Текущее состояние
  onUpdate: (updates: Partial<AppState["project"]>) => void; // Callback обновления
  presets: readonly string[];        // Доступные пресеты стека
  onStackChange: (stack: string[]) => void; // Callback изменения стека
}
```

**Функциональность:**
- Компактная форма настроек проекта
- Название, дата, тип, стек
- Валидация стека
- Переключатели Web/Mobile

---

### ProjectMembers
**Путь:** `src/components/ProjectMembers.tsx`

**Props:**
```typescript
{
  projectId: string;                 // ID проекта
  currentUserId: string;             // ID текущего пользователя
  isOwner: boolean;                  // Является ли владельцем
}
```

**Функциональность:**
- Загрузка списка участников
- Отображение роли и email
- Показ пригласившего
- Удаление участников (только для владельца)
- Защита от удаления себя/владельца

---

### EpicEditor
**Путь:** `src/components/EpicEditor.tsx`

**Props:**
```typescript
{
  value: Epic[];                     // Список эпиков
  onChange: (epics: Epic[]) => void; // Callback изменения
  errors?: ValidationMap;            // Ошибки валидации
}
```

**Функциональность:**
- Двухпанельный интерфейс (список эпиков + редактор)
- Drag & drop для эпиков и задач
- Добавление/удаление эпиков и задач
- Валидация полей
- Подсветка ошибок

---

### InviteModal
**Путь:** `src/components/InviteModal.tsx`

**Props:**
```typescript
{
  isOpen: boolean;                   // Открыто/закрыто
  onClose: () => void;               // Callback закрытия
  onInvite: (email: string) => Promise<void>; // Callback приглашения
}
```

**Функциональность:**
- Модальное окно с backdrop
- Форма ввода email
- Валидация email
- Закрытие по Escape/backdrop/кнопке
- Анимации появления/исчезновения

---

### StackMultiSelect
**Путь:** `src/components/StackMultiSelect.tsx`

**Props:**
```typescript
{
  value: string[];                   // Выбранные технологии
  onChange: (stack: string[]) => void; // Callback изменения
  presets: readonly string[];        // Доступные пресеты
}
```

**Функциональность:**
- Мультивыбор из пресетов
- Добавление кастомных технологий
- Визуальное отображение выбранных элементов
- Ограничение на одну БД (Firebase или Supabase)

---

### YAMLPreview
**Путь:** `src/components/YAMLPreview.tsx`

**Props:**
```typescript
{
  value: string;                     // YAML строка для отображения
}
```

**Функциональность:**
- Отображение YAML в textarea
- Read-only режим
- Моноширинный шрифт

---

### ProjectPreviewPage
**Путь:** `src/app/project/[id]/preview/page.tsx`

**Параметры:**
- `id` - UUID проекта из URL

**Функциональность:**
- Загрузка проекта БЕЗ авторизации
- Красивое отображение в read-only режиме
- Показ всех эпиков и задач
- Статистика времени по типам
- Обработка ошибок (проект не найден)

**Доступ:**
- Публичная страница (без авторизации)
- Если знаешь ID проекта, можешь посмотреть

---

## Конфигурация

### Environment Variables
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional: Service Role Key (для admin операций)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Next.js Config
- App Router (Next.js 14+)
- TypeScript strict mode
- ESLint с next/core-web-vitals

### Supabase Config
- Auth: Email/Password
- Database: PostgreSQL 15
- Storage: Не используется
- Edge Functions: Не используются

---

## Workflow

### Создание нового проекта
1. Пользователь нажимает "Создать новый проект"
2. Заполняет название и дату (Шаг 1)
3. Выбирает тип и стек (Шаг 2)
4. Система генерирует эпики на основе defaults.yaml
5. Видит сводку проекта вверху (Шаг 3)
6. Редактирует эпики и задачи
7. Нажимает "Сохранить проект"
8. API создаёт запись в projects и project_members
9. Редирект на страницу редактирования проекта

### Редактирование проекта
1. Пользователь открывает проект из списка
2. Загружается payload из базы
3. Автоматически открывается шаг 3 (эпики)
4. Сводка проекта отображается вверху
5. Может вернуться на шаги 1-2 через кнопку "Изменить" или "Назад"
6. Редактирует эпики и задачи
7. Нажимает "Сохранить проект"
8. Индикатор показывает статус сохранения

### Управление участниками
1. Владелец открывает проект
2. Нажимает "Показать участников"
3. Видит список всех участников с ролями
4. Может удалить участника (кроме себя и владельца)
5. Нажимает "Пригласить" для добавления нового участника

### Приглашение пользователя
1. Владелец открывает проект
2. Нажимает "Пригласить"
3. Вводит email в модальном окне
4. API ищет пользователя через RPC
5. Добавляет запись в project_members
6. Приглашённый видит проект в "Гостевых"

### Поделиться проектом (превью)
1. Владелец открывает проект
2. Нажимает "Скопировать ссылку"
3. Ссылка копируется в буфер обмена
4. Отправляет ссылку кому угодно
5. Получатель открывает `/project/{id}/preview`
6. Видит красивую страницу с проектом (read-only)

### Экспорт в Excel
1. Пользователь нажимает "Скачать XLSX"
2. Система валидирует все поля
3. POST запрос на /api/estimate
4. Сервер генерирует Excel через ExcelJS
5. Файл автоматически скачивается

---

## Безопасность

### Аутентификация
- Все API routes проверяют accessToken
- Сессия хранится в Supabase Auth
- Автоматический logout при истечении сессии

### Авторизация
- Проверка прав через project_members
- Только owner может приглашать
- RPC функции с SECURITY DEFINER для безопасного доступа к auth.users

### Публичные ссылки
- Страница `/project/[id]/preview` доступна без авторизации
- Read-only режим (нельзя редактировать)
- ID проекта - это UUID (сложно угадать случайно)
- Нет списка всех проектов - нужно знать конкретный ID

### Валидация
- Client-side валидация перед отправкой
- Server-side валидация в API routes
- TypeScript для type safety

### SQL Injection
- Использование Supabase Client (параметризованные запросы)
- RPC функции вместо прямых SQL запросов

---

## Производительность

### Оптимизации
- Server Components для статического контента
- Client Components только где необходимо
- Индексы на часто запрашиваемые поля
- Хранение invited_by_email для избежания N+1 запросов
- Lazy loading компонентов

### Кэширование
- Next.js автоматическое кэширование статики
- Supabase connection pooling
- Browser cache для YAML файлов

---

## Развёртывание

### Vercel
1. Подключить GitHub репозиторий
2. Настроить environment variables
3. Автоматический deploy при push в main

### Supabase
1. Создать проект в Supabase
2. Выполнить supabase_migrations_all.sql
3. Настроить Auth providers
4. Скопировать URL и anon key в .env.local

---

## Известные ограничения

1. **Приглашения**: Пользователь должен быть зарегистрирован
2. **Роли**: Только owner может приглашать (editor/viewer - read-only)
3. **Offline**: Требуется интернет-соединение
4. **Concurrent editing**: Нет real-time синхронизации
5. **File size**: Excel ограничен размером payload

---

## История версий

### Версия 1.2 (21 ноября 2025)
**Публичные ссылки на превью**
- ✅ Кнопка "Скопировать ссылку" для владельца
- ✅ Страница `/project/[id]/preview` без авторизации
- ✅ Красивое отображение проекта в read-only режиме
- ✅ Простая логика: знаешь ID → можешь смотреть

**Выбор языка проекта**
- ✅ Выбор языка на шаге 1 (English / Русский)
- ✅ Отображение языка в сводке проекта
- ✅ Отображение языка на странице превью
- ✅ Подготовка для мультиязычных шаблонов

**Realtime Collaboration**
- ✅ Presence - кто сейчас в проекте
- ✅ Индикаторы редактирования (аватарки в эпиках/задачах)
- ✅ Синхронизация изменений в реальном времени
- ✅ Разрешение конфликтов (Last Write Wins)
- ✅ Reorder событий (drag & drop)
- ✅ Debounce для isTyping
- ✅ Реконнект при потере соединения
- ✅ Блок "Сейчас в проекте" с аватарками

### Версия 1.1 (21 ноября 2025)
**Улучшения интерфейса:**
- ✅ Компактная панель информации сверху
- ✅ Полная ширина для рабочей области с эпиками
- ✅ Кнопка "Изменить" для быстрого возврата к настройкам
- ✅ Автоматический переход на шаг 3 при открытии заполненного проекта
- ✅ Модальное окно для приглашений

**Управление участниками:**
- ✅ Список участников проекта
- ✅ Удаление участников (только для владельца)
- ✅ API endpoint `/api/remove-member`
- ✅ RPC функция `get_user_email_by_id`
- ✅ Защита от удаления себя/владельца

**Улучшения UX:**
- ✅ Показ статистики времени в реальном времени
- ✅ Кнопка "Показать/Скрыть участников"
- ✅ Максимальная ширина для работы с эпиками (1280px)
- ✅ Умная навигация (пропуск заполненных шагов)
- ✅ Адаптивный дизайн с flexbox

---

## Версия
**Текущая версия:** 1.2  
**Дата:** 21 ноября 2025  
**Автор:** XMethod Team
