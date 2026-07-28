# 🌐 Site — сайт Byte Blaster

Статический сайт для GitHub Pages: главная, вики и страница 404.
Адрес: **https://pixset-studio.github.io/byte-blaster/**

---

## Что где лежит

```
Site/
├── index.html          главная (кнопки «полная версия», «демо», RuStore)
├── 404.html            страница ошибки
├── .nojekyll           отключает Jekyll (иначе он выкинет папки на «_»)
├── assets/
│   ├── site.css        стили всех страниц
│   ├── site.js         язык, плавные переходы, поиск по вики
│   ├── logo.png        иконка игры 192×192 (шапка)
│   ├── logo-512.png    иконка игры 512×512 (главная, OG-превью)
│   └── favicon…        иконки вкладки
├── wiki/
│   └── index.html      вики: механики, миры, боссы, сюжет, FAQ
├── download/
│   └── index.html      где скачать: браузер, RuStore, Windows + требования
├── updates/
│   └── index.html      история версий
└── game/
    ├── full/           веб-сборка ПОЛНОЙ версии
    └── demo/           веб-сборка ДЕМО
```

## Два языка

Сайт двуязычный (RU / EN) **без дублирования страниц**: оба перевода лежат в
одной разметке, а показывается нужный.

```html
<p data-l="ru">Русский текст</p>
<p data-l="en">English text</p>
```

- Активный язык — атрибут `data-site-lang` на `<html>`; CSS прячет неактивный.
- Язык выбирается так: сохранённый выбор → язык браузера → русский. Для
  кириллических локалей (ru, uk, be, kk, ky, uz, tg, tk, az, hy) берётся
  русский, для остальных английский.
- Выбор запоминается в `localStorage` под ключом `bbSiteLang`.
- Значение проставляется **инлайн-скриптом в `<head>`**, до первой отрисовки —
  иначе страница на мгновение мигала бы не тем языком.
- `<title>` и описание нельзя спрятать через CSS, поэтому их варианты лежат в
  `data-title-ru` / `data-title-en` / `data-desc-*` на теге `<html>`.

**Добавляя текст, пишите сразу обе версии** — иначе при переключении на другой
язык блок просто исчезнет.

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
| Скачать | `…/byte-blaster/download/` | папка `download/` с `index.html` |
| Обновления | `…/byte-blaster/updates/` | папка `updates/` с `index.html` |
| ▶ Играть | `…/byte-blaster/game/full` | папка `game/full/` с `index.html` |
| ◆ Демо | `…/byte-blaster/game/demo` | папка `game/demo/` с `index.html` |
| 404 | любой неверный адрес | `404.html` в корне |

Внешние ссылки, которые стоят на сайте: RuStore
(`rustore.ru/catalog/app/com.pixsetstudio.byteblaster`) и GitHub Releases
(`github.com/pixset-studio/byte-blaster/releases`) на странице «Скачать».
**Если релизов .exe там нет — либо выложите сборку, либо уберите карточку
Windows**, чтобы кнопка не вела в пустоту.

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
