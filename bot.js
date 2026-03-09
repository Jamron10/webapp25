const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// ==========================================
// НАСТРОЙКИ
// ==========================================
const BOT_TOKEN = '8530910919:AAFp__X2DJZ44Z3HXN52NLSyEPVjwAgvfzs'; 
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tetherflow';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://webapp26.onrender.com/'; // Замените на ссылку Web App
const PORT = process.env.PORT || 3000;

// ==========================================
// ПОДКЛЮЧЕНИЕ К MONGODB
// ==========================================
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Успешно подключено к MongoDB'))
  .catch(err => console.error('❌ Ошибка подключения к MongoDB:', err));

// Схема пользователя (соответствует структуре фронтенда)
const UserSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  data: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// ==========================================
// API СЕРВЕР (EXPRESS) ДЛЯ FRONTEND FETCH
// ==========================================
const app = express();
app.use(cors()); // Разрешаем CORS для запросов из Web App
app.use(express.json({ limit: '50mb' })); // Увеличиваем лимит для больших объектов состояния

// Раздаем файлы визуального интерфейса (Фронтенд)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/main.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.js'));
});
app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'styles.css'));
});

// Получить одного пользователя
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findOne({ id: Number(req.params.id) });
    res.json(user || {});
  } catch (err) { res.status(500).json({error: err.message}); }
});

// Получить всех пользователей (для админ панели)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users || []);
  } catch (err) { res.status(500).json({error: err.message}); }
});

// Создать пользователя
app.post('/api/users', async (req, res) => {
  try {
    const doc = new User(req.body);
    if(!doc.createdAt) doc.createdAt = new Date();
    await doc.save();
    res.json(doc);
  } catch (err) { res.status(500).json({error: err.message}); }
});

// Обновить пользователя (используется для сохранения состояния)
app.put('/api/users/:id', async (req, res) => {
  try {
    let updateData = req.body;
    // Если фронтенд присылает данные с $set, используем их, иначе оборачиваем
    if (!updateData.$set) {
      updateData = { $set: updateData };
    }
    
    const user = await User.findOneAndUpdate(
      { id: Number(req.params.id) }, 
      updateData, 
      { new: true, upsert: true }
    );
    res.json(user);
  } catch (err) { res.status(500).json({error: err.message}); }
});

// Удалить пользователя
app.delete('/api/users/:id', async (req, res) => {
  try {
    await User.deleteOne({ id: Number(req.params.id) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({error: err.message}); }
});

// ==========================================
// НОВЫЙ ЭНДПОИНТ ДЛЯ РАССЫЛКИ
// ==========================================
app.post('/api/broadcast', async (req, res) => {
  try {
    const { message, imageUrl, buttonText, buttonUrl } = req.body;
    if (!message) return res.status(400).json({ error: "No message provided" });
    
    const users = await User.find({});
    let success = 0;
    let failed = 0;
    
    // Отвечаем сразу, чтобы не вешать фронтенд
    res.json({ success: true, total: users.length, message: "Рассылка запущена!" });

    const sendToUser = async (user) => {
      try {
        const extra = { parse_mode: 'HTML' };
        if (buttonText && buttonUrl) {
          extra.reply_markup = {
            inline_keyboard: [[{ text: buttonText, url: buttonUrl }]]
          };
        }
        if (imageUrl) {
          await bot.telegram.sendPhoto(user.id, imageUrl, { caption: message, ...extra });
        } else {
          await bot.telegram.sendMessage(user.id, message, extra);
        }
        success++;
      } catch(e) {
        failed++;
      }
    };

    // Запуск асинхронного цикла с задержкой (чтобы не словить лимит Telegram ~30 msg/sec)
    (async () => {
       console.log(`[Broadcast] Starting broadcast to ${users.length} users...`);
       for (const user of users) {
         await sendToUser(user);
         // Пауза 50мс (20 сообщений в секунду)
         await new Promise(r => setTimeout(r, 50));
       }
       console.log(`[Broadcast] Finished! Success: ${success}, Failed: ${failed}`);
    })();

  } catch (err) { 
    console.error("Broadcast error:", err);
  }
});

app.listen(PORT, () => {
  console.log(`✅ API Сервер запущен на порту ${PORT}`);
});

// ==========================================
// ИНИЦИАЛИЗАЦИЯ БОТА
// ==========================================
const bot = new Telegraf(BOT_TOKEN);

// Обработчик команды /start
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const refId = ctx.payload; // Если перешли по реф-ссылке (t.me/bot?start=123)

  try {
    // 1. Проверяем, есть ли пользователь в базе
    let user = await User.findOne({ id: userId });
    
    // 2. Если новый, создаем запись
    if (!user) {
      user = new User({ id: userId });
      await user.save();
      console.log(`👤 Новый пользователь зарегистрирован: ${userId}`);
    }

    // 3. Формируем ссылку на Web App с реферальным параметром (если есть)
    // Если есть refId, приложение поймет, кто пригласил
    const appUrl = refId ? `${WEB_APP_URL}?startapp=${refId}` : WEB_APP_URL;

    // 4. Отправляем приветственное сообщение с кнопкой
    await ctx.replyWithPhoto(
      'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', // Картинка-приветствие (можете заменить на свою)
      {
        caption: `Привет, <b>${ctx.from.first_name}</b>! 👋\n\nДобро пожаловать в <b>TetherFlow Miner Pro</b>.\nЗдесь ты можешь майнить USDT, выполнять задания и приглашать друзей!\n\nЖми на кнопку ниже, чтобы запустить приложение 🚀`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.webApp('🚀 Запустить Майнер', appUrl)]
        ])
      }
    );

  } catch (error) {
    console.error('Ошибка при обработке /start:', error);
    ctx.reply('Произошла ошибка на сервере. Пожалуйста, попробуйте позже.');
  }
});

// ==========================================
// ЗАПУСК
// ==========================================
bot.launch().then(() => {
  console.log('✅ Бот успешно запущен и готов к работе!');
});

// Плавная остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
