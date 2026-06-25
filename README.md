# Kiwi 🥝 — YouTube Audio Bot

Telegram botu. YouTube linkini göndər, M4A audio faylını al.

---

## Tələblər

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
- Telegram Bot Token ([BotFather](https://t.me/BotFather) vasitəsilə əldə edilir)

---

## Quraşdırma

```bash
# 1. Reponu klonla
git clone <repo-url>
cd kiwi_downloader

# 2. .env faylını yarat
cp .env.example .env

# 3. BOT_TOKEN dəyərini daxil et
# .env faylını redaktor ilə aç və BOT_TOKEN= xəttinə tokenini əlavə et

# 4. Boş cookies faylı yarat (həmişə lazımdır)
touch cookies.txt
```

---

## YouTube Cookies (Tövsiyə olunur)

**Niyə lazımdır?** YouTube server/VPS IP-lərindən gələn sorğular üçün bot-detection tətbiq edir.
Cookies olmadan **bəzi videolar** (xüsusilə age-restricted) serverdən yüklənməyə bilər.

### Cookies necə əldə edilir?

1. Chrome/Firefox-da **"Get cookies.txt LOCALLY"** extension-ını quraşdır
2. **Yeni incognito pəncərə** aç (çox vacibdir!)
3. Həmin pəncərədə YouTube-a daxil ol
4. `https://www.youtube.com/robots.txt` ünvanına get (eyni pəncərədə)
5. Extension vasitəsilə `youtube.com` cookies-lərini export et
6. Faylı layihənin kök qovluğuna `cookies.txt` adı ilə saxla
7. İncognito pəncərəni **dərhal bağla**

> **Qeyd:** Cookies 2-4 həftə ərzində etibarlıdır. Xəta başladıqda yeniləmək lazımdır.

---

## İşə salma

```bash
docker compose up -d
```

Bot avtomatik olaraq işə düşür. Logları izləmək üçün:

```bash
docker compose logs -f
```

Dayandırmaq üçün:

```bash
docker compose down
```

Cookies yeniləndikdə botu restart et:

```bash
docker compose restart
```

---

## İstifadə

1. Telegram-da botunu tap (`@username`)
2. `/start` göndər
3. İstənilən YouTube linkini göndər
4. Bot M4A audio faylını sənə qaytaracaq

---

## Dəstəklənən linklər

- `https://youtube.com/watch?v=...`
- `https://youtu.be/...`
- `https://youtube.com/shorts/...`

---

## Texniki Stack

| Komponent | Versiya |
|-----------|---------|
| Node.js   | 20 (Alpine) |
| TypeScript | 5.x |
| grammY | 1.x |
| yt-dlp | latest |
| FFmpeg | latest (Alpine) |

---

## Layihə Strukturu

```
src/
├── config/       — mühit dəyişənləri
├── types/        — TypeScript tipləri və xəta sinifləri
├── utils/        — köməkçi funksiyalar (logger, fayl, youtube)
├── services/     — yt-dlp ilə yükləmə məntiqi
├── bot/
│   ├── handlers/ — /start və mesaj handler-ları
│   └── index.ts  — bot yaradılması
└── index.ts      — giriş nöqtəsi
```
