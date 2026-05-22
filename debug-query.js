// ブラウザのコンソールに貼り付けて実行
// 特定イベントがどのクエリで返るかをリレーごとに調べる

(async () => {
  const RELAYS = [
    'wss://yabu.me',
    'wss://r.kojira.io',
    'wss://nrelay-jp.c-stellar.net',
    'wss://nos.lol',
    'wss://relay.damus.io',
  ];

  const TARGET_ID = '3be84917196c56198b803f65495639522932062da05e1dbb7b881430e4890115';
  const PUBKEY   = '2fc29418a41a18753e56eac7953a8c2ffbd0c7118a38d6fa3ae41b9e8bce6b0a';
  const DTAG     = 'nosli-1695812622298';

  const QUERIES = {
    'ids直接':          { ids: [TARGET_ID] },
    'authors+d':        { kinds: [30023], authors: [PUBKEY], '#d': [DTAG] },
    'authors+t:nosli':  { kinds: [30023], authors: [PUBKEY], '#t': ['nosli'] },
    'authors only':     { kinds: [30023], authors: [PUBKEY] },
    '#t:nosli limit30': { kinds: [30023], '#t': ['nosli'], limit: 30 },
    '#t:nosli limit100':{ kinds: [30023], '#t': ['nosli'], limit: 100 },
  };

  async function testRelay(relayUrl) {
    return new Promise((resolve) => {
      const results = {};
      let remaining = Object.keys(QUERIES).length;
      const ws = new WebSocket(relayUrl);
      const timer = setTimeout(() => { ws.close(); resolve({ relay: relayUrl, error: 'timeout', results }); }, 10000);

      ws.onopen = () => {
        for (const [label, filter] of Object.entries(QUERIES)) {
          ws.send(JSON.stringify(['REQ', label, filter]));
        }
      };

      ws.onmessage = ({ data }) => {
        const msg = JSON.parse(data);
        if (msg[0] === 'EVENT') {
          const subId = msg[1];
          const ev   = msg[2];
          if (ev.id === TARGET_ID && QUERIES[subId]) {
            results[subId] = true;
          }
        }
        if (msg[0] === 'EOSE') {
          const subId = msg[1];
          if (QUERIES[subId]) {
            if (!results[subId]) results[subId] = false;
            remaining--;
            if (remaining <= 0) {
              clearTimeout(timer);
              ws.close();
              resolve({ relay: relayUrl, results });
            }
          }
        }
      };

      ws.onerror = () => { clearTimeout(timer); resolve({ relay: relayUrl, error: 'connect failed', results }); };
    });
  }

  console.log('=== クエリテスト開始 ===');
  console.log('対象イベント ID:', TARGET_ID.slice(0, 16) + '…');

  const all = await Promise.all(RELAYS.map(testRelay));

  for (const { relay, error, results } of all) {
    console.group(relay);
    if (error) { console.warn('⚠', error); }
    for (const [label, hit] of Object.entries(results)) {
      console.log(hit ? '✅' : '❌', label);
    }
    console.groupEnd();
  }
  console.log('=== 完了 ===');
})();
