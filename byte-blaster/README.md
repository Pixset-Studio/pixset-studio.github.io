# 🌐 Site — сайт Byte Blaster

Статический сайт для GitHub Pages: главная, вики и страница 404.
Адрес: **https://pixset-studio.github.io/byte-blaster/**

---

## Что где лежит

```
Site/
├── index.html          главная (кнопки «полная версия» и «демо»)
├── 404.html            страница ошибки
├── .nojekyll           отключает Jekyll (иначе он выкинет папки на «_»)
├── assets/
│   ├── site.css        стили всех страниц
│   ├── site.js         поиск и подсветка разделов в вики
│   └── favicon…        иконки
├── wiki/
│   └── index.html      вики: механики, миры, боссы, сюжет, FAQ
└── game/
    ├── full/           ← сюда кладётся веб-сборка ПОЛНОЙ версии
    └── demo/           ← сюда кладётся веб-сборка ДЕМО
```

---

## Какие папки создать в репозитории GitHub

Репозиторий должен называться **`byte-blaster`** (именно так — от этого зависит
адрес `…github.io/byte-blaster/`), владелец — **`pixset-studio`**.

**Содержимое папки `Site/` кладётся в КОРЕНЬ репозитория**, не внутрь папки
`Site`. То есть в репозитории должно получиться так:

```
byte-blaster/               ← корень репозитория
├── index.html
├── 404.html
├── .nojekyll
├── assets/
│   ├── site.css
│   ├── site.js
│   ├── favicon.ico
│   ├── favicon-32x32.png
│   └── apple-touch-icon.png
├── wiki/
│   └── index.html
└── game/
    ├── full/
    │   ├── index.html      ← файлы веб-сборки полной версии
    │   └── assets/ …
    └── demo/
        ├── index.html      ← файлы веб-сборки демо
        └── assets/ …
```

Именно такая раскладка даёт адреса, которые стоят в кнопках:

| Кнопка | Адрес | Что его создаёт |
|---|---|---|
| Главная | `…/byte-blaster/` | `index.html` в корне |
| Вики | `…/byte-blaster/wiki/` | папка `wiki/` с `index.html` |
| ▶ Играть | `…/byte-blaster/game/full` | папка `game/full/` с `index.html` |
| ◆ Демо | `…/byte-blaster/game/demo` | папка `game/demo/` с `index.html` |
| 404 | любой неверный адрес | `404.html` в корне |

> Адрес без слэша на конце (`/game/full`) работает: GitHub Pages сам добавит
> слэш и отдаст `index.html` из этой папки.

---

## Как собрать игру для сайта

> Сейчас в `game/full/` и `game/demo/` **уже лежат рабочие сборки** версии 1.0.2
> (проверено: обе запускаются, 49 языков, редакции `full` и `demo` проставлены
> верно). Этот раздел нужен, когда выйдет обновление игры и сборки надо
> заменить.

Веб-сборки делаются из папки `Game/`:

```bash
cd Game
node build/set-edition.js full
npm run build:html
```

Результат появится в `Game/dist/Byte Blaster (HTML)/` — **содержимое этой папки**
копируется в `game/full/`.

Затем демо:

```bash
node build/set-edition.js demo "https://pixset-studio.github.io/byte-blaster/"
npm run build:html
node build/set-edition.js full
```

Результат — `Game/dist/Byte Blaster Demo (HTML)/`, копируется в `game/demo/`.

Последняя команда возвращает дерево в состояние «полная версия», чтобы
`npm start` после сборки демо не запускал урезанную игру.

---

## Включить GitHub Pages

1. Settings → Pages
2. **Source**: Deploy from a branch
3. **Branch**: `main`, папка `/ (root)`
4. Save — через минуту сайт будет по адресу
   `https://pixset-studio.github.io/byte-blaster/`

---

## Что важно знать

- **Пути в HTML абсолютные** (`/byte-blaster/…`). Если репозиторий назвать
  иначе, нужно заменить этот префикс во всех файлах — иначе ссылки, стили и
  иконки не найдутся.
- **`.nojekyll` обязателен.** Без него GitHub Pages пропускает через Jekyll,
  который игнорирует файлы и папки, начинающиеся с подчёркивания — а в
  локализации игры такие файлы есть.
- **Демо и полная версия делят `localStorage`**, потому что живут на одном
  домене. Прогресс из демо перейдёт в полную версию, что скорее удобно; демо при
  этом не понижает уже достигнутый прогресс, а только не даёт поднять его выше
  своего лимита.
- **Служебные файлы удалены из сборок.** Веб-сборка тянет за собой отчёты
  аудита локализации (`_suspect_*.json`, `_cutscenes_en.json`, `_pre_en.json` —
  78 файлов), которые игре не нужны. Они убраны; если пересоберёте — удалите
  снова:
  ```bash
  find game -name "_*.json" -delete
  ```

- **Локально сайт смотреть так.** Пути абсолютные (`/byte-blaster/…`), поэтому
  открывать `index.html` двойным щелчком бесполезно — нужна структура, где
  папка сайта называется `byte-blaster`:
  ```bash
  mkdir preview && cd preview
  ln -s "../Site" byte-blaster      # Windows: mklink /J byte-blaster ..\Site
  python -m http.server 8080
  ```
  затем открыть `http://localhost:8080/byte-blaster/`.
