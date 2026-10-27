/* 대만iN 변환기 core — 웹 변환기(index.html)와 비서(OpenClaw)가 같이 사용합니다. 계산·메일 규칙은 이 파일 한 곳만 고치세요. */
/* ===== 대만iN 변환기 core (pure functions) ===== */
const TW = (() => {
  const digits = s => String(s || '').replace(/\D/g, '');
  const num = s => { const t = String(s ?? '').replace(/[−–—]/g, '-').replace(/[^\d.\-]/g, '').replace(/(?!^)-/g, ''); const n = parseFloat(t); return isFinite(n) ? n : 0; };
  const won = n => Math.round(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const ntd = n => Math.round(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

  const LABELS = [
    ['agree', /^답변/], ['name', /^상품\s*명/], ['url', /^상품\s*(판매처\s*)?(URL|링크|주소)/i],
    ['image', /^상품\s*이미지/], ['qty', /^수량/], ['option', /^옵션/], ['price', /^(상품\s*)?구매\s*가/],
    ['buyer', /^구매자/], ['email', /^이메일/], ['rname', /^수취인\s*(이름|성명)/],
    ['raddr', /^수취인\s*주소/], ['zip', /^우편\s*번호/], ['rphone', /^수취인\s*(연락처|전화)/],
    ['pccc', /^개인\s*통관/], ['cash', /^현금\s*영수증/], ['tax', /^세금\s*계산서/],
    ['req', /^요청\s*(내용|사항)/], ['ship', /^배송\s*(유형|방법|방식)/]
  ];
  const ITEM_KEYS = new Set(['name', 'url', 'image', 'qty', 'option', 'price']);
  const SKIP = /^\((오프라인 판매|판매 페이지에 기재|기재하신 금액)/;
  const STOP = /^(■|※|\(※|_{3,}|-{5,}|─{3,}|\[미개봉|반드시 신청서|감사합니다|-?\s*아래 배송유형)/;

  function labelOf(line) {
    const t = line.replace(/^[\s\-*•·]+/, '');
    const m = t.match(/^([^:：]{1,40}?)\s*[:：]/);
    if (!m) return null;
    const key = m[1].replace(/[→>\-\s*]+$/, '').replace(/^[*\s]+/, '').trim();
    for (const [k, re] of LABELS) if (re.test(key)) return { k, value: t.slice(m[0].length).trim() };
    return null;
  }

  const LINK_PFX = /^(?:(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열|\d+)\s*번\s*째\s*(?:링크|상품)?|\d+\s*[.)])\s*[:：]?\s*/;
  const clean = s => s.replace(LINK_PFX, '').replace(/\s*\/\s*$/, '').trim();
  const lines = v => String(v || '').split('\n').map(s => s.trim()).filter(Boolean);

  function normalizeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    const sm = u.match(/shopee\.tw/i) && (u.match(/-i\.(\d+)\.(\d+)/) || u.match(/\/product\/(\d+)\/(\d+)/));
    if (sm) return `https://shopee.tw/product/${sm[1]}/${sm[2]}`;
    try {
      const url = new URL(u);
      [...url.searchParams.keys()].forEach(k => {
        if (/^(utm_|fbclid|gclid|sp_atk|xptdk|d_id|uls_trackid|extraParams|is_from_login|ref$|spm)/i.test(k)) url.searchParams.delete(k);
      });
      return url.toString().replace(/\?$/, '');
    } catch { return u; }
  }

  function sellerOf(u) {
    const sm = String(u).match(/shopee\.tw\/product\/(\d+)\//);
    if (sm) return { key: 'shopee:' + sm[1], orig: '' };
    try {
      const h = new URL(u).hostname.replace(/^(www|m|shop)\./, '');
      return { key: h, orig: h.split('.')[0].toUpperCase() };
    } catch { return { key: '', orig: '' }; }
  }

  function parsePerson(v) {
    v = String(v || '');
    const pm = v.match(/01[016789][\s.\-]?\d{3,4}[\s.\-]?\d{4}/);
    const rest = pm ? v.replace(pm[0], ' ') : v;
    const ko = (rest.match(/[가-힣]{2,6}/) || [''])[0];
    const en = ((rest.match(/[A-Za-z][A-Za-z .\-']*[A-Za-z]/) || [''])[0]).trim();
    return { ko, en, phone: pm ? digits(pm[0]) : '' };
  }

  function splitAddr(v) {
    v = String(v || '').replace(/\s*\n\s*/g, ' ').trim();
    if (!v) return { ko: '', en: '' };
    if (v.includes('//')) { const [a, ...b] = v.split('//'); return { ko: a.trim(), en: b.join(' ').trim() }; }
    const pm = v.match(/\(([^()가-힣]*[A-Za-z]{3,}[^()가-힣]*)\)\s*$/);
    if (pm) return { ko: v.slice(0, pm.index).trim(), en: pm[1].trim() };
    const lastHan = Math.max(...[...v].map((c, i) => /[가-힣]/.test(c) ? i : -1));
    if (lastHan >= 0) {
      const tail = v.slice(lastHan + 1);
      const cut = tail.search(/[A-Za-z0-9#]/);
      const rest = cut >= 0 ? tail.slice(cut) : '';
      if ((rest.match(/[A-Za-z]{3,}/g) || []).length >= 2) {
        // 영문 시작 지점을 숫자 블록 앞까지 당겨서 찾기
        const m = v.match(/(?:\s|,|\/)\s*((?:#?\d+[\w\-]*\s*,?\s*)*[A-Za-z].*)$/);
        if (m && !/[가-힣]/.test(m[1])) return { ko: v.slice(0, m.index).replace(/[,\/\s]+$/, '').trim(), en: m[1].trim() };
      }
    }
    return { ko: v, en: '' };
  }

  function normalizeEn(en) {
    let s = String(en || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    s = s.replace(/\b(\d+)\s*-?\s*dong\s*,?\s*(\d+)\s*-?\s*ho\b/i, '#$1-$2');
    s = s.replace(/^(?:Room|Rm\.?|Unit|Apt\.?|Ho)\s*#?\s*(\d+)/i, '#$1');
    if (!s.includes('#')) s = s.replace(/^(\d+)\s*-?\s*ho\b/i, '#$1');
    s = s.replace(/\s*,\s*/g, ', ').replace(/,\s*,/g, ',').replace(/[,\s]+$/, '');
    s = s.replace(/^(\d+)\s*-\s*(\d+)\s*,/, '#$1-$2,');
    const hm = s.match(/(?:^|,\s*)(#\d+(?:-\d+)?)(?=,|$)/);
    if (hm && hm.index > 0) s = hm[1] + ', ' + (s.slice(0, hm.index) + s.slice(hm.index + hm[0].length)).replace(/^[,\s]+|[,\s]+$/g, '');
    s = s.replace(/,\s*Republic of Korea\s*,\s*/i, ', ').replace(/,\s*Republic of Korea$/i, '');
    s += ', Republic of Korea';
    return s;
  }

  const fmtPhone = p => { const d = digits(p); return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : (p || ''); };
  const orderNo = p => { const d = digits(p); return d.length >= 8 ? `${d.slice(-8, -4)}-${d.slice(-4)}` : ''; };

  function splitOptions(opt) {
    const s = String(opt || '').replace(/^\s*옵션\s*[:：]\s*/, '').trim();
    if (!s) return [];
    const out = [];
    lines(s).forEach(l => l.split(/\s*[,，]\s*(?=[^,，]*[:：])/).forEach(p => { p = p.trim(); if (p) out.push(p); }));
    return out;
  }

  function qtyParse(line) {
    const m = line.match(/(\d+)\s*(?:개|ea|pcs|EA|장|권|세트|set)?\s*$/i) || line.match(/(\d+)\s*(?:개|ea|pcs|장|권|세트)/i);
    if (!m) return { qty: 1, rest: line.trim() };
    return { qty: parseInt(m[1], 10) || 1, rest: (line.slice(0, m.index) + line.slice(m.index + m[0].length)).replace(/[:：\-\s]+$/, '').trim() };
  }

  function itemsFromBlock(b, warn) {
    const urls = (b.url || '').match(/https?:\/\/[^\s<>"'，]+/g) || [];
    const n = Math.max(urls.length, 1);
    const items = Array.from({ length: n }, (_, i) => ({ name: '', ko: '', en: '', url: urls[i] || '', qty: 1, price: '', option: '' }));
    // 상품명
    const nameRaw = b.name || '';
    if (n === 1) items[0].name = lines(nameRaw).map(clean).join(' ');
    else {
      let parts = lines(nameRaw).map(clean).filter(Boolean);
      if (parts.length !== n) parts = nameRaw.replace(/\n/g, ' ').split(/\s+\/\s+|\s*\/\s*$/).map(clean).filter(Boolean);
      if (parts.length === n) parts.forEach((p, i) => items[i].name = p);
      else { items[0].name = lines(nameRaw).join(' '); if (nameRaw) warn('상품명 개수와 링크 개수가 달라 1번 상품에 상품명을 모두 넣었습니다. 나눠서 입력해 주세요.'); }
    }
    // 수량
    const qRaw = b.qty || '';
    const qLines = lines(qRaw).map(l => l.replace(LINK_PFX, '').trim());
    const rests = Array(n).fill('');
    if (n === 1) { const q = qtyParse(qLines.join(' ')); items[0].qty = q.qty; rests[0] = q.rest; }
    else if (qLines.length === n) qLines.forEach((l, i) => { const q = qtyParse(l); items[i].qty = q.qty; rests[i] = q.rest; });
    else {
      const ps = qRaw.split('/').map(s => s.trim()).filter(Boolean);
      if (ps.length === n) ps.forEach((l, i) => { const q = qtyParse(l); items[i].qty = q.qty; rests[i] = q.rest; });
      else if (qRaw) warn('수량을 상품별로 나누지 못했습니다. 수량을 확인해 주세요.');
    }
    // 가격
    const pRaw = b.price || '';
    const ps = pRaw.split(/[\/\n]+/).map(s => s.replace(LINK_PFX, '').trim()).filter(s => /\d/.test(s));
    if (ps.length === n) ps.forEach((p, i) => items[i].price = num(p));
    else if (n === 1 && ps.length) items[0].price = num(ps[0]);
    else if (pRaw.trim()) warn('구매가를 상품별로 나누지 못했습니다. 단가를 확인해 주세요.');
    // 옵션
    const oRaw = (b.option || '').replace(/^\s*옵션\s*[:：]\s*/, '');
    if (n === 1) items[0].option = oRaw.trim();
    else {
      const ol = lines(oRaw).map(l => l.replace(LINK_PFX, '').trim());
      if (ol.length === n) ol.forEach((o, i) => items[i].option = o);
      else if (oRaw.trim()) { items[0].option = oRaw.trim(); warn('옵션을 상품별로 나누지 못해 1번 상품에 모두 넣었습니다.'); }
    }
    items.forEach((it, i) => { if (rests[i] && !/^(없음|-)$/.test(rests[i])) it.option = [it.option, rests[i]].filter(Boolean).join(', '); });
    return items;
  }

  function parse(text) {
    const notes = [];
    const warn = m => notes.push(m);
    const src = String(text || '').replace(/\r/g, '');
    const L = src.split('\n');
    const fields = {}; const blocks = [{}];
    let cur = null, tgt = null;
    for (const raw of L) {
      const line = raw.trim();
      const lab = labelOf(line);
      if (lab) {
        cur = lab.k;
        if (ITEM_KEYS.has(cur)) {
          let b = blocks[blocks.length - 1];
          if (b[cur] !== undefined && (cur === 'name' || cur === 'url')) { b = {}; blocks.push(b); }
          b[cur] = b[cur] ? b[cur] + '\n' + lab.value : lab.value; tgt = { o: b, k: cur };
        } else { fields[cur] = fields[cur] ? fields[cur] + '\n' + lab.value : lab.value; tgt = { o: fields, k: cur }; }
        continue;
      }
      if (STOP.test(line)) { cur = null; tgt = null; continue; }
      if (SKIP.test(line)) continue;
      if (tgt) tgt.o[tgt.k] += '\n' + line;
    }
    const tidy = v => String(v || '').replace(/\n{3,}/g, '\n\n').trim();
    Object.keys(fields).forEach(k => fields[k] = tidy(fields[k]));
    blocks.forEach(b => Object.keys(b).forEach(k => b[k] = tidy(b[k])));

    const dm = src.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\.?\s+(\d{1,2}):(\d{2})/);
    const appliedAt = dm ? `${dm[1]}. ${dm[2].padStart(2, '0')}. ${dm[3].padStart(2, '0')}. ${dm[4].padStart(2, '0')}:${dm[5]}` : '';
    const headEmail = (src.match(/[\w.+\-]+@[\w\-]+\.[\w.\-]+/) || [''])[0];

    let items = [];
    const filled = blocks.filter(b => Object.keys(b).length);
    if (filled.length > 1) filled.forEach(b => items.push(...itemsFromBlock(b, warn)));
    else items = itemsFromBlock(filled[0] || {}, warn);
    items.forEach(it => { it.urlRaw = it.url; it.url = normalizeUrl(it.url); const s = sellerOf(it.url); it.sellerKey = s.key; it.sellerOrig = s.orig; it.sellerKo = ''; });

    const buyer = parsePerson(fields.buyer);
    const rn = parsePerson(fields.rname);
    const addr = splitAddr(fields.raddr);
    let rphone = digits((String(fields.rphone || '').match(/01[016789][\s.\-]?\d{3,4}[\s.\-]?\d{4}/) || [''])[0]);
    let rPhoneFromBuyer = false;
    if (!rphone && buyer.phone && (!rn.ko || rn.ko === buyer.ko)) { rphone = buyer.phone; rPhoneFromBuyer = true; }
    const shipTxt = lines(fields.ship)[0] || '';
    const ship = /특송|DEC/i.test(shipTxt) ? 'DEC' : /EMS/i.test(shipTxt) ? 'EMS' : /일반|POST/i.test(shipTxt) ? 'POST' : '';
    const reqText = tidy(fields.req);
    const rq = reqText;
    const pack = /재포장\s*보완/.test(rq) || (/포장\s*보완/.test(rq.replace(/재포장\s*보완/g, '')) && /재포장(?!\s*보완)/.test(rq)) ? 'pr'
      : /포장\s*보완/.test(rq) ? 'pp' : /재포장/.test(rq) ? 'rp' : '';
    const req = {
      pack, unopened: /미개봉/.test(rq), detail: /정밀\s*검수/.test(rq), separate: /나눔\s*배송/.test(rq),
      photo: /사진/.test(rq), bundle: /묶음\s*배송/.test(rq), biz: /사업자/.test(rq)
    };

    const f = {
      appliedAt, email: (fields.email || '').match(/[\w.+\-]+@[\w\-]+\.[\w.\-]+/)?.[0] || headEmail,
      agree: lines(fields.agree)[0] || '',
      buyerKo: buyer.ko, buyerEn: buyer.en, buyerPhone: buyer.phone,
      rKo: rn.ko, rEn: rn.en.toUpperCase(), addrKo: addr.ko, addrEn: normalizeEn(addr.en),
      zip: (String(fields.zip || '').match(/\d{5}/) || [''])[0], rPhone: rphone, rPhoneRaw: fields.rphone || '', rPhoneFromBuyer,
      pccc: (String(fields.pccc || '').match(/[Pp]\s?\d{12}/) || [''])[0].replace(/\s/g, '').toUpperCase(),
      cash: fields.cash || '', tax: fields.tax || '', reqText, ship, shipRaw: shipTxt
    };
    return { f, req, items, notes, recognized: Object.keys(fields).length + filled.length };
  }


  /* ---- 구글폼 (응답 시트 행 복사) ---- */
  function parseTSV(text) {
    const rows = []; let row = [], cell = '', i = 0, q = false;
    const s = String(text || '').replace(/\r/g, '');
    while (i < s.length) {
      const ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
        cell += ch; i++; continue;
      }
      if (ch === '"' && cell === '') { q = true; i++; continue; }
      if (ch === '\t') { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += ch; i++;
    }
    row.push(cell); rows.push(row);
    return rows.filter(r => r.some(x => String(x).trim()));
  }
  const FORM_KEYS = [
    ['ts', /타임스탬프/], ['bizno', /사업자\s*번호/], ['agree', /파손\s*면책/], ['step1', /Step\s*0?1/i],
    ['tmpl', /다량의 상품/], ['buyer', /Step\s*0?2|구매자\s*이름/i], ['rname', /수취인\s*이름/],
    ['addrKo', /수취인\s*주소\s*\(한글\)/], ['addrEn', /수취인\s*주소\s*\(영문\)/], ['zip', /우편\s*번호/],
    ['rphone', /수취인\s*연락처/], ['pccc', /개인\s*통관/], ['cash', /현금\s*영수증/], ['ship', /배송\s*서비스/],
    ['req', /배송\s*요청/], ['extra', /추가\s*요청/], ['email', /^이메일/], ['photo', /사진\s*첨부/]
  ];
  // 현재 대만iN 구글폼 1행 기준 기본 열 배치
  const FORM_DEFAULT = { ts: [0], email: [1, 7], agree: [2], step1: [3], tmpl: [4, 20], buyer: [5], bizno: [6], rname: [8], addrKo: [9], addrEn: [10], zip: [11], rphone: [12], pccc: [13], cash: [14], ship: [15], req: [16], extra: [17], photo: [21] };
  function formMap(header) {
    const m = {};
    header.forEach((h, i) => {
      const t = String(h || '').trim();
      for (const [k, re] of FORM_KEYS) if (re.test(t)) { (m[k] = m[k] || []).push(i); break; }
    });
    return m;
  }
  const isFormHeader = r => r && /타임스탬프/.test(r[0] || '');
  const looksForm = text => /\t/.test(text) && (/^\s*타임스탬프\t/.test(text) || /^\s*\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?\s*(오전|오후)?\s*\d{1,2}:\d{2}/.test(text) || (String(text).split('\n')[0].match(/\t/g) || []).length >= 8);

  function parseForm(text, savedMap) {
    const rows = parseTSV(text);
    let map = savedMap && Object.keys(savedMap).length ? savedMap : FORM_DEFAULT, headerFound = null;
    let data = rows;
    if (isFormHeader(rows[0])) { headerFound = formMap(rows[0]); map = headerFound; data = rows.slice(1); }
    return formFrom(data[0] || [], map, headerFound);
  }
  function formFrom(r, map, headerFound, extraNotes) {
    const g = k => (map[k] || []).map(i => String(r[i] ?? '').trim()).filter(Boolean);
    const one = k => g(k)[0] || '';
    // 상품: 양식 칸(상품명/판매처 URL/수량/옵션/구매가)을 게시판 파서로 정리
    const blob = [g('tmpl').join('\n\n'), /상품\s*명\s*[:：]|구매\s*가\s*[:：]|수량\s*[:：]/.test(g('step1').join('\n')) ? g('step1').join('\n') : ''].filter(Boolean).join('\n\n');
    const p = parse(blob);
    const step1 = g('step1').join('\n');
    const step1Urls = step1.match(/https?:\/\/[^\s<>"'，]+/g) || [];
    let items = p.items.filter(it => it.url || it.name || num(it.price));
    if (!items.some(it => it.url) && step1Urls.length) {
      items = step1Urls.map(u => { const url = normalizeUrl(u); const s = sellerOf(url); return { name: '', ko: '', en: '', url, urlRaw: u, qty: 1, price: '', option: '', sellerKey: s.key, sellerOrig: s.orig, sellerKo: '' }; });
    }
    if (!items.length) items = [{ name: '', ko: '', en: '', url: '', qty: 1, price: '', option: '', sellerKey: '', sellerOrig: '', sellerKo: '' }];
    const step1Labeled = /상품\s*명\s*[:：]|구매\s*가\s*[:：]|수량\s*[:：]/.test(step1);
    const custNote = [step1Labeled ? '' : step1.replace(/https?:\/\/[^\s<>"'，]+/g, '').replace(/\n{2,}/g, '\n').trim(), one('extra')].filter(Boolean).join(' / ');

    const tsm = one('ts').match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(오전|오후)?\s*(\d{1,2}):(\d{2})/);
    let appliedAt = '';
    if (tsm) { let h = +tsm[5]; if (tsm[4] === '오후' && h < 12) h += 12; if (tsm[4] === '오전' && h === 12) h = 0;
      appliedAt = `${tsm[1]}. ${tsm[2].padStart(2, '0')}. ${tsm[3].padStart(2, '0')}. ${String(h).padStart(2, '0')}:${tsm[6]}`; }
    const buyer = parsePerson(one('buyer'));
    const rn = parsePerson(one('rname'));
    let rphone = digits((one('rphone').match(/01[016789][\s.\-]?\d{3,4}[\s.\-]?\d{4}/) || [''])[0]);
    let rPhoneFromBuyer = false;
    if (!rphone && buyer.phone && (!rn.ko || rn.ko === buyer.ko)) { rphone = buyer.phone; rPhoneFromBuyer = true; }
    const shipTxt = one('ship');
    const ship = /특송|DEC/i.test(shipTxt) ? 'DEC' : /EMS/i.test(shipTxt) ? 'EMS' : /일반|POST/i.test(shipTxt) ? 'POST' : '';
    const reqRaw = one('req');
    const reqText = /요청사항\s*없음/.test(reqRaw) ? '' : reqRaw;
    const rq = [reqText, one('extra')].join(' ');
    const pack = /재포장\s*보완/.test(rq) ? 'pr' : /포장\s*보완/.test(rq) ? (/재포장(?!\s*보완)/.test(rq) ? 'pr' : 'pp') : /재포장/.test(rq) ? 'rp' : '';
    const cashTax = one('cash');
    const bizno = one('bizno');
    const req = { pack, unopened: /미개봉/.test(rq), detail: /정밀\s*검수/.test(rq), separate: /나눔\s*배송/.test(rq), photo: /사진/.test(rq), bundle: /묶음\s*배송/.test(rq), biz: !!bizno || /사업자\s*통관/.test(rq) };
    const enRaw = one('addrEn');
    const f = {
      appliedAt, email: (g('email').join(' ').match(/[\w.+\-]+@[\w\-]+\.[\w.\-]+/) || [''])[0],
      agree: /동의/.test(one('agree')) && !/미동의|동의\s*하지/.test(one('agree')) ? '동의' : one('agree'),
      buyerKo: buyer.ko, buyerEn: buyer.en, buyerPhone: buyer.phone,
      rKo: rn.ko, rEn: rn.en.toUpperCase(), addrKo: one('addrKo').replace(/\s*\n\s*/g, ' '),
      addrEn: /[A-Za-z]{3,}/.test(enRaw) ? normalizeEn(enRaw.replace(/\s*\n\s*/g, ' ')) : '',
      zip: (one('zip').match(/\d{5}/) || [''])[0], rPhone: rphone, rPhoneRaw: one('rphone'), rPhoneFromBuyer,
      pccc: (one('pccc').match(/[Pp]\s?\d{12}/) || [''])[0].replace(/\s/g, '').toUpperCase(), pcccRaw: one('pccc'),
      cash: /세금계산서/.test(cashTax) ? '' : cashTax, tax: /세금계산서/.test(cashTax) ? '발행' + (bizno ? ` (${bizno})` : '') : (bizno ? `사업자 ${bizno}` : ''),
      reqText: [reqText, one('extra')].filter(Boolean).join(' / '), ship, shipRaw: shipTxt, custNote
    };
    return { f, req, items, notes: [...(extraNotes || []), ...p.notes], recognized: r.length, headerMap: headerFound, source: 'form' };
  }



  /* ---- 구글폼 응답 화면(개별 보기)을 텍스트로 복사한 경우 ---- */
  const FV_TITLES = [
    ['agree', /^위의 유의 사항 및 파손 면책/], ['step1', /^Step\s*0?1\./i], ['tmpl', /^※\s*다량의 상품을 신청/], ['photo', /^구매하실 상품의 사진/],
    ['buyer', /^Step\s*0?2\./i], ['bizno', /^☆\s*사업자 번호/], ['email', /^이메일(\s*주소)?\s*$/], ['rname', /^★\s*수취인 이름/],
    ['addrKo', /^★\s*수취인 주소\s*\(한글\)/], ['addrEn', /^★\s*수취인 주소\s*\(영문\)/], ['zip', /^수취인 우편번호/], ['rphone', /^수취인 연락처/],
    ['pccc', /^수취인 개인통관/], ['cash', /^☆\s*현금영수증/], ['ship', /^★\s*배송 서비스/], ['req', /^★\s*배송 요청사항/], ['extra', /^★\s*추가 요청사항/],
    ['c1', /^■\s*개인정보 수집/], ['c2', /^■\s*개인정보 취급/]
  ];
  const looksFormView = text => !/\t/.test(text) && /Step\s*0?1\.\s*구매대행 상품 정보/i.test(text) && /수취인 (이름|주소)/.test(text);
  function parseFormView(text) {
    const L = String(text || '').replace(/\r/g, '').split('\n');
    const sec = {}; let cur = null;
    L.forEach(raw => {
      const line = raw.trim();
      const hit = FV_TITLES.find(([, re]) => re.test(line));
      if (hit && !(hit[0] === 'email' && sec.email && cur === 'bizno' && false)) { cur = hit[0]; const k = sec[cur] ? cur + '#' + Object.keys(sec).filter(x => x.startsWith(cur)).length : cur; sec[k] = []; cur = k; return; }
      if (cur) sec[cur].push(raw);
    });
    // 필수 항목은 "*" 줄 뒤가 답변. 선택 항목은 설명 다음 내용에서 패턴으로 찾음
    const ans = k => { const s = sec[k]; if (!s) return ''; const i = s.map(x => x.trim()).lastIndexOf('*'); return (i >= 0 ? s.slice(i + 1) : []).join('\n').trim(); };
    const body = k => (sec[k] || []).join('\n');
    const notes = [];
    const email = ans('email') || ans('email#1') || (body('email').match(/[\w.+\-]+@[\w\-]+\.[\w.\-]+/) || [''])[0];
    const shipLines = ans('ship').split('\n').map(s => s.trim()).filter(Boolean);
    const reqLines = ans('req').split('\n').map(s => s.trim()).filter(Boolean);
    if (shipLines.length > 1) notes.push('구글폼 화면 복사본에는 어떤 배송 서비스를 골랐는지 표시되지 않습니다. 배송유형을 직접 선택해 주세요.');
    if (reqLines.length > 1) notes.push('구글폼 화면 복사본에는 어떤 배송 요청사항을 체크했는지 표시되지 않습니다. 포장·검수 항목을 직접 체크해 주세요.');
    const bizm = body('bizno').match(/\b\d{3}-?\d{2}-?\d{5}\b/);
    const cashBody = body('cash').split('\n').filter(l => !/^\s*-|카드결제|현금영수증 발행을 원하실|예\)|세금계산서를 원하실|사업자등록증 사본|구매대행 수수료에 대해서는|상품가를 포함한|부가세 10%/.test(l)).join(' ').trim();
    const extraIdx = (sec.extra || []).findIndex(l => /배송메시지는 국제배송에 있어/.test(l));
    const extra = extraIdx >= 0 ? sec.extra.slice(extraIdx + 1).join('\n').trim() : '';
    const map = {}, r = [];
    const put = (k, v) => { map[k] = [r.length]; r.push(v || ''); };
    put('ts', ''); put('email', email); put('agree', ans('agree')); put('step1', ans('step1')); put('tmpl', ans('tmpl'));
    put('buyer', ans('buyer')); put('bizno', bizm ? bizm[0] : ''); put('rname', ans('rname')); put('addrKo', ans('addrKo'));
    put('addrEn', ans('addrEn')); put('zip', ans('zip')); put('rphone', ans('rphone')); put('pccc', ans('pccc'));
    put('cash', cashBody); put('ship', shipLines.length === 1 ? shipLines[0] : ''); put('req', reqLines.length === 1 ? reqLines[0] : ''); put('extra', extra);
    const out = formFrom(r, map, null, notes);
    // 영문 주소 칸에 한글 주소가 같이 적힌 경우 영문만 추출
    if (/[가-힣]/.test(ans('addrEn'))) { const sp = splitAddr(ans('addrEn')); if (sp.en) out.f.addrEn = normalizeEn(sp.en); }
    // 응답 화면 맨 끝의 "…제출됨" 날짜 = 신청일자
    {
      const src = String(text);
      const re = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*[.일]?[,\s]*(?:\([^)]*\)[,\s]*)?(오전|오후|AM|PM)?\s*(?:(\d{1,2}):(\d{2})(?::\d{2})?)?\s*(오전|오후|AM|PM)?/gi;
      const all = [...src.matchAll(re)];
      const near = all.filter(m => /제출|submitted/i.test(src.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)));
      let m = (near.length ? near : all.filter(x => x[5])).pop();
      // 연도 없는 형식 (10월 13일 오후 2:20 / 10/13/26 2:20 PM) 보완
      if (!m) {
        const re2 = /(?:(\d{1,2})월\s*(\d{1,2})일|(\d{1,2})\/(\d{1,2})\/(\d{2,4}))[,\s]*(?:\([^)]*\)[,\s]*)?(오전|오후|AM|PM)?\s*(?:(\d{1,2}):(\d{2})(?::\d{2})?)?\s*(오전|오후|AM|PM)?/gi;
        const all2 = [...src.matchAll(re2)];
        const n2 = all2.filter(x => /제출|submitted/i.test(src.slice(Math.max(0, x.index - 30), x.index + x[0].length + 30)));
        const x = (n2.length ? n2 : all2.filter(y => y[7])).pop();
        if (x) {
          const y = x[5] ? (x[5].length === 2 ? '20' + x[5] : x[5]) : String(new Date().getFullYear());
          const mo = x[1] || x[3], d = x[2] || x[4];
          m = [x[0], y, mo, d, x[6], x[7], x[8], x[9]];
        }
      }
      if (m) {
        const ap = m[4] || m[7] || '';
        let h = m[5] != null ? +m[5] : null;
        if (h != null) { if (/오후|PM/i.test(ap) && h < 12) h += 12; if (/오전|AM/i.test(ap) && h === 12) h = 0; }
        out.f.appliedAt = `${m[1]}. ${m[2].padStart(2, '0')}. ${m[3].padStart(2, '0')}.` + (h != null ? ` ${String(h).padStart(2, '0')}:${m[6]}` : '');
      }
    }
    out.viewCopy = true;
    return out;
  }

  /* ---- 정리된 주문서 텍스트(LINE 양식) 붙여넣기 ---- */
  const looksOrder = text => /Order\s*No\.?\s*[:：]/i.test(text) && /(Customer Info|@수취인|\[Seller\s*\d+\])/i.test(text);
  function splitTr(s) {
    s = String(s || '').trim();
    const m = s.match(/^(.*\S)\s*\(([^()]*\s-\s[^()]*)\)\s*$/);
    if (!m) return { name: s, ko: '', en: '' };
    const [ko, ...en] = m[2].split(/\s-\s/);
    return { name: m[1].trim(), ko: ko.trim(), en: en.join(' - ').trim() };
  }
  function parseOrder(text) {
    const notes = [];
    const L = String(text || '').replace(/\r/g, '').split('\n').map(s => s.replace(/\s+$/, ''));
    const f = { appliedAt: '', email: '', agree: '동의', buyerKo: '', buyerEn: '', buyerPhone: '', rKo: '', rEn: '', addrKo: '', addrEn: '', zip: '', rPhone: '', pccc: '', cash: '', tax: '', reqText: '', ship: '', shipRaw: '' };
    const req = { pack: '', unopened: false, detail: false, separate: false, photo: false, bundle: false, biz: false };
    const items = []; let source = 'board', paidDate = '', total = '';
    let seller = null, cur = null, inOpt = false, inCust = false;
    const finishItem = () => {
      if (!cur) return;
      const vars = cur.vars.length ? cur.vars : [{ lines: [], qty: cur.qty || 1 }];
      const units = cur.units.length === vars.length ? cur.units : vars.map(() => cur.unit || 0);
      vars.forEach((v, i) => {
        const base = { sellerKey: cur.sellerKey, sellerKo: seller?.ko || '', sellerOrig: seller?.orig || '', inland: '', note: '' };
        if (i === 0) items.push({ ...base, name: cur.name, ko: cur.ko, en: cur.en, url: cur.url, qty: v.qty, price: units[i], option: v.lines.join('\n') });
        else items.push({ ...base, name: cur.name, ko: cur.ko, en: cur.en, url: cur.url, qty: v.qty, price: units[i], option: v.lines.join('\n'), isOpt: true });
      });
      cur = null;
    };
    for (let k = 0; k < L.length; k++) {
      const raw = L[k], line = raw.trim();
      let m;
      if (!line) continue;
      if ((m = line.match(/^(\d{1,2})\.(\d{1,2})\s+Buying\s*\(([^)]*)\)\s*(?:\(₩?\s*([\d,]+)\))?/i))) {
        paidDate = `${new Date().getFullYear()}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; total = (m[4] || '').replace(/,/g, '');
        const t = m[3];
        f.ship = /DEC/i.test(t) ? 'DEC' : /EMS/i.test(t) ? 'EMS' : 'POST';
        req.pack = /Packing Plus\s*&\s*Repacking/i.test(t) ? 'pr' : /Packing Plus/i.test(t) ? 'pp' : /Repacking/i.test(t) ? 'rp' : '';
        if (/Unopened/i.test(t)) req.unopened = true;
        if (/현금영수증/.test(t)) req.cash = true;
        continue;
      }
      if ((m = line.match(/^\(\s*구매자\s*[:：]\s*(.+?)\s*\/\s*([\d\-\s]+?)\s*\)$/))) { f.buyerKo = m[1].trim(); f.buyerPhone = digits(m[2]); continue; }
      if (/^Plz do NOT open/i.test(line)) { req.unopened = true; continue; }
      if (/^Plz detail check/i.test(line)) { req.detail = true; continue; }
      if (/^Plz send it Separately/i.test(line)) { req.separate = true; continue; }
      if (/^Order\s*No/i.test(line)) continue;
      if ((m = line.match(/^E-?mail\s*[:：]\s*(\S+)/i))) { f.email = m[1]; continue; }
      if ((m = line.match(/^Customer\s*Request\s*[:：]\s*(.*)$/i))) { f.custReqEn = m[1].trim(); f.custReq = f.custReq || m[1].trim(); continue; }
      if ((m = line.match(/^구매대행\s*\((구글폼|게시판)\)\s*신청일자\s*[:：]\s*(.*)$/))) { source = m[1] === '구글폼' ? 'form' : 'board'; f.appliedAt = m[2].trim(); continue; }
      if ((m = line.match(/^\[Seller\s*\d+\]\s*(?:\((.*)\))?/i))) {
        finishItem(); inOpt = false;
        const nm = (m[1] || '').split(/\s-\s/);
        seller = { ko: (nm[0] || '').trim(), orig: nm.slice(1).join(' - ').trim() };
        if (seller.ko && !seller.orig) { seller.orig = seller.ko; seller.ko = ''; }
        continue;
      }
      if (/^@?\s*수취인 정보|Customer Info/i.test(line)) { finishItem(); inOpt = false; inCust = true; continue; }
      if (inCust) {
        if ((m = line.match(/^Name\s*\(한\/영\)\s*[:：]\s*(.*)$/i))) { const [a, ...b] = m[1].split('/'); f.rKo = a.trim(); f.rEn = b.join('/').trim().toUpperCase(); continue; }
        if ((m = line.match(/^Address\s*\(KOR\)\s*[:：]\s*(.*)$/i))) { f.addrKo = m[1].trim(); continue; }
        if ((m = line.match(/^Address\s*\(ENG\)\s*[:：]\s*(.*)$/i))) { f.addrEn = m[1].trim(); continue; }
        if ((m = line.match(/^Postal\s*Code\s*[:：]\s*(\d{5})/i))) { f.zip = m[1]; continue; }
        if ((m = line.match(/^Phone\s*[:：]\s*(.*)$/i))) { f.rPhone = digits(m[1]); continue; }
        if ((m = line.match(/^Personal\s*Customs\s*Code\s*[:：]\s*(\S+)/i))) { f.pccc = m[1].toUpperCase(); continue; }
        continue;
      }
      if (/^Total\s*Price/i.test(line)) { finishItem(); inOpt = false; continue; }
      if (cur && /^Price\s*[:：]/i.test(line)) {
        inOpt = false;
        const ex = (line.match(/\(([^()]*\*[^()]*)\)\s*$/) || [])[1];
        if (ex) { const parts = ex.split('+').map(s => s.trim().split('*').map(x => num(x))); cur.units = parts.map(p => p[0]); if (parts.length === 1) cur.unit = parts[0][0]; }
        else cur.unit = num((line.match(/[:：]\s*([\d,.]+)/) || [])[1]) / (cur.qty || 1);
        if (cur.vars.length > 1 && cur.units.length === 1) cur.units = cur.vars.map(() => cur.units[0]);
        continue;
      }
      if (cur && inOpt) {
        const qm = line.match(/\(\s*QTY\s*[:：]\s*(\d+)\s*\)\s*$/i);
        if (!cur._v) { cur._v = { lines: [], qty: 1 }; }
        cur._v.lines.push(line.replace(/\s*\(\s*QTY\s*[:：]\s*\d+\s*\)\s*$/i, ''));
        if (qm) { cur._v.qty = +qm[1]; cur.vars.push(cur._v); cur._v = null; }
        continue;
      }
      if (cur && /^Option\s*[:：]?\s*$/i.test(line)) { inOpt = true; continue; }
      if (cur && (m = line.match(/^Qty\s*[:：]\s*(\d+)/i))) { cur.qty = +m[1]; continue; }
      if (cur && !cur.url && /^https?:\/\//i.test(line)) { cur.url = normalizeUrl(line); cur.sellerKey = sellerOf(cur.url).key; continue; }
      if ((m = line.match(/^(\d+)\.\s+(.+)$/))) {
        finishItem();
        const t = splitTr(m[2]);
        cur = { ...t, url: '', qty: 1, vars: [], units: [], unit: 0, sellerKey: '' };
        continue;
      }
    }
    finishItem();
    if (cur && cur._v) {}
    if (!f.buyerKo) { f.buyerKo = f.rKo; f.buyerPhone = f.rPhone; }
    f.ship = f.ship || 'POST';
    if (!items.length) notes.push('주문서에서 상품을 찾지 못했습니다.');
    return { f, req, items, notes, recognized: items.length, source, paidDate, total };
  }

  /* ---- 견적 ---- */
  function sellerCount(items) { return groupSellers(items).length; }
  function groupKey(it, i) {
    if (it.groupOverride) return it.groupOverride;
    const nm = `${String(it.sellerKo || '').trim()}|${String(it.sellerOrig || '').trim()}`.toLowerCase();
    return nm !== '|' ? 'n:' + nm : (it.sellerKey || it.url || '#' + i);
  }
  function svcFee(req, items) {
    const rows = [];
    if (req.pack === 'pp') rows.push(['포장보완', 2000]);
    if (req.pack === 'rp') rows.push(['재포장', 2000]);
    if (req.pack === 'pr') rows.push(['재포장보완', 3000]);
    if (req.detail) rows.push(['정밀검수', 3000 + Math.max(0, items.length - 1) * 1000]);
    if (req.separate) rows.push(['나눔배송 재포장', 2000]);
    return rows;
  }
  function quote(st) {
    const rate = num(st.q.rate) || 45;
    const inlandRows = groupSellers(st.items).map(g => {
      const own = g.items.find(it => String(it.inland ?? '').trim() !== '');
      const allSold = g.items.every(it => it.soldOut);
      const n = allSold ? 0 : num(own ? own.inland : st.q.inland);
      return { allSold, k: g.k, name: g.ko || g.orig || (/^(new:|#)/.test(g.k) ? '판매처명 미입력' : g.k), ntd: n, krw: Math.round(n * rate), isDefault: !own };
    });
    const inland = inlandRows.reduce((a, r) => a + r.ntd, 0);
    const lines = st.items.map(it => { const sub = it.soldOut ? 0 : num(it.price) * (num(it.qty) || 0); return { ...it, soldOut: !!it.soldOut, subNtd: sub, subKrw: Math.round(sub * rate) }; });
    const itemsNtd = lines.reduce((a, l) => a + l.subNtd, 0);
    const itemsKrw = lines.reduce((a, l) => a + l.subKrw, 0);
    const inlandKrw = inlandRows.reduce((a, r) => a + r.krw, 0);
    const base = itemsKrw + inlandKrw;
    const sc = groupSellers(st.items).filter(g => g.items.some(it => !it.soldOut)).length;
    let fee, feeNote;
    if (sc >= 5) { fee = Math.round(base * 0.12); feeNote = '다건 12% (판매처 5곳 이상)'; }
    else if (base >= 1000000) { fee = Math.round(base * 0.06); feeNote = '총 구매가 100만원 이상 6%'; }
    else if (base >= 500000) { fee = Math.round(base * 0.08); feeNote = '총 구매가 50만원 이상 8%'; }
    else if (base >= 100000) { fee = Math.round(base * 0.10); feeNote = '총 구매가 10만원 이상 10%'; }
    else if (sc >= 3) { fee = 4000 * sc; feeNote = `판매처 ${sc}곳 × 4,000원`; }
    else { fee = 10000; feeNote = '총 구매가 10만원 이하'; }
    if (String(st.q.feeOverride).trim() !== '') { fee = Math.round(num(st.q.feeOverride)); feeNote = '직접 입력'; }
    const svc = svcFee(st.req, st.items);
    const svcKrw = st.q.includeSvc ? svc.reduce((a, r) => a + r[1], 0) : 0;
    const supply = Math.round(base + fee + svcKrw);
    const t10 = v => Math.round(v * 0.1);
    const vat = st.q.taxInvoice ? lines.reduce((a, l) => a + t10(l.subKrw), 0) + inlandRows.reduce((a, r) => a + t10(r.krw), 0) + t10(fee) + t10(svcKrw) : 0;
    const total = supply + vat;
    return { rate, inland, inlandRows, lines, itemsNtd, itemsKrw, inlandKrw, base, fee, feeNote, svc, svcKrw, supply, vat, total, sellers: sc };
  }

  /* ---- LINE 주문서 ---- */
  function groupSellers(items) {
    const g = [];
    let prev = null;
    items.forEach((it, i) => {
      if (it.isOpt && prev) { prev.items.push(it); return; }
      const k = groupKey(it, i);
      let s = g.find(x => x.k === k);
      if (!s) { s = { k, ko: it.sellerKo, orig: it.sellerOrig, items: [] }; g.push(s); }
      if (!s.ko && it.sellerKo) s.ko = it.sellerKo;
      if (!s.orig && it.sellerOrig) s.orig = it.sellerOrig;
      s.items.push(it); prev = s;
    });
    return g;
  }
  // 같은 판매처 안에서 연속된 같은 상품(링크+상품명)은 한 상품의 옵션 줄로 묶음
  const sameProduct = (a, b) => !!a && !!b && String(a.url || '').trim() === String(b.url || '').trim() && String(a.name || '').trim() === String(b.name || '').trim() && (String(a.url || '').trim() || String(a.name || '').trim());
  function productBlocks(items) {
    const out = [];
    items.forEach(it => { const last = out[out.length - 1]; if (last && (it.isOpt || sameProduct(last.items[0], it))) last.items.push(it); else out.push({ items: [it] }); });
    return out;
  }
  function differentBuyer(f) {
    if (!f.buyerKo && !f.buyerPhone) return false;
    if (f.buyerKo && f.rKo && f.buyerKo !== f.rKo) return true;
    if (f.buyerPhone && f.rPhone && f.buyerPhone !== f.rPhone && f.buyerKo !== f.rKo) return true;
    return false;
  }
  function orderText(st, qt) {
    const f = st.f, r = st.req;
    const tags = [f.ship || 'POST'];
    if (r.pack === 'pp') tags.push('Packing Plus');
    if (r.pack === 'rp') tags.push('Repacking');
    if (r.pack === 'pr') tags.push('Packing Plus & Repacking');
    if (r.unopened) tags.push('Unopened');
    if (r.cash) tags.push('현금영수증');
    const total = String(st.o.totalOverride).trim() !== '' ? num(st.o.totalOverride) : qt.total;
    const pd = st.o.paidDate ? st.o.paidDate.slice(5).replace('-', '.') : '';
    const out = [`${pd}  Buying (${tags.join(', ')}) (₩${won(total)}) `];
    if (differentBuyer(f)) out.push(`(구매자: ${f.buyerKo} / ${f.buyerPhone} )`);
    if (r.unopened) out.push('Plz do NOT open it');
    if (r.detail) out.push('Plz detail check it condition and Photo');
    if (r.separate) out.push('Plz send it Separately');
    out.push('');
    out.push(`Order No.: ${orderNo(f.rPhone || f.buyerPhone)}`);
    out.push(`E-mail: ${f.email}`);
    out.push(`구매대행(${st.source === 'form' ? '구글폼' : '게시판'}) 신청일자: ${f.appliedAt}`);
    { const cr = String(f.custReqEn || f.custReq || '').trim(); if (cr) out.push(`Customer Request: ${cr.replace(/\s*\n\s*/g, ' / ')}`); }
    groupSellers(st.items).filter(s => s.items.some(it => !it.soldOut)).forEach((s, si) => {
      out.push('');
      const sn = [s.ko, s.orig].filter(Boolean).join(' - ');
      out.push(`[Seller ${si + 1}]${sn ? ` (${sn})` : ''}`);
      productBlocks(s.items).map(b => ({ items: b.items.filter(x => !x.soldOut) })).filter(b => b.items.length).forEach((b, bi) => {
        const it = b.items[0];
        out.push('');
        const tr = [it.ko, it.en].filter(Boolean).join(' - ');
        out.push(`${bi + 1}. ${it.name}${tr ? ` (${tr})` : ''}`);
        out.push('');
        out.push(it.url || '(링크 없음)');
        out.push('');
        const qs = b.items.map(x => num(x.qty) || 1);
        const qTot = qs.reduce((a, q) => a + q, 0);
        out.push(`Qty: ${qTot}`);
        const optLines = [];
        b.items.forEach((x, xi) => {
          const opts = splitOptions(x.option);
          if (opts.length) opts.forEach((o, oi) => optLines.push(oi === opts.length - 1 ? `${o} (QTY: ${qs[xi]})` : o));
          else if (b.items.length > 1) optLines.push(`Default (QTY: ${qs[xi]})`);
        });
        if (optLines.length) { out.push('Option:'); optLines.forEach(l => out.push(l)); }
        const ps = b.items.map(x => num(x.price));
        const sum = b.items.reduce((a, x, xi) => a + ps[xi] * qs[xi], 0);
        const expr = ps.every(p => p === ps[0]) ? `${ps[0]}*${qTot}` : b.items.map((x, xi) => `${ps[xi]}*${qs[xi]}`).join(' + ');
        out.push(`Price: ${ntd(sum)} (TWD) (${expr})`);
      });
    });
    out.push('');
    out.push(`Total Price: ${ntd(qt.itemsNtd)} (TWD)`);
    out.push('');
    out.push('@수취인 정보 / Customer Info');
    out.push(`Name (한/영): ${f.rKo} / ${String(f.rEn || '').toUpperCase()}`);
    out.push(`Address (KOR): ${f.addrKo}`);
    out.push(`Address (ENG): ${f.addrEn}`);
    out.push(`Postal Code: ${f.zip}`);
    out.push(`Phone: ${fmtPhone(f.rPhone)}`);
    out.push(`Personal Customs Code: ${f.pccc}`);
    return out.join('\n');
  }

  /* ---- 확인 필요 ---- */
  function checks(st, qt) {
    const f = st.f, w = [];
    const add = (lvl, msg) => w.push({ lvl, msg });
    if (f.agree && !/^동의/.test(f.agree.trim())) add('bad', `파손 면책 동의가 "${f.agree}"로 되어 있습니다.`);
    if (!f.agree) add('warn', '파손 면책 동의 답변이 비어 있습니다.');
    if (!f.appliedAt) add('warn', '신청일자가 없습니다. 주문서에 들어갈 신청일자를 직접 입력해 주세요. (예: 2026. 10. 13. 14:20)');
    if (f.rPhoneFromBuyer) add('warn', `수취인 연락처 칸에 "${f.rPhoneRaw || '(빈칸)'}"이 적혀 있어 구매자 번호로 대신했습니다. 확인해 주세요.`);
    if (!f.rPhone) add('bad', `수취인 연락처가 전화번호가 아닙니다${f.rPhoneRaw ? ` ("${f.rPhoneRaw}")` : ''}. Order No.를 만들 수 없어 구매자 번호를 대신 씁니다.`);
    if (!/^P\d{12}$/.test(f.pccc)) add('bad', '개인통관고유부호(P + 숫자 12자리)를 확인해 주세요.');
    if (!/^\d{5}$/.test(f.zip)) add('warn', '우편번호(5자리)를 확인해 주세요.');
    if (!f.addrEn) add('warn', '영문 주소가 없습니다. [한글 주소 → 영문 주소 변환]을 눌러 주세요.');
    else if (f.addrEnAuto) add('info', `영문 주소는 한글 주소를 네이버 영문 표기순으로 자동 변환한 것입니다. 도로명·동·호수를 한 번 확인해 주세요.${f.addrEnRaw && f.addrEnRaw !== f.addrEn ? ` (고객 기재 영문: ${f.addrEnRaw})` : ''}`);
    if (!f.rEn) add('warn', '수취인 영문 이름이 비어 있습니다.');
    if (!f.ship) add('warn', '배송유형이 없어 일반배송(POST)으로 처리합니다.');
    st.items.forEach((it, i) => {
      if (it.soldOut) { add('info', `${i + 1}번 줄은 품절로 견적·주문서에서 제외됩니다.`); return; }
      if (num(it.price) < 0) { add('info', `${i + 1}번 줄은 할인(${num(it.price)} NTD × ${num(it.qty) || 1})으로 차감됩니다.`); return; }
      if (it.isOpt) { if (!num(it.price)) add('warn', `${i + 1}번 옵션 줄 단가(NTD)가 비어 있습니다.`); return; }
      if (!it.url) add('bad', `${i + 1}번 상품 링크가 없습니다.`);
      if (!num(it.price)) add('warn', `${i + 1}번 상품 단가(NTD)가 비어 있습니다.`);
      if (it.url && !it.sellerOrig && !it.sellerKo) add('warn', `${i + 1}번 상품의 판매처명을 입력해 주세요.`);
      if (/fitting-room|customi[sz]e|design/i.test(it.url)) add('info', `${i + 1}번 링크는 커스텀 제작 페이지라 옵션 정보가 꼭 함께 전달돼야 합니다.`);
    });
    const taxYes = /발행|예|yes|o\b/i.test(f.tax) && !/미발행|안|no|x\b/i.test(f.tax);
    if ((taxYes || st.req.biz) && !st.q?.taxInvoice) add('info', `고객이 세금계산서/사업자통관을 적었습니다 ("${f.tax || '사업자통관'}"). 필요하면 견적에서 [세금계산서 발행]을 체크해 주세요. 사업자통관은 특송(DEC)으로만 진행됩니다.`);
    if (f.custNote) add('info', `고객 메모: ${f.custNote}`);
    if (f.pcccRaw && !f.pccc) add('info', `통관부호 칸 원문: "${f.pcccRaw}"`);
    if (st.req.bundle) add('info', '묶음배송 요청이 있습니다.');
    if (st.req.photo) add('info', '사진 요청이 있습니다.');
    const usd = qt.itemsNtd / 32;
    if (qt.itemsNtd && usd >= 150) add('info', `상품가 약 $${Math.round(usd)} — 미화 150달러 이상이면 관부가세 안내가 필요합니다.`);
    return w;
  }


  /* ---- 견적 메일 (웹 변환기와 비서가 같이 사용) ---- */
const DEFAULTS = {
  notice: 'https://www.taiwanin.kr/boardPost/109752/10', agreeUrl: 'https://forms.gle/wT6ePrUQRTZRdDX9A', feeUrl: 'https://www.taiwanin.kr/shippingfee',
  commentQuote: `안녕하세요. 고객님
메일을 통해 견적 안내드렸습니다.
메일 확인 부탁드리며 해당 금액 입금 및 동의서 제출해주시면
확인 후 구매 진행하도록 하겠습니다.
아울러 대만 경우 구매 완료까지는 판매자마다 상이하여 시간이 다소 소요됩니다.
하여 별도의 완료 안내를 드리기 어려운 점 양해 부탁드립니다.
혹시라도 구매시 변동사항이 확인되면 바로 안내드리겠습니다.
감사합니다.`,
  acc1Bank: '국민은행 476101-01-454482', acc1Holder: '여조은',
  acc2Bank: '토스뱅크 1000-0080-2716', acc2Holder: '여휘수',
  acc3Bank: '국민은행 895401-00-038538', acc3Holder: '여조은(이안어스)', comment: '안녕하세요 메일로 견적드렸습니다 감사합니다'
};
const accKey = n => (n === 4 ? 3 : n);
const accNoOf = st => (st.q.account && st.q.account !== 'auto' ? +st.q.account : (st.req.biz ? 4 : st.q.taxInvoice ? 3 : 1));
const subject = st => `[대만iN] 구매대행 견적 안내- ${st.q.title || '상품'}`;
function mailHtml(st, qt, S) {
  S = Object.assign({}, DEFAULTS, S || {});
  const W = won, N = ntd, TW = API;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const accBank = n => S['acc' + accKey(n) + 'Bank'], accHolder = n => S['acc' + accKey(n) + 'Holder'];
  const accNo = () => accNoOf(st);
  const td = 'border:1px solid #c9c9c9;padding:4px 6px;font-size:12px;line-height:1.45;vertical-align:middle;word-break:keep-all;overflow-wrap:anywhere;';
  const th = td + 'background:#f2f2f2;font-weight:bold;text-align:center;';
  const hr = '<div style="color:#999">' + '-'.repeat(100) + '</div>';
  const a = (u, t) => u ? `<a href="${esc(u)}" style="color:#1a55c4">${t}</a>` : t;
  const memo = String(st.q.memo || '').trim();
  // 판매처별로 상품을 모으고, 각 상품 바로 아래에 대만 내륙배송비 줄 (같은 판매처는 마지막 상품 줄에만 금액, 나머지는 "-")
  let no = 0;
  const TX = !!st.q.taxInvoice, t10 = v => Math.round(v * 0.1);
  const txc = (style, val) => TX ? `<td style="${style}text-align:right">${val}</td>` : '';
  const tf = 'border:1px solid #c9c9c9;padding:2px 6px;font-size:11px;line-height:1.3;vertical-align:middle;word-break:keep-all;';
  const ts = 'border:1px solid #c9c9c9;padding:1px 6px;font-size:11px;line-height:1.3;vertical-align:middle;color:#555;';
  const groups = TW.groupSellers(qt.lines);
  const orderNo = new Map(); { let c = 0; groups.forEach(g => TW.productBlocks(g.items).forEach(b => { c++; b.items.forEach(x => orderNo.set(qt.lines.indexOf(x), `No.${c}`)); })); }
  const rows = groups.map((g, gi) => {
    const ir = qt.inlandRows[gi] || { ntd: 0, krw: 0 };
    const blocks = TW.productBlocks(g.items);
    const links = blocks.map((b, k) => b.items[0].url ? a(b.items[0].url, blocks.length > 1 ? `상품링크${k + 1}` : '상품링크') : '').filter(Boolean).join('<br>');
    const nm = g.ko || g.orig || '';
    const span = g.items.length + blocks.length;
    const notes = g.items.map(x => ({ no: qt.lines.indexOf(x), t: String(x.note || '').trim() })).filter(x => x.t);
    const noteHtml = notes.length ? `<div style="margin-top:6px;color:#c0392b;text-align:left">${notes.map(x => `${g.items.length > 1 ? `[${orderNo.get(x.no)}] ` : ''}${esc(x.t).replace(/\n/g, '<br>')}`).join('<br>')}</div>` : '';
    let first = true;
    return blocks.map((b, bi) => {
      no++;
      const lastBlock = bi === blocks.length - 1;
      const itemRows = b.items.map((l, oi) => {
        const note = first ? `<td rowspan="${span}" style="${td}text-align:center">판매처 ${gi + 1}${nm ? `<br>${esc(nm)}` : ''}${links ? `<br>${links}` : ''}${noteHtml}</td>` : '';
        first = false;
        const SO = l.soldOut ? 'text-decoration:line-through;color:#999;' : '';
        return `<tr>
    <td style="${td}text-align:center">${oi === 0 ? no : ''}</td>
    <td style="${td}text-align:center"><span style="${SO}">${oi === 0 ? esc(l.name) + (TX && l.en ? '<br>' + esc(l.en) : '') : ''}</span>${l.soldOut ? ' <b style="color:#c0392b">(품절)</b>' : ''}</td>
    <td style="${td}text-align:center;${SO}">${esc(TW.splitOptions(l.option).join(', '))}</td>
    <td style="${td}text-align:right;${SO}">${esc(l.qty)}</td>
    <td style="${td}text-align:right;${SO}">${N(TW.num(l.price))}</td>
    <td style="${td}text-align:right">${l.soldOut ? '<span style="color:#c0392b">품절</span>' : N(l.subNtd)}</td>
    <td style="${td}text-align:right${l.subKrw < 0 ? ';color:#c0392b' : ''}">${l.soldOut ? '-' : W(l.subKrw)}</td>${txc(td + (l.subKrw < 0 ? 'color:#c0392b;' : ''), l.soldOut ? '-' : W(t10(l.subKrw)))}${note}</tr>`;
      }).join('');
      return itemRows + `
<tr><td style="${ts}"></td><td style="${ts}text-align:center">대만 내륙배송비</td><td style="${ts}"></td><td style="${ts}"></td><td style="${ts}"></td><td style="${ts}text-align:right">${lastBlock && !ir.allSold ? N(ir.ntd) : ''}</td><td style="${ts}text-align:right">${lastBlock && !ir.allSold ? W(ir.krw) : '-'}</td>${txc(ts, lastBlock ? W(t10(ir.krw)) : '-')}</tr>`;
    }).join('');
  }).join('');
  const svcRow = st.q.includeSvc && qt.svcKrw ? `<tr><td style="${tf}"></td><td colspan="5" style="${tf}font-weight:bold">부가서비스</td><td style="${tf}text-align:right">${W(qt.svcKrw)}</td>${txc(tf, W(t10(qt.svcKrw)))}<td style="${tf}">${esc(qt.svc.map(r => r[0]).join(', '))}</td></tr>` : '';
  return `<div>
안녕하세요, 대만iN입니다.<br>
고객님께서 요청하신 상품의 예상 견적 안내드립니다.<br>
<br>
${memo ? esc(memo).replace(/\n/g, '<br>') + '<br><br>' : ''}<b>구매대행 특성상 구매가 이뤄지면 변경 및 취소가 불가하오니 신중한 구매 결정 부탁드립니다.</b><br>
<br>
<b>내용을 충분히 숙지하신 후, 하단에 첨부드린 견적 내역 및 계좌 정보를 확인해 주시기 바랍니다.</b><br>
<br>
${hr}
<br>
<b>⚠️ 이용 약관 및 유의사항</b><br>
<b>1. 취소/환불: 국제 배송 시작 후에는 단순 변심에 의한 교환/환불이 불가합니다.</b><br>
<b>2. 책임 범위: 대행업체는 제조사 불량, A/S, 중고 상품의 품질을 책임지지 않습니다.</b><br>
<b>3. 파손 면책: 국제 운송 중 발생하는 파손에 대한 보상이 어렵습니다. 파손에 민감한 상품은 신중한 구매를 권장하며, 아래 동의서를 작성해 주셔야 발송이 가능합니다.</b><br>
<br>
<b>✅ 필수 작성: 파손 면책 동의서</b><br>
<b>&nbsp;👉 [${a(S.agreeUrl, '동의서 작성하기 (클릭)')}] &nbsp;/ (${a(S.agreeUrl, esc(S.agreeUrl))})</b><br>
<br>
${hr}
<br>
<b>📢 필독: 국제배송 일정 및 체계 개편</b><br>
<b>배송 방식에 따라 출고 일정이 상이하오니 반드시 확인해 주세요.</b><br>
<br>
<b>* 특송 배송: 매주 화요일, 금요일 출고</b><br>
<b>* 일반 / EMS 배송: 주 1회 출고 (차수별 별도 고지)</b><br>
${S.notice ? `<b>* [${a(S.notice, '👉 상세 안내 공지 확인하기')}] &nbsp;/ (${a(S.notice, esc(S.notice))})</b><br>` : ''}<b>* 참고: 마감 시간 이후 입금 건은 다음 출고 일정으로 자동 이월됩니다.</b><br>
<br>
${hr}
<br>
📦 배송 및 사진 확인 서비스<br>
<b>* 소요 기간(영업일 기준 출고 이후): EMS(4~8일) / 특송(7~10일) / 일반(10~20일)</b><br>
<b>* 배송 변경: 상품 도착 전까지만 가능하며, 미지정 시 <span style="background:#fff35c">'일반배송'</span>이 적용됩니다.</b><br>
<b>* 사진 확인: 상품 도착 후 국제배송비 안내 시 실물 사진이 첨부됩니다.</b><br>
<b>* 미개봉 요청: 개봉 확인을 원치 않으시면 반드시 미리 말씀해 주세요.</b><br>
<br>
${hr}
<br>
<br>
💸 관부가세 안내<br>
<b>* 관부가세는 상품 총 구매가가 미화 150달러 이상일 때 발생합니다.</b><br>
<b>* 통관 시 관세사로부터 별도 안내가 진행되며, 해당 안내에 따라 납부해 주시면 통관이 완료됩니다.</b><br>
<br>
<br>
💰 예상 견적 내역 및 결제 안내<br>
안내드린 견적가 입금 및 동의서 확인 후 구매가 진행됩니다.<br>
<br>
* 국제배송비: 상품 패킹 후 무게/부피 중 큰 값으로 산정됩니다.<br>
<b>(다품목 다량의 상품일 경우 일반배송 또는 EMS으로 적용될 수 있습니다.<br>
이 점 참고 부탁드립니다. )</b><br>
<br>
[${a(S.feeUrl, '👉 배송비 요율 확인')}] / &nbsp;(${a(S.feeUrl, esc(S.feeUrl))})<br>
* 주의: 실제 구매 시 변동사항이 생기면 즉시 안내드리겠습니다.<br>
<br>
<b>추가 문의 사항은 언제든 말씀해 주세요.</b><br>
<b>항상 저희 대만iN을 이용해 주셔서 감사합니다.</b><br>
<br>
${hr}
<b>[상세 내역 및 입금 계좌]</b><br>
<b>(₩${W(qt.total)})</b>
<table width="${TX ? 840 : 760}" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px;width:${TX ? 840 : 760}px;table-layout:fixed">
<colgroup><col width="34"><col width="196"><col width="128"><col width="40"><col width="68"><col width="74"><col width="86">${TX ? '<col width="80">' : ''}<col width="134"></colgroup>
<tr><th width="34" style="${th}">No.</th><th width="196" style="${th}">품명</th><th width="128" style="${th}">옵션 (규격)</th><th width="40" style="${th}">수량</th><th style="${th}">단가(NTD)</th><th style="${th}">공급가액<br>(NTD)</th><th style="${th}">공급가액(KW)</th>${TX ? `<th style="${th}">세액(KW)</th>` : ''}<th style="${th}min-width:180px">비고</th></tr>
${rows}
<tr><td style="${tf}"></td><td colspan="5" style="${tf}font-weight:bold">구매대행비</td><td style="${tf}text-align:right">${W(qt.fee)}</td>${txc(tf, W(t10(qt.fee)))}<td style="${tf}">${esc(qt.feeNote === '직접 입력' ? '' : qt.feeNote)}</td></tr>
${svcRow}
<tr><td style="${tf}"></td><td colspan="5" style="${tf}font-weight:bold">국제배송비</td><td style="${tf}text-align:right">추후 안내</td>${txc(tf, '-')}<td style="${tf}"></td></tr>
<tr><td colspan="6" style="${th}padding:8px 6px">합 계</td>${TX ? `<td style="${td}text-align:right;font-weight:bold;padding:8px 6px">${W(qt.supply)}</td><td style="${td}text-align:right;font-weight:bold;padding:8px 6px">${W(qt.vat)}</td><td style="${td}text-align:right;font-weight:bold;background:#fff6cc;padding:8px 6px">₩${W(qt.total)}</td>` : `<td style="${td}text-align:right;font-weight:bold;background:#fff6cc;padding:8px 6px">${W(qt.total)}</td><td style="${td}"></td>`}</tr>
</table>
<div style="margin-top:6px">
※ 기본 구매대행 수수료: 10,000원 (총 구매가 10만원 이하인 경우), 판매자 3건이상 경우: 4,000원/건 (총 구매가 10만원 이하인 경우)<br>
상품 총 구매가 10만 원 이상인 경우 (※ 상품가 및 대만 내륙배송비 포함 기준) 총 상품구매가의 10%, 50만 원 이상인 경우 8%, 100만 원 이상인 경우 6%입니다 (다건: 12% (판매처 5곳 이상))<br>
- 구매대행 특성상 AS와 상품불량에 대해서는 책임을 드리지 못합니다.<br>
- 중고상품인 경우 개인간의 거래이기 때문에 품질의 보장 및 안정성에 대한 책임을 드리지 못합니다.<br>
* 신중한 구매 결정 부탁드립니다.<br>
※ 배송요금표를 다시 한번 확인 부탁드립니다.<br>
${a(S.feeUrl, esc(S.feeUrl))}<br>
${qt.vat ? '<b>※ 세금계산서 발행 건으로 부가세 10%가 별도 포함된 금액입니다.</b><br>' : ''}<br>
<b>💳 입금 안내</b><br>
<b>※ ${esc(accBank(accNo()))}</b><br>
<b>※ 예금주: ${esc(accHolder(accNo()))}</b><br>
※ 미화 150달러 이상 구매 시 관부가세가 발생할 수 있습니다.
</div></div>`;
}

  const API = { DEFAULTS, mailHtml, subject, accNoOf, parse, parseForm, parseFormView, looksFormView, parseOrder, looksOrder, parseTSV, looksForm, quote, orderText, checks, normalizeUrl, sellerOf, splitOptions, fmtPhone, orderNo, differentBuyer, groupSellers, groupKey, productBlocks, sameProduct, won, ntd, num, digits, normalizeEn };
  return API;
})();
if (typeof module !== 'undefined') module.exports = TW;
