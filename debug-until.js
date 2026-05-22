// ブラウザのコンソールに貼り付けて実行
// until 値を変えたとき、ターゲットが #t:nosli で返ってくるかを調べる

(async () => {
  const TARGET_ID = '3be84917196c56198b803f65495639522932062da05e1dbb7b881430e4890115';
  const RELAY = 'wss://nos.lol';

  // 2023-12-01, 2023-10-01, 2023-09-28 で試す。
  // ターゲットは 2023-09-27 (created_at=1695816128) なので、
  // until はそれより新しい時刻でないと条件にヒットしない。
  const UNTILS = {
    '2023-12-01': Math.floor(new Date('2023-12-01').getTime() / 1000),
    '2023-10-01': Math.floor(new Date('2023-10-01').getTime() / 1000),
    '2023-09-28': Math.floor(new Date('2023-09-28').getTime() / 1000),
    'no-until':   null,
  };

  async function test(label, until) {
    return new Promise((resolve) => {
      const ws = new WebSocket(RELAY);
      const seenIds = new Set();
      let hit = false;
      let count = 0;
      const timer = setTimeout(() => { ws.close(); resolve({ label, hit, count, timeout: true }); }, 12000);

      ws.onopen = () => {
        const filter = { kinds: [30023], '#t': ['nosli'], limit: 100 };
        if (until !== null) filter.until = until;
        ws.send(JSON.stringify(['REQ', label, filter]));
      };

      ws.onmessage = ({ data }) => {
        const msg = JSON.parse(data);
        if (msg[0] === 'EVENT' && msg[1] === label) {
          count++;
          seenIds.add(msg[2].id);
          if (msg[2].id === TARGET_ID) hit = true;
        }
        if (msg[0] === 'EOSE' && msg[1] === label) {
          clearTimeout(timer);
          ws.close();
          resolve({ label, hit, count, oldest: null });
        }
      };

      ws.onerror = () => { clearTimeout(timer); resolve({ label, hit, count, error: true }); };
    });
  }

  console.log(`=== nos.lol テスト（ターゲット ${TARGET_ID.slice(0,16)}…）===`);
  for (const [label, until] of Object.entries(UNTILS)) {
    const r = await test(label, until);
    console.log(`${r.hit ? '✅ HIT' : '❌ miss'} | until=${label} | 受信 ${r.count} 件 ${r.timeout ? '(timeout)' : ''}${r.error ? '(error)' : ''}`);
  }
  console.log('=== 完了 ===');
})();
