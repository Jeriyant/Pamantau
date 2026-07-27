/**
 * Lightweight Excel/CSV import helpers for Pamantau (no SheetJS).
 * Supports .xlsx (OOXML) and .csv; .xls (BIFF) is not supported.
 */
(() => {
  const TYPE_ALIASES = {
    web: ['web', 'website', 'webserver', 'web server', 'situs', 'http', 'https'],
    internet: ['internet', 'inet', 'wan', 'uplink', 'isp', 'gateway internet'],
    vpn: ['vpn'],
    server: ['server', 'srv', 'host'],
    database: ['database', 'db', 'basis data', 'db server', 'sql', 'mysql', 'postgres', 'postgresql', 'mariadb'],
    loadbalance: [
      'loadbalance', 'load balance', 'loadbalancer', 'load balancer',
      'lb', 'balancer', 'balance',
    ],
    router: ['router', 'rtr', 'gateway', 'gw'],
    olt: ['olt'],
    onu: ['onu', 'ont'],
    printer: ['printer', 'print', 'pencetak', 'prn', 'prt'],
    client: ['client', 'pc', 'user', 'pelanggan', 'workstation', 'desktop', 'cli'],
  };

  const LABEL_HEADERS = [
    'nama perangkat', 'nama', 'name', 'label', 'device', 'perangkat', 'device name', 'hostname',
  ];
  const IP_HEADERS = [
    'alamat ip', 'ip', 'host', 'alamat', 'address', 'ip address', 'ip/host', 'ip host',
  ];
  const TYPE_HEADERS = [
    'type', 'tipe', 'jenis', 'device type', 'jenis perangkat', 'tipe perangkat',
  ];
  const COMMENT_HEADERS = [
    'comment', 'komentar', 'catatan', 'notes', 'note', 'deskripsi', 'description', 'desc',
  ];

  function normKey(s) {
    return String(s || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[_\-./\\]+/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function mapType(raw) {
    const key = normKey(raw);
    if (!key) return 'client';
    if (Object.prototype.hasOwnProperty.call(TYPE_ALIASES, key)) return key;
    for (const [id, aliases] of Object.entries(TYPE_ALIASES)) {
      if (aliases.includes(key)) return id;
    }
    return null;
  }

  function colRole(header) {
    const key = normKey(header);
    if (!key) return null;
    if (LABEL_HEADERS.includes(key)) return 'label';
    if (IP_HEADERS.includes(key)) return 'ip';
    if (TYPE_HEADERS.includes(key)) return 'type';
    if (COMMENT_HEADERS.includes(key)) return 'comment';
    return null;
  }

  function detectHeaderMap(row) {
    const map = {};
    let hits = 0;
    (row || []).forEach((cell, i) => {
      const role = colRole(cell);
      if (role && map[role] == null) {
        map[role] = i;
        hits += 1;
      }
    });
    if (map.label == null && map.ip == null) return null;
    if (hits < 1) return null;
    return map;
  }

  function cellStr(v) {
    if (v == null) return '';
    if (typeof v === 'number' && Number.isFinite(v)) {
      // Avoid scientific notation for IP-like numbers Excel may store.
      if (Math.abs(v) >= 1e10) return String(v);
      return String(v);
    }
    return String(v).replace(/^\uFEFF/, '').trim();
  }

  /**
   * Map a 2D table (first matching header row + data) to device drafts.
   * @returns {{ items: Array<{label:string,ip:string,type:string,comment:string}>, skipped: number, headerRow: number }}
   */
  function mapDeviceRows(rows) {
    const table = Array.isArray(rows) ? rows : [];
    let headerRow = -1;
    let colMap = null;
    for (let i = 0; i < Math.min(table.length, 30); i++) {
      const found = detectHeaderMap(table[i]);
      if (found) {
        headerRow = i;
        colMap = found;
        break;
      }
    }
    if (!colMap) {
      const err = new Error('HEADER');
      err.code = 'HEADER';
      throw err;
    }

    const items = [];
    let skipped = 0;
    for (let r = headerRow + 1; r < table.length; r++) {
      const row = table[r] || [];
      const label = cellStr(colMap.label != null ? row[colMap.label] : '');
      const ip = cellStr(colMap.ip != null ? row[colMap.ip] : '');
      const typeRaw = cellStr(colMap.type != null ? row[colMap.type] : '');
      const comment = cellStr(colMap.comment != null ? row[colMap.comment] : '');

      if (!label && !ip && !typeRaw && !comment) continue;

      if (!label && !ip) {
        skipped += 1;
        continue;
      }

      const type = mapType(typeRaw);
      if (type == null) {
        skipped += 1;
        continue;
      }

      items.push({ label, ip, type, comment });
    }
    return { items, skipped, headerRow };
  }

  function parseCsvText(text) {
    const src = String(text || '').replace(/^\uFEFF/, '');
    const firstLine = src.split(/\r\n|\n|\r/)[0] || '';
    const semi = (firstLine.match(/;/g) || []).length;
    const comma = (firstLine.match(/,/g) || []).length;
    const delim = semi > comma ? ';' : ',';

    const rows = [];
    let row = [];
    let field = '';
    let i = 0;
    let inQuotes = false;
    while (i < src.length) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        field += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === delim) {
        row.push(field);
        field = '';
        i += 1;
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        if (ch === '\r' && src[i + 1] === '\n') i += 1;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function u8(buf, offset) {
    return buf[offset];
  }
  function u16(buf, offset) {
    return buf[offset] | (buf[offset + 1] << 8);
  }
  function u32(buf, offset) {
    return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
  }

  async function inflateRaw(data) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('INFLATE');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }

  async function unzip(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    let eocd = -1;
    const min = Math.max(0, buf.length - 0x10000);
    for (let i = buf.length - 22; i >= min; i--) {
      if (u32(buf, i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) {
      const err = new Error('ZIP');
      err.code = 'ZIP';
      throw err;
    }

    const cdCount = u16(buf, eocd + 10);
    let offset = u32(buf, eocd + 16);
    const files = Object.create(null);
    const dec = new TextDecoder('utf-8');

    for (let n = 0; n < cdCount; n++) {
      if (offset + 46 > buf.length || u32(buf, offset) !== 0x02014b50) break;
      const method = u16(buf, offset + 10);
      const compSize = u32(buf, offset + 20);
      const nameLen = u16(buf, offset + 28);
      const extraLen = u16(buf, offset + 30);
      const commentLen = u16(buf, offset + 32);
      const localOff = u32(buf, offset + 42);
      const name = dec.decode(buf.subarray(offset + 46, offset + 46 + nameLen)).replace(/\\/g, '/');
      offset += 46 + nameLen + extraLen + commentLen;

      if (!name || name.endsWith('/')) continue;
      if (localOff + 30 > buf.length || u32(buf, localOff) !== 0x04034b50) continue;
      const lNameLen = u16(buf, localOff + 26);
      const lExtraLen = u16(buf, localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      if (dataStart + compSize > buf.length) continue;
      const compressed = buf.subarray(dataStart, dataStart + compSize);

      let raw;
      if (method === 0) {
        raw = compressed;
      } else if (method === 8) {
        raw = await inflateRaw(compressed);
      } else {
        continue;
      }
      files[name] = raw;
    }
    return files;
  }

  function elemsByLocal(root, localName) {
    if (!root) return [];
    return Array.from(root.getElementsByTagNameNS('*', localName));
  }

  function firstByLocal(root, localName) {
    return elemsByLocal(root, localName)[0] || null;
  }

  function xmlText(el) {
    if (!el) return '';
    return String(el.textContent || '').trim();
  }

  function colLettersToIndex(letters) {
    let n = 0;
    const s = String(letters || '').toUpperCase();
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return Math.max(0, n - 1);
  }

  function parseCellRef(ref) {
    const m = String(ref || '').match(/^([A-Za-z]+)(\d+)$/);
    if (!m) return { c: 0, r: 0 };
    return { c: colLettersToIndex(m[1]), r: Math.max(0, parseInt(m[2], 10) - 1) };
  }

  function decodeXml(bytes) {
    const text = new TextDecoder('utf-8').decode(bytes);
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  function readSharedStrings(files) {
    const raw = files['xl/sharedStrings.xml'];
    if (!raw) return [];
    const doc = decodeXml(raw);
    const out = [];
    elemsByLocal(doc, 'si').forEach((si) => {
      const parts = [];
      elemsByLocal(si, 't').forEach((t) => parts.push(t.textContent || ''));
      out.push(parts.join(''));
    });
    return out;
  }

  function attr(el, name) {
    if (!el) return null;
    if (el.hasAttribute(name)) return el.getAttribute(name);
    // r:id style attrs
    const attrs = el.attributes;
    for (let i = 0; i < attrs.length; i++) {
      if (attrs[i].localName === name || attrs[i].name === name) return attrs[i].value;
    }
    return null;
  }

  function firstSheetPath(files) {
    const wb = files['xl/workbook.xml'];
    const rels = files['xl/_rels/workbook.xml.rels'];
    if (!wb || !rels) {
      const fallback = Object.keys(files).find((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k));
      return fallback || null;
    }
    const wbDoc = decodeXml(wb);
    const sheet = firstByLocal(wbDoc, 'sheet');
    const rid = attr(sheet, 'id');
    const relDoc = decodeXml(rels);
    let target = null;
    elemsByLocal(relDoc, 'Relationship').forEach((rel) => {
      if (target) return;
      if (rid && attr(rel, 'Id') === rid) {
        target = attr(rel, 'Target');
      }
    });
    if (!target) {
      const first = elemsByLocal(relDoc, 'Relationship').find((rel) => {
        const type = String(attr(rel, 'Type') || '');
        return /worksheet/i.test(type);
      });
      target = first && attr(first, 'Target');
    }
    if (!target) return null;
    target = target.replace(/\\/g, '/');
    if (target.startsWith('/')) target = target.slice(1);
    if (!target.startsWith('xl/')) target = `xl/${target.replace(/^\.\//, '')}`;
    return target;
  }

  function sheetToRows(files) {
    const path = firstSheetPath(files);
    if (!path || !files[path]) {
      const err = new Error('SHEET');
      err.code = 'SHEET';
      throw err;
    }
    const shared = readSharedStrings(files);
    const doc = decodeXml(files[path]);
    const rows = [];
    elemsByLocal(doc, 'row').forEach((rowEl) => {
      // Only rows under sheetData
      if (!rowEl.parentNode || rowEl.parentNode.localName !== 'sheetData') return;
      const rAttr = parseInt(attr(rowEl, 'r') || '0', 10);
      const rIndex = rAttr > 0 ? rAttr - 1 : rows.length;
      while (rows.length <= rIndex) rows.push([]);
      const row = rows[rIndex];
      elemsByLocal(rowEl, 'c').forEach((c) => {
        const ref = parseCellRef(attr(c, 'r') || '');
        while (row.length <= ref.c) row.push('');
        const t = attr(c, 't') || '';
        let val = '';
        if (t === 's') {
          const idx = parseInt(xmlText(firstByLocal(c, 'v')), 10);
          val = Number.isFinite(idx) ? (shared[idx] || '') : '';
        } else if (t === 'inlineStr') {
          const is = firstByLocal(c, 'is');
          val = xmlText(firstByLocal(is || c, 't'));
        } else if (t === 'b') {
          val = xmlText(firstByLocal(c, 'v')) === '1' ? 'TRUE' : 'FALSE';
        } else {
          val = xmlText(firstByLocal(c, 'v'));
        }
        row[ref.c] = val;
      });
    });
    return rows;
  }

  async function parseXlsx(arrayBuffer) {
    const files = await unzip(arrayBuffer);
    return sheetToRows(files);
  }

  async function parseFile(file) {
    const name = String(file && file.name || '').toLowerCase();
    if (name.endsWith('.csv') || (file && file.type === 'text/csv')) {
      const text = await file.text();
      return parseCsvText(text);
    }
    if (name.endsWith('.xls') && !name.endsWith('.xlsx')) {
      const err = new Error('XLS');
      err.code = 'XLS';
      throw err;
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
      const buf = await file.arrayBuffer();
      return parseXlsx(buf);
    }
    // Fallback: try CSV text, then xlsx binary.
    try {
      const text = await file.text();
      if (/nama|label|ip|type|tipe|,|;/i.test(text.slice(0, 500))) {
        return parseCsvText(text);
      }
    } catch (_) { /* ignore */ }
    const buf = await file.arrayBuffer();
    return parseXlsx(buf);
  }

  /** Primary headers Import recognizes (same names Template / Export use). */
  const DEVICE_HEADERS = ['Nama Perangkat', 'Alamat IP', 'Type', 'Comment'];

  const TEMPLATE_SAMPLE_ROWS = [
    ['Core Router', '192.168.1.1', 'router', 'Contoh router'],
    ['Web Portal', '10.0.0.10', 'web', 'Contoh web'],
  ];

  function escapeXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function colIndexToLetters(index) {
    let n = Number(index) + 1;
    let s = '';
    while (n > 0) {
      n -= 1;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s || 'A';
  }

  function rowsToSheetXml(rows) {
    const table = Array.isArray(rows) ? rows : [];
    const rowXml = table.map((row, r) => {
      const cells = (row || []).map((val, c) => {
        const ref = `${colIndexToLetters(c)}${r + 1}`;
        const text = escapeXml(cellStr(val));
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    }).join('');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${rowXml}</sheetData></worksheet>`
    );
  }

  // CRC-32 for ZIP local/central headers (store method).
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function utf8Bytes(str) {
    return new TextEncoder().encode(String(str || ''));
  }

  function u16le(n) {
    const b = new Uint8Array(2);
    b[0] = n & 0xff;
    b[1] = (n >>> 8) & 0xff;
    return b;
  }

  function u32le(n) {
    const b = new Uint8Array(4);
    b[0] = n & 0xff;
    b[1] = (n >>> 8) & 0xff;
    b[2] = (n >>> 16) & 0xff;
    b[3] = (n >>> 24) & 0xff;
    return b;
  }

  function concatBytes(parts) {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }

  /** Build a minimal .xlsx (OOXML zip, store/uncompressed). */
  function buildXlsx(rows) {
    const sheetXml = rowsToSheetXml(rows);
    const files = {
      '[Content_Types].xml':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
      '_rels/.rels':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
      'xl/workbook.xml':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Devices" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>',
      'xl/worksheets/sheet1.xml': sheetXml,
    };

    const names = Object.keys(files);
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const name of names) {
      const data = typeof files[name] === 'string' ? utf8Bytes(files[name]) : files[name];
      const nameBytes = utf8Bytes(name);
      const crc = crc32(data);
      const size = data.length;
      const local = concatBytes([
        u32le(0x04034b50),
        u16le(20),
        u16le(0),
        u16le(0), // store
        u16le(0),
        u16le(0),
        u32le(crc),
        u32le(size),
        u32le(size),
        u16le(nameBytes.length),
        u16le(0),
        nameBytes,
        data,
      ]);
      localParts.push(local);
      centralParts.push(concatBytes([
        u32le(0x02014b50),
        u16le(20),
        u16le(20),
        u16le(0),
        u16le(0),
        u16le(0),
        u16le(0),
        u32le(crc),
        u32le(size),
        u32le(size),
        u16le(nameBytes.length),
        u16le(0),
        u16le(0),
        u16le(0),
        u16le(0),
        u32le(0),
        u32le(offset),
        nameBytes,
      ]));
      offset += local.length;
    }

    const central = concatBytes(centralParts);
    const eocd = concatBytes([
      u32le(0x06054b50),
      u16le(0),
      u16le(0),
      u16le(names.length),
      u16le(names.length),
      u32le(central.length),
      u32le(offset),
      u16le(0),
    ]);

    return new Blob([concatBytes([...localParts, central, eocd])], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  function devicesToRows(devices) {
    const header = DEVICE_HEADERS.slice();
    const rows = [header];
    (devices || []).forEach((d) => {
      const type = mapType(d && d.type) || cellStr(d && d.type) || 'client';
      rows.push([
        cellStr(d && d.label),
        cellStr(d && d.ip),
        type,
        cellStr(d && d.comment),
      ]);
    });
    return rows;
  }

  function buildDevicesXlsx(devices) {
    return buildXlsx(devicesToRows(devices));
  }

  function buildTemplateXlsx() {
    return buildXlsx([DEVICE_HEADERS.slice(), ...TEMPLATE_SAMPLE_ROWS.map((r) => r.slice())]);
  }

  window.PamantauExcel = {
    parseFile,
    parseCsvText,
    parseXlsx,
    mapDeviceRows,
    mapType,
    TYPE_ALIASES,
    DEVICE_HEADERS,
    TEMPLATE_SAMPLE_ROWS,
    buildXlsx,
    buildDevicesXlsx,
    buildTemplateXlsx,
    devicesToRows,
  };
})();
