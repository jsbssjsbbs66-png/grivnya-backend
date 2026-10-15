// Той самий каталог завдань, що й у фронтенді Гривня — лише перевірені реальні
// YouTube-кліпи українських виконавців (для "перегляд" і "лайк") і дії на
// YouTube/Telegram, які справді ведуть на платформу, а не на вигадану адресу.
"use strict";

const REAL_VIDEOS = [
  { title: "1944", artist: "Jamala", id: "wNECV2h-y58" },
  { title: "Stefania", artist: "Kalush Orchestra", id: "UiEGVYOruLk" },
  { title: "Шум", artist: "Go_A", id: "U7-dxzp6Jvs" },
  { title: "Плакала", artist: "KAZKA", id: "5Fv19KVVya8" },
  { title: "Відлік", artist: "ONUKA", id: "yRHwWGO_A48" },
  { title: "Vitamin D", artist: "MONATIK", id: "iib4Bmy5cow" },
  { title: "Люди як кораблі", artist: "Скрябін", id: "FWH7lRJ6mPw" },
  { title: "Крапають", artist: "Dorofeeva", id: "TZOBU3X2-vM" }
];

const WATCH_PHRASES = ["Переглянь кліп", "Переглянь кліп повністю", "Переглянь і постав реакцію на кліп"];
const WATCH_ICONS = ["🎬", "🎞️", "📺"];
const TIME_OPTIONS = [
  { seconds: 180, label: "3 хв", price: 70 },
  { seconds: 240, label: "4 хв", price: 90 },
  { seconds: 300, label: "5 хв", price: 120 }
];

function ytWatch(id) { return "https://www.youtube.com/watch?v=" + id; }

const LIKE_PHRASES = ["Постав лайк під кліпом", "Вподобай кліп"];
const LIKE_ICONS = ["👍", "❤️", "🎵"];

const SIMPLE_ACTIONS = [
  "Підпишись на YouTube-канал", "Увімкни дзвіночок сповіщень на каналі", "Додай канал в обрані",
  "Збережи відео у «Переглянути пізніше»", "Додай відео у плейлист", "Підпишись на Telegram-канал теми",
  "Залиш коментар під відео", "Постав оцінку подкасту", "Додай канал до списку підписок",
  "Увімкни сповіщення про прямі ефіри", "Підпишись на ще один YouTube-канал", "Збережи ще одне відео у список",
  "Додай допис у закладки", "Поділись відео в історії", "Підпишись на новий Telegram-канал",
  "Додай сторінку в улюблені", "Увімкни субтитри і подивись хвилину", "Залиш реакцію під дописом",
  "Додай канал у список «Дивлюсь»", "Підпишись на канал автора подкасту"
];

// Платформні посилання тут навмисно лише для SIMPLE_ACTIONS (підписки на
// канали тощо) — для лайків ми більше НЕ використовуємо загальні посилання
// на платформи: кожен лайк веде на конкретний перевірений кліп.
const STABLE_LINKS = [
  "https://www.youtube.com/feed/trending", "https://www.youtube.com/shorts",
  "https://www.instagram.com/explore/", "https://www.tiktok.com/discover",
  "https://www.facebook.com/watch/", "https://www.threads.net/"
];

function buildTaskCatalog() {
  const list = [];
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < REAL_VIDEOS.length; i++) {
      for (let p = 0; p < WATCH_PHRASES.length; p++) {
        const idx = round * REAL_VIDEOS.length * WATCH_PHRASES.length + i * WATCH_PHRASES.length + p;
        const to = TIME_OPTIONS[idx % TIME_OPTIONS.length];
        const v = REAL_VIDEOS[i];
        list.push({
          id: "w" + idx, cat: "watch",
          title: WATCH_PHRASES[p] + " «" + v.title + "» (" + v.artist + ")",
          price: to.price, time: to.label, seconds: to.seconds,
          icon: WATCH_ICONS[idx % WATCH_ICONS.length],
          link: ytWatch(v.id)
        });
      }
    }
  }
  for (let i = 0; i < REAL_VIDEOS.length; i++) {
    for (let p = 0; p < LIKE_PHRASES.length; p++) {
      const idx = i * LIKE_PHRASES.length + p;
      const v = REAL_VIDEOS[i];
      list.push({
        id: "l" + idx, cat: "like",
        title: LIKE_PHRASES[p] + " «" + v.title + "» (" + v.artist + ")",
        price: 40 + (idx % 4) * 10, time: "~10 сек", seconds: 10,
        icon: LIKE_ICONS[idx % LIKE_ICONS.length],
        link: ytWatch(v.id)
      });
    }
  }
  for (let i = 0; i < SIMPLE_ACTIONS.length; i++) {
    list.push({
      id: "s" + i, cat: "simple", title: SIMPLE_ACTIONS[i],
      price: 60 + (i % 3) * 20, time: "~15 сек", seconds: 15, icon: "🔔",
      link: STABLE_LINKS[i % STABLE_LINKS.length]
    });
  }
  // Обмежена кількість виконань на завдання — дорожчі завдання мають менший
  // ліміт місць. Рахується по-справжньому через submissions у БД, не вигадками.
  list.forEach((t) => {
    if (t.price >= 200) t.slots = 3;
    else if (t.price >= 150) t.slots = 6;
    else if (t.price >= 100) t.slots = 10;
    else t.slots = null;
  });
  return list;
}

module.exports = { buildTaskCatalog };
