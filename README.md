# pay-pxbt

pay.pxbt.app: лендинг, подключение кошелька, счета и API. Вынесено из `aicontent-factory`,
чтобы тесты pay не гоняли видеопайплайн (у каждого проекта свои CI и сборка образа).

## Что внутри

| Путь | Что |
|---|---|
| `deploy/pay-page/` | сервер (`server.mjs`), Dockerfile, compose для VPS |
| `functions/` | обработчики: `pay/`, `u/`, `i/`, `api/`, `admin/`, `lib/`, `tarot/` |
| `config/payment-providers.json` | список провайдеров/пар |
| `test/` | node-тесты и playwright e2e |
| `docs/pay/` | спецификация и исследования |

## CI

- `ci.yml` — node-тесты + сборка образа и смоук (healthz, `/admin` 403, создание счёта).
- `image.yml` — сборка и пуш `ghcr.io/mytab0r/pay-pxbt:latest` на push в `master`.

VPS подхватывает образ через Watchtower; имя образа намеренно оставлено прежним.
