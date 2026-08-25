// Копирует общий SDK студии в сайт Byte Blaster.
//
// Страницы игры раньше грузили `/assets/pixset-auth.js` из корня домена, то
// есть из соседнего репозитория со студийным сайтом. Стоило обновить SDK и не
// перезалить студию — админка падала с «does not provide an export named …».
// Теперь у сайта игры своя копия, а этот скрипт держит её свежей.
//
// Запускать после правок SDK: node sync-sdk.js
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', '..', 'Pixset Studio Site', 'assets', 'pixset-auth.js');
const to = path.join(__dirname, 'assets', 'pixset-auth.js');

if (!fs.existsSync(from)) {
  console.error('Не нашёл исходный SDK: ' + from);
  process.exit(1);
}

fs.writeFileSync(to, fs.readFileSync(from));
console.log('SDK скопирован: ' + path.relative(__dirname, to));
