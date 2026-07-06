# Техническая спецификация: адаптация multi-account Codex в `claude-session-starter`

Репозиторий: `D:\Documents\GitHub\claude-session-starter`

Связанный документ-источник: `docs/MULTI_ACCOUNT_AUTH_SPEC_RU.md`

## 1. Цель

Нужно адаптировать идеи из `codex-multi-auth` под текущий проект так, чтобы:

1. хранить несколько Codex/OpenAI-аккаунтов, а не один токен в `.env`;
2. добавить использование установленной команды `codex` как дополнительного runtime для отправки сообщений, с выбором через `.env`;
3. по расписанию, как сейчас делает `scheduler.js`, каждый день отправлять служебное сообщение по всем сохраненным Codex-аккаунтам;
4. иметь явную ручную авторизацию нескольких аккаунтов до запуска Docker;
5. хранить токены и auth-state в локальном файле внутри репозитория, но не синхронизировать их через GitHub;
6. после заполнения локального storage запускать Docker-контейнер, который уже крутит scheduler.

## 2. Целевой operational pipeline

Ниже зафиксирован pipeline, который должен считаться основным рабочим сценарием:

1. пользователь вручную обновляет локальный репозиторий;
2. пользователь вручную запускает команду авторизации Codex;
3. после успешной авторизации первого аккаунта его токены и метаданные записываются в локальный storage внутри репозитория;
4. пользователь повторяет авторизацию для второго, третьего и последующих аккаунтов;
5. все сохраненные токены лежат только локально и не отслеживаются Git;
6. только после этого пользователь поднимает Docker-контейнер;
7. scheduler в заданное время последовательно проходит по всем сохраненным аккаунтам и отправляет сообщение от каждого аккаунта.

Это ключевое требование для всей реализации. Архитектура и код должны подчиняться именно этому pipeline.

## 3. Что есть в проекте сейчас

Текущее состояние проекта:

- [`scheduler.js`](/D:/Documents/GitHub/claude-session-starter/scheduler.js) запускает cron-задачи через `node-cron`;
- отправка сообщения сейчас сделана через `@anthropic-ai/claude-agent-sdk`;
- авторизация завязана на один `CLAUDE_CODE_OAUTH_TOKEN` из `.env`;
- [`test.js`](/D:/Documents/GitHub/claude-session-starter/test.js) проверяет single-account flow;
- Docker и deploy тоже ожидают один токен.

Вывод: текущая архитектура простая, и для этой задачи не нужен полный перенос `runtime-rotation-proxy` из `codex-multi-auth`. Для нашего сценария достаточно control plane для хранения нескольких аккаунтов, ручного импорта логинов и batch-обхода аккаунтов в scheduler.

## 4. Что переносим из `MULTI_ACCOUNT_AUTH_SPEC_RU.md`

Из исходной спецификации переносим следующие принципы:

1. canonical storage с пулом аккаунтов;
2. отдельный account manager поверх официального `codex`, а не форк самого CLI;
3. команды `login`, `list`, `switch`, `status`;
4. синхронизацию выбранного аккаунта в локальный `CODEX_HOME`;
5. хранение `activeIndex`, `pinnedAccountIndex`, `lastUsed`, `enabled`, `cooldownUntil`;
6. возможность расширить решение до fallback и более сложной ротации.

Не переносим в MVP:

1. runtime HTTP proxy;
2. session affinity;
3. сложный routing mutex;
4. per-request hot switching внутри одной живой сессии.

Причина простая: здесь scheduler работает дискретными job-ами, а не как long-lived runtime.

## 5. Целевая архитектура

Предлагаемая схема состоит из четырех уровней.

### 5.1 Scheduler layer

Сохраняем роль [`scheduler.js`](/D:/Documents/GitHub/claude-session-starter/scheduler.js):

- читает расписание;
- формирует prompt;
- вызывает provider-адаптер;
- логирует результат.

Но для `codex`-режима scheduler больше не работает по схеме "один активный аккаунт на один cron-run". Вместо этого он должен выполнять batch-run по всем сохраненным аккаунтам.

### 5.2 Provider layer

Нужны два provider-а:

1. `claude` для обратной совместимости;
2. `codex` для нового режима.

Выбор провайдера задается через `.env`.

Для Codex scheduler должен уметь:

- либо запускаться только для `codex`;
- либо пропускать `claude`, если он выключен флагом;
- либо в будущем поддерживать несколько провайдеров, но текущий основной сценарий здесь именно `codex`.

### 5.3 Account manager layer

Новый слой управляет Codex-аккаунтами:

- импортирует аккаунт после `codex login`;
- хранит локальный пул аккаунтов;
- позволяет посмотреть список аккаунтов;
- позволяет вручную переключить активный аккаунт;
- возвращает список всех enabled-аккаунтов для batch-run;
- синхронизирует конкретный аккаунт в service-specific `CODEX_HOME`.

### 5.4 Codex execution layer

Новый adapter не работает с токеном из `.env`.
Он делает следующее:

1. загружает storage;
2. получает список аккаунтов для запуска;
3. перед каждым запуском синхронизирует очередной аккаунт в `CODEX_HOME`;
4. вызывает команду `codex` в отдельном процессе;
5. после завершения импортирует обратно обновленные токены и метаданные;
6. переходит к следующему аккаунту.

## 6. Локальное состояние внутри репозитория

Для этого проекта не стоит полагаться на глобальный `~/.codex`.

Нужен отдельный локальный service state внутри репозитория:

- `./state/codex-home/`
- `./state/accounts/codex-accounts.json`

Это дает:

1. изоляцию от ручной разработки на той же машине;
2. предсказуемую работу в Docker;
3. возможность переносить scheduler как сервис;
4. локальное хранение нескольких аккаунтов внутри проекта;
5. понятную границу между кодом репозитория и runtime state.

Критичное требование:

- `./state/**` существует локально;
- `./state/**` не коммитится;
- `./state/**` не синхронизируется через GitHub;
- контейнер использует `./state/**` как локальный runtime volume.

## 7. Предлагаемая структура файлов

### 7.1 Новые модули

- `lib/providers/claude.js`
- `lib/providers/codex.js`
- `lib/accounts/account-manager.js`
- `lib/accounts/storage.js`
- `lib/accounts/types.js`
- `lib/codex/login-import.js`
- `lib/codex/sync-active-account.js`
- `lib/codex/run-codex-command.js`
- `lib/codex/select-account.js`
- `scripts/codex-accounts.js`

### 7.2 Изменяемые существующие файлы

- [`scheduler.js`](/D:/Documents/GitHub/claude-session-starter/scheduler.js)
- [`test.js`](/D:/Documents/GitHub/claude-session-starter/test.js)
- [`.env.example`](/D:/Documents/GitHub/claude-session-starter/.env.example)
- [`README.md`](/D:/Documents/GitHub/claude-session-starter/README.md)
- [`docker-compose.yml`](/D:/Documents/GitHub/claude-session-starter/docker-compose.yml)
- [`package.json`](/D:/Documents/GitHub/claude-session-starter/package.json)
- [`.gitignore`](/D:/Documents/GitHub/claude-session-starter/.gitignore)

## 8. Формат storage

Рекомендуемый canonical storage:

`./state/accounts/codex-accounts.json`

Дополнительный runtime state:

- `./state/codex-home/` для локального auth state Codex CLI.

Принципы:

1. storage создается только локально;
2. storage наполняется только после ручной авторизации;
3. storage не коммитится;
4. scheduler читает именно этот файл как источник списка аккаунтов.

Черновой формат:

```json
{
  "version": 1,
  "provider": "codex",
  "activeIndex": 0,
  "pinnedAccountIndex": 0,
  "accounts": [
    {
      "id": "acct_123",
      "email": "user@example.com",
      "label": "main",
      "accessToken": "....",
      "refreshToken": "....",
      "expiresAt": "2026-07-06T12:00:00.000Z",
      "enabled": true,
      "lastUsed": "2026-07-06T07:01:00.000Z",
      "lastSuccessAt": "2026-07-06T07:01:02.000Z",
      "lastErrorAt": null,
      "lastErrorCode": null,
      "cooldownUntil": null,
      "source": "codex-login-import"
    }
  ]
}
```

Минимально необходимые поля:

- `version`
- `activeIndex`
- `pinnedAccountIndex`
- `accounts[]`
- `id`
- `email`
- `label`
- `accessToken`
- `refreshToken`
- `expiresAt`
- `enabled`
- `lastUsed`
- `cooldownUntil`

## 9. Основные сценарии

### 9.1 Добавление нового аккаунта

Команда:

```bash
node scripts/codex-accounts.js login --label work
```

Алгоритм:

1. пользователь вручную запускает команду из локального репозитория;
2. скрипт использует локальный `CODEX_HOME` внутри `./state/codex-home`;
3. запускается официальный `codex login`;
4. после успешного login читается auth/state из локального `CODEX_HOME`;
5. извлекаются identity и токены;
6. ищется match по `id`, `email` или `refreshToken`;
7. запись добавляется или обновляется в `./state/accounts/codex-accounts.json`;
8. пользователь повторяет этот же сценарий для каждого нужного аккаунта.

Важное уточнение:

- этот сценарий выполняется до запуска Docker;
- никакой автологин контейнера не нужен;
- именно ручной login является источником наполнения storage.

### 9.2 Просмотр списка аккаунтов

Команда:

```bash
node scripts/codex-accounts.js list
```

Показывает:

- индекс;
- label;
- email;
- enabled/disabled;
- cooldown state;
- активный ли аккаунт.

### 9.3 Явное переключение аккаунта

Команда:

```bash
node scripts/codex-accounts.js switch 1
```

Эта команда нужна для ручного выбора default-аккаунта, но она не отменяет batch-run по всем аккаунтам.

Смысл `switch` в этом проекте:

1. указать default-аккаунт для одиночного тестового запуска;
2. определить порядок/начальную точку обхода;
3. вручную проверить отдельный аккаунт до запуска полного scheduler cycle.

### 9.4 Плановая отправка сообщения по всем аккаунтам

Алгоритм scheduled job:

1. cron срабатывает;
2. scheduler формирует prompt;
3. provider `codex` запрашивает у account manager список всех enabled-аккаунтов;
4. scheduler последовательно проходит по каждому аккаунту;
5. перед каждым шагом account manager синхронизирует текущий аккаунт в `./state/codex-home`;
6. запускается команда `codex` с нужным prompt;
7. stdout/stderr логируются отдельно для этого аккаунта;
8. по завершении свежие auth-данные импортируются обратно в storage;
9. статус конкретного аккаунта обновляется как success/error;
10. цикл продолжается до тех пор, пока не будут обработаны все аккаунты из storage.

Требование к MVP:

- обход аккаунтов должен быть последовательным, а не параллельным;
- это упрощает использование одного локального `CODEX_HOME`;
- это же уменьшает риск порчи auth-state.

### 9.5 Поведение при ошибке одного аккаунта

Если запуск через один аккаунт падает:

- auth failure;
- token refresh failure;
- rate limit;
- network error;
- `5xx`;

то scheduler:

1. фиксирует ошибку у текущего аккаунта;
2. при необходимости выставляет `cooldownUntil`;
3. не останавливает весь batch-run;
4. переходит к следующему сохраненному аккаунту.

Опционально можно добавить retry, но базовое требование здесь проще: один проблемный аккаунт не должен ломать запуск по остальным аккаунтам.

## 10. Как вызывать `codex`

Внутри адаптера нужен отдельный runner, который запускает установленную команду `codex` через `child_process.spawn`.

Требования к runner:

1. работать в non-interactive режиме;
2. принимать prompt из scheduler;
3. уметь задавать model через env или CLI args;
4. возвращать итоговый текст ответа;
5. различать auth error, rate limit и process error.

Конкретный синтаксис non-interactive вызова `codex` должен быть инкапсулирован в одном месте, например в `lib/codex/run-codex-command.js`, чтобы обновление CLI не тянуло изменения по всему проекту.

## 11. Изменения в `.env`

Предлагаемые переменные:

```bash
PING_PROVIDER_CODEX=true
PING_PROVIDER_CLAUDE=false
CODEX_HOME=./state/codex-home
ACCOUNT_STORAGE_PATH=./state/accounts/codex-accounts.json
CODEX_MODEL=gpt-5.4-mini
CODEX_ACCOUNT_SELECTION=all
CODEX_ENABLE_AUTO_FALLBACK=true
MESSAGE_PROMPT="tell me a joke about programmers"
SCHEDULE_TIMES=07:01
TIMEZONE=Asia/Qyzylorda
```

Смысл:

- `PING_PROVIDER_CODEX=true` включает Codex pipeline;
- `PING_PROVIDER_CLAUDE=false` отключает Claude pipeline;
- `CODEX_ACCOUNT_SELECTION=all` явно фиксирует, что scheduler должен идти по всем аккаунтам, а не только по активному.

## 12. Изменения в `scheduler.js`

[`scheduler.js`](/D:/Documents/GitHub/claude-session-starter/scheduler.js) нужно реорганизовать так:

1. вынести генерацию prompt;
2. вынести provider selection;
3. заменить прямой вызов `query()` на `sendMessage({ provider, prompt })`;
4. для `codex` добавить отдельный batch-path, который обходит все аккаунты;
5. добавить structured result:
   - `provider`
   - `accountId`
   - `accountEmail`
   - `model`
   - `durationMs`
   - `success`
   - `errorCode`

Это позволит одинаково логировать и Claude, и Codex, но при этом Codex-путь будет многократно вызываться по одному разу на каждый сохраненный аккаунт.

## 13. Почему runtime-proxy не нужен в MVP

В `docs/MULTI_ACCOUNT_AUTH_SPEC_RU.md` proxy нужен для живой forwarded-сессии, где один long-lived Codex process делает много upstream requests.

В этом проекте модель другая:

1. scheduler запускает отдельную задачу по cron;
2. одна задача соответствует одному batch-cycle;
3. внутри batch-cycle идет последовательный запуск по всем аккаунтам;
4. если один аккаунт плохой, его можно пропустить и идти дальше.

Значит MVP должен быть проще:

- ручная авторизация до Docker;
- локальный storage внутри репозитория;
- последовательный обход всех аккаунтов;
- без loopback proxy и без shadow routing.

## 14. Изменения в Docker и deployment

Нужно изменить runtime-контракт контейнера под описанный ручной bootstrap.

### 14.1 Volumes

Между рестартами должны сохраняться:

- `./state/accounts`
- `./state/codex-home`

### 14.2 Git boundary

До запуска контейнера runtime state уже должен существовать локально, но:

- `./state/accounts/codex-accounts.json` не коммитится;
- `./state/codex-home/**` не коммитится;
- контейнер использует эти файлы как локальный volume/state;
- GitHub не должен знать о содержимом этих файлов.

### 14.3 Bootstrap

Первичный bootstrap должен быть именно таким:

1. вручную обновить локальный репозиторий;
2. подготовить локальные директории `./state/accounts` и `./state/codex-home`;
3. выполнить `node scripts/codex-accounts.js login`;
4. пройти `codex login`;
5. повторить шаги 3-4 для каждого нужного аккаунта;
6. убедиться, что все аккаунты записались в `./state/accounts/codex-accounts.json`;
7. убедиться, что `./state/**` не отслеживается Git;
8. только после этого запускать Docker-контейнер со scheduler.

## 15. Тестирование

Нужно разделить тестирование на три уровня.

### 15.1 Unit

- parse/save storage;
- account matching;
- switch logic;
- cooldown handling.

### 15.2 Integration

- login import из локального `CODEX_HOME`;
- sync аккаунта обратно в `CODEX_HOME`;
- успешный non-interactive вызов `codex`.

### 15.3 End-to-end

- добавить минимум два аккаунта;
- убедиться, что оба попали в `./state/accounts/codex-accounts.json`;
- проверить, что `git status` не показывает `./state/**`;
- выполнить тестовый `send once`;
- убедиться, что scheduler последовательно отправил сообщение через оба аккаунта;
- искусственно пометить первый аккаунт cooldown и проверить, что цикл продолжился на следующем аккаунте.

## 16. Этапы реализации

### Этап 1. Базовая поддержка Codex

1. добавить provider abstraction;
2. добавить `codex` provider без multi-account;
3. запускать один аккаунт через локальный `CODEX_HOME`.

### Этап 2. Multi-account storage

1. добавить `codex-accounts.json`;
2. реализовать `login`, `list`, `switch`;
3. синхронизировать выбранный аккаунт в `CODEX_HOME`;
4. исключить `./state/**` из Git.

### Этап 3. Scheduler integration

1. перевести cron-задачи на `codex` provider;
2. добавить batch-обход всех сохраненных аккаунтов;
3. логировать account metadata;
4. обновить Docker и README.

### Этап 4. Error handling

1. добавить `cooldownUntil`;
2. корректно фиксировать success/error по каждому аккаунту;
3. продолжать batch-run при ошибке одного аккаунта;
4. при необходимости добавить retry.

### Этап 5. Опциональное усложнение

Только если реально потребуется:

1. shadow `CODEX_HOME`;
2. runtime proxy;
3. per-request routing;
4. affinity state.

## 17. Критерии готовности

Адаптация считается завершенной, когда:

1. проект может хранить минимум два Codex-аккаунта;
2. эти аккаунты лежат в локальном файле внутри репозитория;
3. этот локальный файл и весь `./state/**` не отслеживаются Git;
4. Docker запускается только после предварительного ручного заполнения локального storage;
5. scheduler может каждый день в заданное время отправлять сообщение через `codex` по всем сохраненным аккаунтам;
6. ошибка одного аккаунта не останавливает обработку остальных;
7. после успешного запуска токены и auth-state не теряются;
8. single-token Claude flow остается опциональным legacy-режимом.

## 18. Итоговое решение

Для этого репозитория оптимальна не полная копия `codex-multi-auth`, а упрощенная адаптация его control plane:

1. multi-account storage;
2. import/export аккаунта через официальный `codex`;
3. локальный gitignored runtime state внутри репозитория;
4. scheduler, который запускает `codex` по cron и проходит по всем сохраненным аккаунтам;
5. продолжение batch-run даже при сбое одного аккаунта.

То есть в нашем проекте "сохранение токена в нескольких аккаунтах" и "ежедневная отправка сообщения через Codex" должны быть связаны не через постоянный proxy-runtime, а через:

- ручной login до запуска Docker;
- запись аккаунтов в локальный `./state/accounts/codex-accounts.json`;
- последовательный выбор каждого аккаунта в рамках одной scheduled job;
- запуск `codex` для каждого сохраненного аккаунта;
- сохранение обновленного auth-state после каждого запуска.

Это и есть основной pipeline, который нужно реализовать в коде.
