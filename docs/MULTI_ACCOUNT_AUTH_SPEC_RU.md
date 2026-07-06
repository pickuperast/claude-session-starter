# Техническая спецификация: мульти-авторизация и переключение Codex-аккаунтов

Репозиторий: D:\Documents\GitHub\codex-multi-auth


## 1. Цель

`codex-multi-auth` добавляет поверх официального `@openai/codex` локальный слой управления несколькими ChatGPT/Codex OAuth-аккаунтами.

Система решает две отдельные задачи:

1. Хранить пул нескольких аккаунтов, а не один `auth.json`.
2. Уметь переключать активный аккаунт:
   - явно, через CLI (`switch`, `best`, login dashboard),
   - неявно, во время выполнения запросов, через локальный runtime-proxy.

Важно: проект не подменяет официальный OAuth-поток OpenAI. Он использует официальный login flow, но сохраняет результат в собственное локальное хранилище и синхронизирует выбранный аккаунт обратно в файлы официального Codex CLI.

## 2. Архитектурная идея

Мульти-авторизация реализована как обвязка вокруг официального Codex CLI, а не как модификация самого CLI.

Есть три уровня:

1. `codex-multi-auth`:
   локальный менеджер аккаунтов, который делает login/list/status/switch/best и работает со своим storage.
2. `codex-multi-auth-codex`:
   wrapper над официальным `codex`, который умеет:
   - обрабатывать auth-команды локально,
   - все остальные команды форвардить в официальный CLI,
   - при необходимости поднимать runtime rotation proxy.
3. `runtime-rotation-proxy`:
   loopback-only HTTP proxy на `127.0.0.1`, через который forwarded Codex-сессия может отправлять Responses API запросы, а proxy уже сам выбирает, какой аккаунт использовать на конкретный запрос.

Ключевой вывод: “мульти-аккаунтность” живет не внутри одного `auth.json`, а в отдельном storage + в локальном selection/runtime layer.

## 3. Основные компоненты

### 3.1 Account manager

Основной класс: `lib/accounts.ts`.

Он держит в памяти:

- массив `accounts`,
- `activeIndex`,
- `activeIndexByFamily`,
- `pinnedAccountIndex`,
- `affinityGeneration`,
- runtime-состояние rate limit / cooldown / circuit breaker / workspace state.

Загрузка пула идет через `AccountManager.loadFromDisk()`, который:

1. читает локальный storage,
2. при необходимости синхронизирует состояние с официальным Codex CLI,
3. гидратит access token cache из Codex CLI,
4. создает runtime-ready представление аккаунтов.

См.:

- `lib/accounts.ts`
- `lib/storage.ts`
- `lib/codex-cli/sync.ts`

### 3.2 Локальное хранилище аккаунтов

Каноническое хранилище:

- `~/.codex/multi-auth/openai-codex-accounts.json`

Дополнительно используются:

- `~/.codex/multi-auth/openai-codex-flagged-accounts.json`
- `~/.codex/multi-auth/quota-cache.json`
- `~/.codex/multi-auth/runtime-observability.json`
- `~/.codex/multi-auth/projects/<project-key>/openai-codex-accounts.json`

Формат storage описан в:

- `lib/storage/public-types.ts`
- `lib/schemas.ts`

Актуальная версия storage: `version: 3`.

Ключевые поля:

- `accounts[]`
- `activeIndex`
- `activeIndexByFamily`
- `pinnedAccountIndex`
- `affinityGeneration`

Каждый аккаунт хранит:

- `refreshToken`
- `accessToken`
- `expiresAt`
- `accountId`
- `accountIdSource`
- `email`
- `enabled`
- `lastUsed`
- `lastSwitchReason`
- `rateLimitResetTimes`
- `coolingDownUntil`
- `workspaces[]`
- `currentWorkspaceIndex`

### 3.3 Синхронизация с официальным Codex CLI

После выбора активного аккаунта система пытается синхронизировать его в официальные файлы Codex CLI:

- `~/.codex/auth.json`
- `~/.codex/accounts.json`
- `~/.codex/config.toml`

Это делает `setCodexCliActiveSelection()` в `lib/codex-cli/writer.ts`.

Логика:

1. Найти matching account в `accounts.json` по `accountId` или `email`.
2. Обновить flags `active/isActive/is_active`.
3. Обновить токены у выбранной записи.
4. Обновить `auth.json`.
5. При необходимости принудить file-backed auth store через `config.toml`.

Таким образом, обычный официальный Codex после переключения продолжает видеть “правильный” активный аккаунт.

## 4. Как добавляют несколько аккаунтов

### 4.1 Login flow

Login использует официальный OAuth OpenAI:

- authorize URL,
- token exchange,
- PKCE,
- callback на `http://localhost:1455/auth/callback`.

См.:

- `lib/auth/auth.ts`
- `lib/auth/server.ts`
- `lib/codex-manager/login-oauth.ts`

После успешного OAuth:

1. извлекаются `access`, `refresh`, `expires`, `idToken`,
2. из токена извлекаются `accountId`, `email`, доступные workspaces,
3. подбирается лучший `accountId` или применяется `--org` override,
4. результат записывается в локальный account pool.

Сохранение в пул делает `persistAccountPool()` / `applyAccountPoolResults()`:

- новая учетка добавляется, если match не найден,
- существующая запись обновляется, если match найден по identity,
- `activeIndex` и `activeIndexByFamily` нормализуются под текущий размер пула.

См.:

- `lib/codex-manager/login-oauth.ts`
- `lib/codex-manager/account-pool-write.ts`

### 4.2 Идентификация аккаунта

Чтобы не плодить дубликаты, проект матчит аккаунты не по одному полю, а по комбинации:

- `accountId`
- `email`
- `refreshToken`

Это реализовано через:

- `findMatchingAccountIndex(...)`
- `findAccountIndexByIdentity(...)`

Такой подход нужен, потому что:

- email может быть одинаковым у разных workspace,
- `accountId` может появляться позже после refresh,
- refresh token лучше отражает конкретную OAuth-сессию.

## 5. Как работает явное переключение аккаунта

### 5.1 Команда `switch`

Команда:

```bash
codex-multi-auth switch <index>
```

Реализация:

- `lib/codex-manager/commands/switch.ts`
- `lib/codex-manager/persist-selected-account.ts`

Алгоритм:

1. Загружается storage.
2. Проверяется, что индекс валиден.
3. Вызывается `persistAndSyncSelectedAccount(...)`.

Что делает `persistAndSyncSelectedAccount(...)`:

1. Ставит `storage.activeIndex = targetIndex`.
2. Обновляет `activeIndexByFamily` для всех model family.
3. При необходимости re-enable отключенный аккаунт.
4. Если access token устарел, пытается refresh до sync.
5. Обновляет `lastUsed` и `lastSwitchReason = "manual"`.
6. Ставит `pinnedAccountIndex = targetIndex`.
7. Увеличивает `affinityGeneration`.
8. Сохраняет storage на диск.
9. Пытается синхронизировать выбор в официальный Codex CLI через `setCodexCliActiveSelection(...)`.

### 5.2 Почему `switch` не просто меняет `activeIndex`

`switch` одновременно выполняет две задачи:

1. Делает аккаунт активным для обычных CLI-сценариев.
2. Пинит аккаунт для runtime rotation proxy.

Именно поэтому пишутся:

- `pinnedAccountIndex`
- `affinityGeneration`

Смысл:

- `pinnedAccountIndex` говорит proxy: использовать только этот аккаунт.
- `affinityGeneration` говорит proxy: пользователь сделал ручное переключение, значит старую session affinity надо сбросить.

## 6. Как работает автоматический выбор лучшего аккаунта

Команда:

```bash
codex-multi-auth best
```

Реализация:

- `lib/codex-manager/commands/best.ts`

Она:

1. оценивает аккаунты по forecast/health/quota,
2. выбирает рекомендуемый,
3. вызывает тот же `persistAndSyncSelectedAccount(...)`, но с `switchReason: "best"`.

То есть `best` меняет активный аккаунт так же, как `switch`, только источник выбора не пользовательский индекс, а локальный scoring.

## 7. Как работает переключение аккаунта во время живой сессии

### 7.1 Wrapper path

Если пользователь запускает команды через:

```bash
codex-multi-auth-codex ...
```

wrapper в `scripts/codex.js` может включить runtime rotation.

Сценарий:

1. Поднимается локальный proxy через `startRuntimeRotationProxy(...)`.
2. Создается временный shadow `CODEX_HOME`.
3. В shadow `config.toml` прописывается provider `codex-multi-auth-runtime-proxy`.
4. Официальный Codex CLI продолжает работать как обычно, но его Responses API идут не напрямую в OpenAI, а в локальный proxy.

Реализация:

- `scripts/codex.js`
- `lib/runtime/config-toml.ts`
- `lib/runtime-rotation-proxy.ts`

### 7.2 Shadow `CODEX_HOME`

Система не трогает основной `~/.codex` на время forwarded-сессии напрямую.

Она:

1. создает временную копию/зеркало `CODEX_HOME`,
2. переписывает в ней `config.toml`,
3. после завершения сессии синхронизирует нужные state-файлы обратно,
4. удаляет shadow home.

Это позволяет безопасно внедрить runtime proxy без необратимого изменения официальной конфигурации.

### 7.3 Proxy selection loop

Главная логика выбора аккаунта находится в:

- `lib/runtime-rotation-proxy.ts`
- `lib/runtime/rotation-account-selection.ts`

Proxy на каждый request:

1. валидирует локальный client token,
2. читает request context,
3. читает `pinnedAccountIndex` и `affinityGeneration` из storage,
4. при росте `affinityGeneration` сбрасывает session affinity,
5. выбирает аккаунт через `chooseAccount(...)`,
6. при необходимости refresh token,
7. подменяет upstream auth headers токенами выбранного аккаунта,
8. отправляет запрос в OpenAI backend.

### 7.4 Порядок выбора аккаунта

При выборе действует такой приоритет:

1. `pinnedAccountIndex`, если выставлен вручную.
2. `sequential` mode, если включен.
3. Session affinity.
4. Hybrid selection / scoring.
5. Линейный fallback scan по пулу.

Если включен manual pin, proxy не должен сам “перетереть” этот выбор.

### 7.5 Когда proxy переключает аккаунт автоматически

Proxy может перейти на другой аккаунт до начала stream-ответа, если видит:

- `429` rate limit,
- refresh/auth failure,
- network error,
- `5xx` server error,
- workspace-disabled scenario.

При этом он обновляет runtime state:

- cooldown,
- rate-limit windows,
- retry counters,
- last selected account,
- observability snapshot.

## 8. Как proxy узнает о ручном `switch` без перезапуска

Это один из ключевых технических элементов.

Проблема:

- `switch` выполняется отдельным CLI-процессом,
- proxy уже запущен в другом процессе,
- перезапускать proxy ради каждого switch нельзя.

Решение:

1. CLI записывает в storage:
   - `pinnedAccountIndex`
   - `affinityGeneration`
2. Proxy на каждом запросе читает только эти top-level поля через `readStorageMetaFromDisk()`.
3. Если `affinityGeneration` вырос:
   - proxy сбрасывает session affinity,
   - начинает использовать новый pin.

Важно, что `rotation-storage-meta.ts` читает только небольшой верхнеуровневый meta-snapshot, а не перезагружает весь `AccountManager`.

Это снижает стоимость hot path и не теряет накопленное runtime-состояние.

## 9. Защита от гонок и порчи состояния

В проекте есть несколько защитных механизмов.

### 9.1 Atomic persistence

Сохранение account storage идет через:

- temp file,
- WAL/journal,
- atomic rename,
- backup rotation.

См.:

- `lib/storage/account-save.ts`
- `lib/storage.ts`

### 9.2 Routing mutex

При `routingMutex = "enabled"` выбор аккаунта и commit cursor state сериализуются через mutex.

Это защищает от ситуации, когда два параллельных запроса одновременно выберут один и тот же аккаунт до фиксации cursor state.

См.:

- `lib/routing-mutex.ts`
- `lib/runtime-rotation-proxy.ts`
- `lib/accounts.ts`

### 9.3 Debounced save

Runtime-обновления не всегда сразу пишутся на диск. Для частых изменений используется `saveToDiskDebounced()`.

Это уменьшает churn по файлам, но при критичных сценариях есть `flushPendingSave()`.

### 9.4 Recovery after stale state

Если весь пул “залип” в transient error state, proxy умеет:

1. reload `AccountManager` с диска,
2. сбросить volatile runtime-state,
3. очистить transient cooldown/rate-limit state,
4. продолжить selection с “чистого” состояния.

См.:

- `lib/runtime/rotation-proxy-state.ts`

## 10. Per-project accounts

Система поддерживает отдельные пулы аккаунтов для разных проектов.

Если включен `perProjectAccounts`, storage path выбирается не глобально, а под project key:

- `~/.codex/multi-auth/projects/<project-key>/openai-codex-accounts.json`

Project key строится детерминированно из project root.
Для git worktree используется общий identity root репозитория, чтобы разные worktree могли делить один и тот же аккаунтный пул.

См.:

- `lib/runtime/account-scope.ts`
- `lib/storage/paths.ts`

Важно: если включена синхронизация с официальным Codex CLI, используется глобальный pool, потому что сам официальный CLI не знает о per-project account storage.

## 11. Что именно означает “сменить аккаунт” в этой системе

В проекте есть три разных смысла “переключения аккаунта”.

### 11.1 Переключить активный аккаунт в storage и Codex CLI

Это делают:

- `switch`
- `best`
- login dashboard

Результат:

- меняется `activeIndex`,
- ставится `pinnedAccountIndex`,
- синхронизируются `~/.codex/auth.json` и `accounts.json`.

### 11.2 Переключить аккаунт только на один runtime request

Это делает proxy автоматически при failover.

Результат:

- forwarded Codex request уходит через другой аккаунт,
- пользователь может даже не видеть этого как явный “switch”.

### 11.3 Сменить workspace внутри одного логина

Если в токене есть несколько workspaces/orgs, аккаунт хранит `workspaces[]` и `currentWorkspaceIndex`.

Тогда система может:

- отключить текущий workspace,
- переключиться на следующий доступный workspace,
- не создавать новый “email account” для каждого workspace вручную.

## 12. Итоговая схема

Мульти-авторизация в `codex-multi-auth` сделана не через хранение “нескольких auth.json”, а через отдельный менеджер аккаунтов со своим storage и с двумя каналами переключения:

1. Control plane:
   `login`, `list`, `switch`, `best`, `status`.
2. Data plane:
   localhost runtime proxy для live request routing.

Явное переключение делает пользователь:

- команда `switch`,
- команда `best`,
- dashboard login/menu.

Неявное переключение делает runtime:

- на rate limit,
- на auth/network/server failure,
- с учетом pin, affinity, policy и quota state.

За счет этого достигаются сразу оба режима:

- “сейчас хочу работать от аккаунта №2”,
- “если аккаунт №2 уперся в лимит, тихо переведи конкретный запрос на другой аккаунт”.

## 13. Основные файлы для аудита

Если нужно быстро проверить реализацию по коду, начинать стоит отсюда:

- `scripts/codex-multi-auth.js`
- `scripts/codex.js`
- `lib/accounts.ts`
- `lib/codex-manager/commands/switch.ts`
- `lib/codex-manager/persist-selected-account.ts`
- `lib/codex-manager/login-oauth.ts`
- `lib/runtime-rotation-proxy.ts`
- `lib/runtime/rotation-account-selection.ts`
- `lib/runtime/rotation-storage-meta.ts`
- `lib/codex-cli/writer.ts`
- `lib/storage/public-types.ts`
- `lib/storage/paths.ts`
