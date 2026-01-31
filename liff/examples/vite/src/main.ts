import liff from '@line/liff';

type BindPayload = {
  bindType: 'operator' | 'machine';
  bindCode: string;
  note?: string;
  idToken?: string;
  accessToken?: string;
  profile?: any;
};

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string | undefined;
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, children: (HTMLElement | Text | string)[] = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') (node as any)[k.toLowerCase()] = v;
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

function layout(title: string, body: HTMLElement) {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  const wrap = el('div', { class: 'wrap' }, [
    el('h1', {}, [title]),
    el('p', { class: 'hint' }, [
      'Demo 目標：在 LINE 內完成 LIFF Login → 取得 profile / idToken → 送到後端做「綁定」（operator 或 machine）。',
    ]),
    body,
  ]);

  app.append(wrap);
}

function codeBlock(obj: any) {
  return el('pre', {}, [JSON.stringify(obj, null, 2)]);
}

async function postJson(path: string, payload: any) {
  if (!API_BASE) throw new Error('Missing VITE_API_BASE. This demo expects a backend endpoint to receive binding.');
  const res = await fetch(`${API_BASE}${path}` , {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return json ?? text;
}

async function render() {
  if (!LIFF_ID || LIFF_ID === 'YOUR_LIFF_ID') {
    layout('LIFF login + bind demo', el('div', {}, [
      el('p', { class: 'error' }, ['缺少 LIFF ID。請設定環境變數 VITE_LIFF_ID。']),
      el('p', {}, ['建議做法：複製 .env.example → .env，並填入你在 LINE Developers 建立的 liffId。']),
    ]));
    return;
  }

  await liff.init({ liffId: LIFF_ID });

  const baseInfo = {
    isInClient: liff.isInClient(),
    isLoggedIn: liff.isLoggedIn(),
    os: liff.getOS(),
    language: liff.getLanguage(),
    version: liff.getVersion(),
  };

  if (!liff.isLoggedIn()) {
    layout('LIFF login + bind demo', el('div', {}, [
      el('p', {}, ['目前未登入。請點擊 Login（會導回來）。']),
      el('button', { onclick: () => liff.login() }, ['Login']),
      el('h2', {}, ['Base info']),
      codeBlock(baseInfo),
    ]));
    return;
  }

  const [profile, idToken, accessToken] = await Promise.all([
    liff.getProfile(),
    (async () => { try { return liff.getIDToken(); } catch { return null; } })(),
    (async () => { try { return liff.getAccessToken(); } catch { return null; } })(),
  ]);

  // UI
  const bindType = el('select', {}, [
    el('option', { value: 'operator' }, ['綁定營運商 (operator)']),
    el('option', { value: 'machine' }, ['綁定機台 (machine)']),
  ]) as HTMLSelectElement;

  const bindCode = el('input', { placeholder: '例如：operator_code 或 machine_code', value: '' }) as HTMLInputElement;
  const note = el('input', { placeholder: '備註（可選）', value: '' }) as HTMLInputElement;

  const result = el('pre', {}, ['(尚未送出)']);

  const btnBind = el('button', {
    onclick: async () => {
      (result as HTMLElement).textContent = 'Sending...';
      const payload: BindPayload = {
        bindType: bindType.value as any,
        bindCode: bindCode.value.trim(),
        note: note.value.trim() || undefined,
        // 這裡是「正規做法」：把 token / profile 送後端，由後端驗證 id_token 再做綁定。
        idToken: idToken || undefined,
        accessToken: accessToken || undefined,
        profile,
      };
      try {
        const r = await postJson('/liff/bind', payload);
        (result as HTMLElement).textContent = JSON.stringify(r, null, 2);
      } catch (e: any) {
        (result as HTMLElement).textContent = String(e?.message || e);
      }
    },
  }, ['送出綁定 (POST /liff/bind)']);

  const btnLogout = el('button', { onclick: () => { liff.logout(); location.reload(); } }, ['Logout']);

  const btnSendMsg = el('button', {
    onclick: async () => {
      if (!liff.isInClient()) {
        alert('不在 LINE client 內，無法 sendMessages');
        return;
      }
      await liff.sendMessages([{ type: 'text', text: '（zgovend）已完成登入示範，準備進行綁定流程。' }]);
      alert('已送出訊息');
    }
  }, ['Send message (in LINE client)']);

  layout('LIFF login + bind demo', el('div', {}, [
    el('div', { class: 'row' }, [btnLogout, btnSendMsg]),

    el('h2', {}, ['Base info']),
    codeBlock(baseInfo),

    el('h2', {}, ['Profile']),
    codeBlock(profile),

    el('h2', {}, ['Tokens (for backend verify)']),
    codeBlock({
      hasIdToken: Boolean(idToken),
      hasAccessToken: Boolean(accessToken),
      // 不直接顯示 token 全文（避免截圖/外流）
      idTokenPrefix: idToken ? idToken.slice(0, 16) + '...' : null,
      accessTokenPrefix: accessToken ? accessToken.slice(0, 10) + '...' : null,
    }),

    el('h2', {}, ['Bind (demo)']),
    el('p', { class: 'hint' }, [
      '這一步代表「綁定」：把 LINE 使用者身份（透過 idToken 驗證）綁到 zgovend 的 operator 或 machine。',
      ' Demo 會 POST 到 ',
      el('code', {}, [API_BASE || '(未設定 VITE_API_BASE)']),
      '/liff/bind。',
    ]),
    el('div', { class: 'grid' }, [
      el('label', {}, ['綁定類型', bindType]),
      el('label', {}, ['綁定代碼', bindCode]),
      el('label', {}, ['備註', note]),
    ]),
    btnBind,
    el('h3', {}, ['Result']),
    result,

    el('hr'),
    el('details', {}, [
      el('summary', {}, ['安全性提醒（為什麼需要後端驗證）']),
      el('p', {}, ['不要只信任前端回傳的 userId。正規做法是後端驗證 id_token（OIDC）或 access token。']),
      el('p', {}, ['後端驗證通過後，才把該 LINE user 綁到 operator/machine，並建立你自己的 session / JWT。']),
    ])
  ]));
}

// basic styles
const style = document.createElement('style');
style.textContent = `
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans", "PingFang TC", "Microsoft JhengHei"; }
  .wrap { padding: 16px; max-width: 860px; margin: 0 auto; }
  .hint { color: #444; }
  .error { color: #b00020; font-weight: 600; }
  pre { background: #0b1020; color: #d6e1ff; padding: 12px; border-radius: 8px; overflow: auto; }
  code { background: #eee; padding: 0 4px; border-radius: 4px; }
  button { padding: 8px 12px; margin-right: 8px; }
  input, select { padding: 8px; width: 100%; max-width: 520px; }
  label { display: grid; gap: 6px; margin: 8px 0; }
  .grid { display: grid; grid-template-columns: 1fr; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  hr { margin: 24px 0; }
`;
document.head.append(style);

render().catch((e) => {
  const app = document.getElementById('app')!;
  app.textContent = String(e);
});
