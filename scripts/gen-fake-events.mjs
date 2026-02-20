/**
 * Generate fake vending machine transaction events for demo_vm01
 * 
 * Event flow for a successful transaction:
 *   sess/session_begin → order/start → order/ordered → 
 *   payment/start → payment/hint → payment/input → payment/payment_begin → payment/paid →
 *   dispense/start → dispense/hint → dispense/ready → dispense/prod_dispensed → dispense/hint(final) →
 *   sess/timeout
 *
 * Variations:
 *   - Payment cancelled (user walks away after ordering)
 *   - Session timeout (user browses but doesn't order)
 *   - Payment methods: cash, creditcard
 *
 * Output: JSONL file with one event per line
 */

import { writeFileSync } from 'fs';

const DEVICE_ID = 'demo_vm01';

// Products for demo operator
const PRODUCTS = [
  { code: '001', name: '黑松沙士', price: 25 },
  { code: '002', name: '黑松沙士加鹽', price: 25 },
  { code: '003', name: '百事可樂', price: 25 },
  { code: '004', name: '芬達', price: 25 },
  { code: '005', name: '可口可樂無糖', price: 25 },
  { code: '006', name: '雪碧檸檬風味', price: 25 },
  { code: '007', name: '話匣子-美式辣起士', price: 30 },
  { code: '008', name: '口口香-芝士脆', price: 20 },
  { code: '009', name: '台灣桃酥', price: 80 },
  { code: '010', name: '蒜香豌豆餅', price: 30 },
  { code: '011', name: '話匣子-美式BBQ肋排', price: 30 },
  { code: '012', name: '話匣子-炙烤雞汁', price: 30 },
  { code: '013', name: '話匣子-勁爆香辣', price: 30 },
  { code: '014', name: '口口香-蝦條精典', price: 20 },
  { code: '015', name: '雞腳5只入一包', price: 50 },
  { code: '016', name: '鴨翅膀一隻入一包', price: 35 },
  { code: '017', name: '麻辣豆乾小包100克', price: 55 },
  { code: '018', name: '楓糖奶油腰果', price: 45 },
  { code: '019', name: '每日堅果藍色', price: 35 },
  { code: '020', name: '每日堅果綠色', price: 35 },
  { code: '021', name: '愛之味麥仔茶', price: 25 },
  { code: '022', name: '麥萃日式麥茶', price: 35 },
  { code: '023', name: '萊姆氣泡水', price: 30 },
  { code: '024', name: '奇兒思氣泡水', price: 30 },
  { code: '025', name: 'FIN好菌補給飲', price: 15 },
  { code: '026', name: '貝納頌拿鐵', price: 30 },
  { code: '027', name: '奧利多', price: 25 },
];

// Channel mapping: product code → channel numbers (simulate slot assignment)
const CHANNELS = {};
PRODUCTS.forEach((p, i) => {
  const row = Math.floor(i / 8) + 1;
  const col = (i % 8) + 1;
  CHANNELS[p.code] = `0${row}${col}`;
});

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }

// Timestamp: microseconds since epoch (like the real system uses)
function toMicros(date) { return date.getTime() * 1000 + rand(0, 999); }

function makeEvent(timestamp, e, sm, arg = {}) {
  return { deviceId: DEVICE_ID, timestamp, e, sm, trigger: e.split('/')[1], arg };
}

function generateTransaction(baseTime) {
  const events = [];
  let t = baseTime;

  const product = pick(PRODUCTS);
  const payMethod = Math.random() < 0.6 ? 'cash' : 'creditcard';
  const chid = CHANNELS[product.code] || '011';

  // Determine outcome
  const roll = Math.random();
  let outcome; // 'success', 'cancelled', 'timeout'
  if (roll < 0.70) outcome = 'success';
  else if (roll < 0.88) outcome = 'cancelled';
  else outcome = 'timeout';

  // 1. Session begin
  const sessionTs = toMicros(new Date(t));
  events.push(makeEvent(sessionTs, 'sess/session_begin', 'sess'));
  t += rand(200, 500); // ms

  // 2. Order start
  events.push(makeEvent(toMicros(new Date(t)), 'order/start', 'order'));
  t += rand(2000, 8000); // user browses 2-8 seconds

  // Timeout: user just browses and leaves
  if (outcome === 'timeout') {
    t += rand(20000, 45000);
    events.push(makeEvent(toMicros(new Date(t)), 'sess/timeout', 'sess'));
    events.push(makeEvent(toMicros(new Date(t + 10)), 'payment/timeout', 'payment'));
    return { events, outcome, product: null, payMethod: null };
  }

  // 3. Order placed
  events.push(makeEvent(toMicros(new Date(t)), 'order/ordered', 'order', { p_id: product.code }));
  t += rand(100, 300);

  // 4. Payment flow
  events.push(makeEvent(toMicros(new Date(t)), 'payment/goto_none', 'payment'));
  t += rand(10, 50);
  events.push(makeEvent(toMicros(new Date(t)), 'payment/start', 'payment'));
  t += rand(50, 200);

  // Payment hint (product info)
  const paymentMethods = { cash: {}, creditcard: {} };
  events.push(makeEvent(toMicros(new Date(t)), 'payment/hint', 'payment', {
    p_id: product.code,
    p_name: product.name,
    payment_method: paymentMethods,
    price: product.price,
  }));
  t += rand(2000, 6000); // user looks at payment options

  // Cancelled: user walks away during payment
  if (outcome === 'cancelled') {
    t += rand(5000, 15000);
    events.push(makeEvent(toMicros(new Date(t)), 'payment/cancelled', 'payment'));
    t += rand(15000, 30000);
    events.push(makeEvent(toMicros(new Date(t)), 'sess/timeout', 'sess'));
    return { events, outcome, product, payMethod: null };
  }

  // 5. Payment input (user selects method)
  events.push(makeEvent(toMicros(new Date(t)), 'payment/input', 'payment', {
    method: payMethod,
    payment_method: { [payMethod]: {} },
  }));
  t += rand(1000, 3000);

  // 6. Payment begin
  events.push(makeEvent(toMicros(new Date(t)), 'payment/payment_begin', 'payment', { method: payMethod }));
  t += rand(100, 200);
  events.push(makeEvent(toMicros(new Date(t)), 'reader/stop', 'reader'));
  t += rand(3000, 8000); // payment processing time

  // 7. Payment success
  events.push(makeEvent(toMicros(new Date(t)), 'payment/paid', 'payment'));
  t += rand(50, 150);
  events.push(makeEvent(toMicros(new Date(t)), 'reader/stop', 'reader'));
  t += rand(10, 50);
  events.push(makeEvent(toMicros(new Date(t)), 'payment/hint', 'payment', {}));
  t += rand(50, 200);

  // 8. Dispense flow
  events.push(makeEvent(toMicros(new Date(t)), 'dispense/goto_none', 'dispense'));
  t += rand(10, 50);
  events.push(makeEvent(toMicros(new Date(t)), 'dispense/start', 'dispense'));
  t += rand(50, 200);
  events.push(makeEvent(toMicros(new Date(t)), 'dispense/hint', 'dispense', { p_id: product.code }));
  t += rand(200, 500);

  // Dispense ready
  const startTime = Math.floor(t / 1000);
  events.push(makeEvent(toMicros(new Date(t)), 'dispense/ready', 'dispense', {
    chid, chno: chid.slice(-1), mid: 'product_dispensing',
    p_id: product.code, quan: '1', start_time: startTime,
  }));
  t += rand(50, 100);
  events.push(makeEvent(toMicros(new Date(t)), 'dispense/hint', 'dispense', {
    lock: `貨道${chid}出貨中，請稍後…`,
  }));
  t += rand(8000, 15000); // dispensing time

  // 9. Dispense success
  events.push(makeEvent(toMicros(new Date(t)), 'dispense/prod_dispensed', 'dispense'));
  t += rand(50, 200);
  const elapsed = Math.floor((t - startTime * 1000) / 1000);
  events.push(makeEvent(toMicros(new Date(t)), 'dispense/hint', 'dispense', { elapsed }));
  t += rand(10, 50);
  events.push(makeEvent(toMicros(new Date(t)), 'dispense/hint', 'dispense', {
    final: 1, info: `貨道${chid}出貨成功，請取出商品。`,
  }));
  t += rand(2000, 5000);

  // 10. Session end
  events.push(makeEvent(toMicros(new Date(t)), 'payment/cancelled', 'payment'));
  t += rand(20000, 40000);
  events.push(makeEvent(toMicros(new Date(t)), 'sess/timeout', 'sess'));

  return { events, outcome, product, payMethod };
}

// === Main: generate events from 2026-01-01 to 2026-02-09 ===
const START = new Date('2026-01-01T00:00:00+08:00');
const END = new Date('2026-02-09T23:59:59+08:00');

const allEvents = [];
const stats = { total: 0, success: 0, cancelled: 0, timeout: 0, byProduct: {}, byPayMethod: { cash: 0, creditcard: 0 }, byDate: {} };

let currentDay = new Date(START);

while (currentDay <= END) {
  const dayStr = new Date(currentDay.getTime() + 8*3600000).toISOString().slice(0, 10);
  const txCount = rand(10, 20);
  stats.byDate[dayStr] = { total: 0, success: 0, cancelled: 0, timeout: 0, revenue: 0 };

  // Distribute transactions across operating hours (8:00-22:00)
  const dayStart = new Date(currentDay);
  dayStart.setHours(8, 0, 0, 0);

  for (let i = 0; i < txCount; i++) {
    // Random time within 8:00-22:00
    const minuteOffset = rand(0, 14 * 60 - 1); // 14 hours
    const txTime = new Date(dayStart.getTime() + minuteOffset * 60000);

    const { events, outcome, product, payMethod } = generateTransaction(txTime.getTime());
    allEvents.push(...events);

    stats.total++;
    stats[outcome]++;
    stats.byDate[dayStr].total++;
    stats.byDate[dayStr][outcome]++;

    if (product) {
      stats.byProduct[product.name] = (stats.byProduct[product.name] || 0) + (outcome === 'success' ? 1 : 0);
    }
    if (outcome === 'success') {
      stats.byPayMethod[payMethod]++;
      stats.byDate[dayStr].revenue += product.price;
    }
  }

  currentDay.setDate(currentDay.getDate() + 1);
}

// Sort all events by timestamp
allEvents.sort((a, b) => a.timestamp - b.timestamp);

// Write JSONL
const outPath = '/home/mozo/zgovend/scripts/fake-events-demo_vm01.jsonl';
const lines = allEvents.map(e => JSON.stringify(e));
writeFileSync(outPath, lines.join('\n') + '\n');

console.log(`\n=== 模擬事件生成完成 ===`);
console.log(`輸出: ${outPath}`);
console.log(`事件總數: ${allEvents.length}`);
console.log(`\n--- 交易統計 (2026-01-01 ~ 2026-02-09, 共 ${Object.keys(stats.byDate).length} 天) ---`);
console.log(`交易總數: ${stats.total}`);
console.log(`  成功: ${stats.success} (${(stats.success/stats.total*100).toFixed(1)}%)`);
console.log(`  取消: ${stats.cancelled} (${(stats.cancelled/stats.total*100).toFixed(1)}%)`);
console.log(`  逾時: ${stats.timeout} (${(stats.timeout/stats.total*100).toFixed(1)}%)`);
console.log(`\n付款方式 (成功交易):`);
console.log(`  現金: ${stats.byPayMethod.cash}`);
console.log(`  信用卡: ${stats.byPayMethod.creditcard}`);

const totalRevenue = Object.values(stats.byDate).reduce((s, d) => s + d.revenue, 0);
console.log(`\n總營收: NT$ ${totalRevenue.toLocaleString()}`);
console.log(`日均營收: NT$ ${Math.round(totalRevenue / Object.keys(stats.byDate).length).toLocaleString()}`);
console.log(`日均交易: ${(stats.total / Object.keys(stats.byDate).length).toFixed(1)} 筆`);

console.log(`\n--- 商品銷售排行 (前10) ---`);
const sorted = Object.entries(stats.byProduct).sort((a, b) => b[1] - a[1]).slice(0, 10);
sorted.forEach(([name, count], i) => console.log(`  ${i+1}. ${name}: ${count} 筆`));

// Daily breakdown summary
console.log(`\n--- 每日摘要 (前5天 + 後5天) ---`);
const dates = Object.keys(stats.byDate).sort();
const showDates = [...dates.slice(0, 5), '...', ...dates.slice(-5)];
for (const d of showDates) {
  if (d === '...') { console.log('  ...'); continue; }
  const s = stats.byDate[d];
  console.log(`  ${d}: ${s.total}筆 (成功${s.success}/取消${s.cancelled}/逾時${s.timeout}) 營收 NT$${s.revenue}`);
}
