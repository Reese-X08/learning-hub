'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public', 'code-lab.js'), 'utf8');

function makeEl(id) {
  const listeners = {};
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    files: null,
    checked: false,
    disabled: false,
    style: { cssText: '' },
    className: '',
    dataset: {},
    rel: '',
    href: '',
    download: '',
    appendChild() {},
    removeChild() {},
    remove() {},
    click() {},
    select() {},
    closest() { return null; },
    parentNode: null,
    querySelector() { return null; },
    querySelectorAll() { return { forEach() {} }; },
    insertBefore() {},
    setAttribute(k, v) { this['attr_' + k] = v; },
    getAttribute(k) { return this['attr_' + k]; },
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    _fire(type, event) { (listeners[type] || []).forEach((fn) => fn(event)); },
  };
}

function makeSandbox() {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) elements[id] = makeEl(id);
    return elements[id];
  };
  const root = {
    firstChild: null,
    getElementById: getEl,
    querySelector() { return null; },
    querySelectorAll() { return { forEach() {} }; },
    addEventListener() {},
    appendChild() {},
    removeChild() {},
  };
  const host = {
    dataset: {},
    shadowRoot: null,
    __codeLab: null,
    attachShadow() { this.shadowRoot = root; return root; },
    querySelector() { return null; },
  };
  const doc = {
    getElementById: getEl,
    createElement: (tag) => makeEl('_' + tag + Math.random()),
    querySelector() { return null; },
    querySelectorAll() { return { forEach() {} }; },
    addEventListener() {},
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
  };
  const store = {};
  const ls = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
  };
  const fetchState = { handler: null };
  function fakeFetch(url, options) {
    if (!fetchState.handler) return Promise.reject(new Error('offline'));
    return fetchState.handler(url, options);
  }
  const win = { addEventListener() {}, document: doc, localStorage: ls, WB_CONFIG: null };
  const sb = {
    win, doc, ls, store, root, host,
    loc: { protocol: 'http:', origin: 'http://127.0.0.1:4173', host: '127.0.0.1:4173' },
    fetch: fakeFetch,
    fetchState,
    FileReader: function () { this.readAsText = function () {}; },
    Blob: function () {},
    URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} },
    setTimeout(fn) { fn(); return 0; }, clearTimeout() {}, clearInterval() {}, setInterval() { return 0; },
  };
  const api = new Function(
    'window', 'document', 'localStorage', 'location', 'fetch', 'FileReader', 'Blob', 'URL',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'alert', 'confirm',
    source
  );
  api.call(sb.win, sb.win, sb.doc, sb.ls, sb.loc, sb.fetch, sb.FileReader, sb.Blob, sb.URL,
    sb.setTimeout, sb.clearTimeout, sb.setInterval, sb.clearInterval, () => {}, () => true);
  return sb;
}

test('代码学习台：挂载、语言识别、本地规则、高亮与提示词', () => {
  const sb = makeSandbox();
  const app = sb.win.mountCodeLab(sb.host);
  assert.ok(app, 'mountCodeLab 返回 API');
  assert.equal(sb.host.dataset.codeLabMounted, '1');
  assert.ok(sb.host.shadowRoot, '创建了 Shadow DOM');
  assert.equal(app.getLANG(), 'python');

  assert.equal(app.detectLang('#include <iostream>\nint main() { std::cout << "hi"; return 0; }'), 'cpp');
  assert.equal(app.detectLang('def f(x):\n    if x:\n        print(True)'), 'python');
  assert.equal(app.detectLang('hello world'), null);

  app.switchLang('cpp', true);
  assert.equal(app.getLANG(), 'cpp');
  assert.equal(sb.root.getElementById('langTitle').textContent, 'C++');
  assert.ok(sb.root.getElementById('cheatBody').innerHTML.includes('empty()'));
  assert.ok(sb.root.getElementById('code').value.includes('#include'));
  assert.ok(sb.root.getElementById('learnCode').value.includes('std::vector'));
  assert.equal(sb.store.wb_py_allinone_lang, 'cpp');

  const cppInput = [
    '#include <iostream>',
    'int main() {',
    '    int count = 0;',
    '    count = count + 1;',
    '    bool ok = true;',
    '    if (ok == false) {',
    '        std::cout << "x == true 在字符串里不该被改";',
    '    }',
    '    std::string s = "hi";',
    '    if (s.size() == 0) {',
    '        std::cout << "empty";',
    '    }',
    '    int* p = NULL;',
    '    if (p == NULL) {',
    '        std::cout << "null";',
    '    }',
    '    std::cout << s;  // 注释里的 x == true 也不该改',
    '    return 0;',
    '}'
  ].join('\n');
  const r = app.analyzeLocal(cppInput);
  assert.ok(r.simplified.includes('count += 1'));
  assert.ok(r.simplified.includes('if (!ok)'));
  assert.ok(r.simplified.includes('s.empty()'));
  assert.ok(r.simplified.includes('if (!p)'));
  assert.ok(r.simplified.includes('"x == true 在字符串里不该被改"'));
  assert.ok(r.simplified.includes('// 注释里的 x == true 也不该改'));
  assert.ok(r.auto.length >= 4);

  const cppAdvInput = [
    '#include <iostream>',
    '#include <vector>',
    'using namespace std;',
    '',
    'bool isEven(int n) {',
    '    if (n % 2 == 0) {',
    '        return true;',
    '    } else {',
    '        return false;',
    '    }',
    '}',
    '',
    'int main() {',
    '    vector<int> nums = {1, 2, 3};',
    '    for (int i = 0; i < nums.size(); i++) {',
    '        cout << nums[i] << endl;',
    '    }',
    '    printf("总数:%d\\n", (int)nums.size());',
    '    int* p = new int(5);',
    '    delete p;',
    '    int raw[4] = {1, 2, 3, 4};',
    '    char name[20] = "Tom";',
    '    return 0;',
    '}'
  ].join('\n');
  const advIds = app.analyzeLocal(cppAdvInput).adv.map((x) => x.id);
  for (const id of ['rangeFor', 'printfToCout', 'endlToNewline', 'returnBool', 'rawPointer', 'usingNamespace', 'cArray', 'cString']) {
    assert.ok(advIds.includes(id), '缺少进阶规则：' + id);
  }

  app.switchLang('python', true);
  const py = app.analyzeLocal('if x == True:\n    print(len(items) == 0)\ncount = count + 1\nprint("x == True 在字符串里")');
  assert.ok(py.simplified.includes('if x:'));
  assert.ok(py.simplified.includes('not items'));
  assert.ok(py.simplified.includes('count += 1'));
  assert.ok(py.simplified.includes('"x == True 在字符串里"'));

  app.switchLang('cpp', true);
  const hl = app.highlight('#include <iostream>\nint x = 5; // 注释\nstd::cout << "hi";');
  assert.ok(hl.includes('tok-pre'));
  assert.ok(hl.includes('tok-str'));
  assert.ok(hl.includes('tok-com'));
  assert.ok(hl.includes('&lt;iostream&gt;'));
  const strip = (s) => s.replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  assert.equal(strip(hl), '#include <iostream>\nint x = 5; // 注释\nstd::cout << "hi";');

  assert.ok(app.langConf().simplifySystem.includes('现代 C++'));
  assert.ok(app.langConf().explainSystem.includes('C++ 编程老师'));
  app.switchLang('python', true);
  assert.ok(app.langConf().simplifySystem.includes('Pythonic'));
  assert.ok(app.langConf().explainSystem.includes('\u0060\u0060\u0060python'));

  const parsed = app.parseModelResponse('\u0060\u0060\u0060json\n{"summary":"ok","changes":[]}\n\u0060\u0060\u0060');
  assert.deepEqual(parsed, { summary: 'ok', changes: [] });

  assert.ok(app.LANGS.cpp.auto.length >= 8);
  assert.ok(app.LANGS.cpp.adv.length >= 6);
  assert.ok(app.LANGS.cpp.cheat.length >= 10);
  assert.equal(Object.keys(app.LANGS.cpp.samples).length, 3);

  assert.ok(source.includes("model:'deepseek-flash'"));
  assert.ok(!source.includes("model:'deepseek-chat'"));
});

test('代码学习台：LLM 请求走 OpenAI 兼容格式，支持直连 / 代理 / 流式', async () => {
  const sb = makeSandbox();
  const app = sb.win.mountCodeLab(sb.host);
  app.settings.provider = 'deepseek';
  app.settings.apiBase = 'https://api.example.com/v1';
  app.settings.apiKey = 'sk-test';
  app.settings.model = 'deepseek-flash';
  app.settings.proxy = '';

  let seen = null;
  sb.fetchState.handler = async (url, options) => {
    seen = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const text = await new Promise((resolve, reject) => {
    app.callLLM([{ role: 'user', content: 'hi' }], { onDone: resolve, onError: reject });
  });
  assert.equal(text, 'OK');
  assert.equal(seen.url, 'https://api.example.com/v1/chat/completions');
  assert.equal(seen.options.headers.Authorization, 'Bearer sk-test');
  const body = JSON.parse(seen.options.body);
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.stream, false);
  assert.equal('temperature' in body, false);

  // 代理地址：base 会被 encodeURIComponent 后拼在代理后面
  app.settings.proxy = 'https://proxy.example/?url=';
  await new Promise((resolve, reject) => {
    app.callLLM([{ role: 'user', content: 'hi' }], { onDone: resolve, onError: reject });
  });
  assert.ok(seen.url.startsWith('https://proxy.example/?url='));
  assert.ok(seen.url.includes(encodeURIComponent('https://api.example.com/v1/chat/completions')));
  app.settings.proxy = '';

  // 流式：SSE 分块内容拼接后回调
  sb.fetchState.handler = async () => new Response(
    'data: {"choices":[{"delta":{"content":"你"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"好"}}]}\n\n' +
    'data: [DONE]\n\n',
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );
  const chunks = [];
  let doneCount = 0;
  const full = await new Promise((resolve, reject) => {
    app.callLLM([{ role: 'user', content: 'hi' }], {
      stream: true,
      onChunk: (chunk, all) => chunks.push([chunk, all]),
      onDone: (value) => { doneCount += 1; resolve(value); },
      onError: reject,
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(full, '你好');
  assert.equal(doneCount, 1, '流结束时 onDone 只能触发一次');
  assert.deepEqual(chunks, [['你', '你'], ['好', '你好']]);

  // 当前 DeepSeek 预设使用未退役的模型名
  const deepseek = app.PROVIDER_PRESETS.find((p) => p.id === 'deepseek');
  assert.equal(deepseek.model, 'deepseek-flash');
  assert.ok(deepseek.models.includes('deepseek-v4-pro'));
});

test('模型列表：解析平台返回、请求 /models 并缓存', async () => {
  const sb = makeSandbox();
  const app = sb.win.mountCodeLab(sb.host);
  assert.deepEqual(
    app.parseModelList({ data: [{ id: 'models/zeta' }, { id: 'alpha' }, { name: 'beta' }, { id: 'alpha' }] }),
    ['alpha', 'beta', 'zeta'],
  );

  app.settings.provider = 'deepseek';
  app.settings.apiBase = 'https://api.example.com/v1';
  app.settings.apiKey = 'sk-models';
  app.settings.model = 'alpha';
  sb.root.getElementById('apiBaseInput').value = app.settings.apiBase;
  sb.root.getElementById('apiKeyInput').value = app.settings.apiKey;
  sb.root.getElementById('modelInput').value = app.settings.model;
  sb.root.getElementById('proxyInput').value = '';

  let seen = null;
  sb.fetchState.handler = async (url, options) => {
    seen = { url, options };
    return new Response(JSON.stringify({ data: [{ id: 'models/alpha' }, { id: 'beta' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  app.loadModels();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.ok(seen);
  assert.equal(seen.url, 'https://api.example.com/v1/models');
  assert.equal(seen.options.headers.Authorization, 'Bearer sk-models');
  assert.equal(sb.root.getElementById('modelSelect').hidden, false);
  assert.ok(sb.root.getElementById('modelHint').textContent.includes('2 个模型'));
  const cache = JSON.parse(sb.store.wb_py_allinone_models || '{}');
  const entry = cache['deepseek|https://api.example.com/v1'];
  assert.ok(entry);
  assert.deepEqual(entry.models, ['alpha', 'beta']);
});

test('配置记忆：保存多套、切换、删除并持久化', () => {
  const sb = makeSandbox();
  const app = sb.win.mountCodeLab(sb.host);
  app.settings.provider = 'deepseek';
  app.settings.apiBase = 'https://api.deepseek.com/v1';
  app.settings.apiKey = 'sk-deepseek';
  app.settings.model = 'deepseek-flash';
  app.settings.proxy = '';

  sb.root.getElementById('apiBaseInput').value = app.settings.apiBase;
  sb.root.getElementById('apiKeyInput').value = app.settings.apiKey;
  sb.root.getElementById('modelInput').value = app.settings.model;
  sb.root.getElementById('proxyInput').value = '';
  sb.root.getElementById('profileNameInput').value = 'DeepSeek 日常';
  app.saveCurrentProfile();
  assert.equal(app.getProfiles().length, 1);
  assert.equal(app.getProfiles()[0].name, 'DeepSeek 日常');
  assert.equal(app.getActiveProfileId(), app.getProfiles()[0].id);
  assert.ok(sb.store.wb_py_allinone_profiles.includes('sk-deepseek'));
  assert.equal(sb.store.wb_py_allinone_active_profile, app.getProfiles()[0].id);

  app.settings.provider = 'zhipu';
  app.settings.apiBase = 'https://open.bigmodel.cn/api/paas/v4';
  app.settings.apiKey = 'sk-zhipu';
  app.settings.model = 'glm-4-flash';
  sb.root.getElementById('apiBaseInput').value = app.settings.apiBase;
  sb.root.getElementById('apiKeyInput').value = app.settings.apiKey;
  sb.root.getElementById('modelInput').value = app.settings.model;
  sb.root.getElementById('profileNameInput').value = '智谱免费额度';
  app.saveCurrentProfile();
  assert.equal(app.getProfiles().length, 2);
  assert.equal(app.getProfiles().filter((p) => p.name === '智谱免费额度').length, 1);

  const deepseek = app.getProfiles().find((p) => p.name === 'DeepSeek 日常');
  app.applyProfile(deepseek.id);
  assert.equal(app.settings.provider, 'deepseek');
  assert.equal(app.settings.model, 'deepseek-flash');
  assert.equal(app.settings.apiKey, 'sk-deepseek');
  assert.equal(app.getActiveProfileId(), deepseek.id);

  // 手动改参数后，当前选择应回到“当前手动配置”
  app.settings.model = 'deepseek-v4-pro';
  sb.root.getElementById('apiBaseInput').value = app.settings.apiBase;
  sb.root.getElementById('apiKeyInput').value = app.settings.apiKey;
  sb.root.getElementById('modelInput').value = 'deepseek-v4-pro';
  sb.root.getElementById('proxyInput').value = '';
  const input = sb.root.getElementById('modelInput');
  input._fire('input', { target: input });
  assert.equal(app.getActiveProfileId(), '');

  // 删除选中的配置
  sb.root.getElementById('profileSelect').value = deepseek.id;
  app.deleteSelectedProfile();
  assert.equal(app.getProfiles().length, 1);
  assert.equal(app.getProfiles()[0].name, '智谱免费额度');
  assert.equal(app.getActiveProfileId(), '');
});

test('代码学习已接入学习中心的固定视图', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.ok(html.includes('data-view="code"'));
  assert.ok(html.includes('id="code-lab-host"'));
  assert.ok(app.includes("'courses', 'tasks', 'affairs', 'code'"));
  assert.ok(app.includes('function ensureCodeLab'));
  assert.ok(app.includes("$('#code-btn')"));
  assert.ok(server.includes("url.pathname === '/code-lab-config.js'"));
  assert.ok(server.includes("style-src-attr 'unsafe-inline'"));
  assert.ok(source.includes('PLATFORM_LINKS'));
  assert.ok(source.includes('function openApiTutorial'));
  assert.ok(source.includes('data-action="api-tutorial"'));
  assert.ok(source.includes('function loadModels'));
});
