const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// ==========================
// Настройки
// ==========================
const BOT_TOKEN = '7750765391:AAEFhZLEIR8uock0MVMxOfnkXIB69XuSX6k';
const MONGO_URI = 'mongodb+srv://jamron:Y4gXOmP5VOThJMBS@cluster0.ucx8kac.mongodb.net/?appName=Cluster0';
const WEB_APP_URL = 'https://webapp25.onrender.com/';
const PORT = 3000;
const WEBHOOK_URL = `https://webapp25.onrender.com/bot${BOT_TOKEN}`;

// ==========================
// MongoDB
// ==========================
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB подключена'))
  .catch(err => console.error('❌ Ошибка подключения к MongoDB:', err));

const UserSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  data: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const SettingsSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now }
});
const Settings = mongoose.model('Settings', SettingsSchema);

// ==========================
// Express сервер
// ==========================
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Раздача фронтенда
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/main.js', (req, res) => res.sendFile(path.join(__dirname, 'main.js')));
app.get('/features.js', (req, res) => res.sendFile(path.join(__dirname, 'features.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));

// ==========================
// API маршруты
// ==========================
app.get('/api/settings', async (req, res) => {
  try {
    let settings = await Settings.findOne({ id: 'global' }).lean();
    if (!settings) {
       settings = await Settings.create({ id: 'global', data: {} });
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); 
    res.json(settings);
  } catch (err) { 
    console.error("GET Settings Error:", err);
    res.status(500).json({error: err.message}); 
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    let dataPayload = req.body;
    if (req.body.data) dataPayload = req.body.data;
    
    const settings = await Settings.findOneAndUpdate(
      { id: 'global' },
      { $set: { data: dataPayload, updatedAt: new Date() } },
      { new: true, upsert: true }
    ).lean();
    res.json(settings);
  } catch (err) { 
    console.error("PUT Settings Error:", err);
    res.status(500).json({error: err.message}); 
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findOne({ id: Number(req.params.id) }).lean();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); res.json(user || {});
  } catch (err) { res.status(500).json({error: err.message}); }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}).lean();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); res.json(users || []);
  } catch (err) { res.status(500).json({error: err.message}); }
});

app.post('/api/users', async (req, res) => {
  try {
    const doc = new User(req.body);
    if(!doc.createdAt) doc.createdAt = new Date();
    await doc.save();
    res.json(doc);
  } catch (err) { res.status(500).json({error: err.message}); }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    let updateData = req.body;
    if (!updateData.$set) updateData = { $set: updateData };
    const user = await User.findOneAndUpdate(
      { id: Number(req.params.id) },
      updateData,
      { new: true, upsert: true }
    ).lean();
    res.json(user);
  } catch (err) { res.status(500).json({error: err.message}); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await User.deleteOne({ id: Number(req.params.id) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({error: err.message}); }
});

// ==========================
// Эндпоинт для рассылки с защитой 429
// ==========================
app.post('/api/broadcast', async (req, res) => {
  try {
    const { message, imageUrl, buttonText, buttonUrl } = req.body;
    if (!message) return res.status(400).json({ error: "No message provided" });

    const users = await User.find({}).lean();
    let success = 0, failed = 0;

    res.json({ success: true, total: users.length, message: "Рассылка запущена!" });

    const sendToUser = async (user) => {
      try {
        const extra = { parse_mode: 'HTML' };
        if (buttonText && buttonUrl) {
          extra.reply_markup = { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] };
        }

        // Пробуем отправку с retry при 429
        let retry = 0;
        while (retry < 5) {
          try {
            if (imageUrl) {
              await bot.telegram.sendPhoto(user.id, imageUrl, { caption: message, ...extra });
            } else {
              await bot.telegram.sendMessage(user.id, message, extra);
            }
            success++;
            break;
          } catch (err) {
            if (err.code === 429 || err.description?.includes("Too Many Requests")) {
              const wait = (err.parameters?.retry_after || 1) * 1000;
              console.log(`⚠️ 429 для ${user.id}, ждем ${wait}ms`);
              await new Promise(r => setTimeout(r, wait));
              retry++;
            } else {
              throw err;
            }
          }
        }
      } catch (e) {
        failed++;
        console.error(`❌ Ошибка отправки ${user.id}:`, e.message);
      }
    };

    (async () => {
      console.log(`[Broadcast] Старт рассылки ${users.length} пользователей...`);
      for (const user of users) {
        await sendToUser(user);
        await new Promise(r => setTimeout(r, 100)); // лимит 10 сообщений в секунду
      }
      console.log(`[Broadcast] Завершено! Успешно: ${success}, Не доставлено: ${failed}`);
    })();

  } catch (err) {
    console.error("Ошибка рассылки:", err);
  }
});

// ==========================
// Telegram бот
// ==========================
const bot = new Telegraf(BOT_TOKEN);

// Глобальный обработчик ошибок
bot.catch((err, ctx) => {
  console.error(`❌ Ошибка Telegram API для ${ctx?.updateType}:`, err);
});

// /start
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const refId = ctx.payload;
  try {
    let user = await User.findOne({ id: userId });
    if (!user) {
      user = new User({ id: userId });
      await user.save();
      console.log(`👤 Новый пользователь: ${userId}`);
    }
    const appUrl = refId ? `${WEB_APP_URL}?startapp=${refId}` : WEB_APP_URL;
    await ctx.replyWithPhoto(
      'https://i.yapx.ru/dJS9H.jpg',
      {
        caption: `<b>🚀 TetherFlow — твой путь к крипто-доходу!

Привет! Добро пожаловать в TetherFlow — мини-приложение, где каждый может начать зарабатывать на криптовалюте.

💎 Что внутри приложения:

🎁 Активация промокодов  
Получай бонусы и дополнительные USDT.

👥 Приглашение друзей  
Зарабатывай на партнёрской программе и увеличивай доход.

🏦 Сейф со стейкингом  
Размещай средства под процент и получай пассивный доход.

⚡ Крипто-майнер  
Запусти майнер и начинай добывать криптовалюту прямо сейчас.

🔥 Начни уже сегодня!  
Запусти майнер, активируй бонусы и увеличивай свой крипто-баланс.

🚀 Запусти майнер и начни зарабатывать!</b>`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.webApp('🚀 Запустить Майнер', appUrl)]])
      }
    );
  } catch (err) {
    console.error('Ошибка /start:', err);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
});

// Настраиваем webhook на Express
app.use(bot.webhookCallback(`/bot${BOT_TOKEN}`));
bot.telegram.setWebhook(WEBHOOK_URL)
  .then(() => console.log(`✅ Webhook установлен на ${WEBHOOK_URL}`))
  .catch(err => console.error('Webhook error:', err));

// ==========================
// Запуск Express
// ==========================
app.listen(PORT, () => console.log(`✅ Express запущен на порту ${PORT}`));
