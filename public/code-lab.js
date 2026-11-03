(function(){
'use strict';

/* 学习中心 · 代码学习台
 * 从 DSHcodelearning/outputs/ai-workbench/index.html 移植：
 * 保留 Python / C++ 化简、逐行讲解、行内追问、学习历史与模型配置。
 * 挂载在 Shadow DOM 中，避免和学习中心的样式 / id 冲突。
 * 修改时请同步上游工作台，并运行 tests/code-lab.test.js。
 */

var root = null;
var TEMPLATE = "<div class=\"wrap\">\r\n  <header>\r\n    <span class=\"pill ai\">学习 + 化简 二合一 · 大模型驱动</span>\r\n    <h1><span id=\"langTitle\">Python</span> 学习·化简<span class=\"dot\">工作台</span></h1>\r\n    <p>看懂每一行代码,并把代码写得简洁地道 —— 一个工作台搞定</p>\r\n    <div class=\"lang-switch\" role=\"group\" aria-label=\"选择语言\">\r\n      <button class=\"lang-btn active\" data-lang=\"python\">Python</button>\r\n      <button class=\"lang-btn\" data-lang=\"cpp\">C++</button>\r\n    </div>\r\n  </header>\r\n\r\n  <div class=\"tabs\">\r\n    <button class=\"tab-btn active\" id=\"tab-simplify\">&#9986;&#65039; 代码化简</button>\r\n    <button class=\"tab-btn\" id=\"tab-learn\">&#128214; 代码学习</button>\r\n    <button class=\"tab-btn\" id=\"tab-settings\">&#9881;&#65039; 设置</button>\r\n  </div>\r\n\r\n  <!-- ============ 化简页 ============ -->\r\n  <section class=\"tab-panel active\" id=\"panel-simplify\">\r\n    <div class=\"cfg-bar\" id=\"cfgBar\"></div>\r\n    <div class=\"grid\">\r\n      <!-- 左列 -->\r\n      <div class=\"left\">\r\n        <!-- 代码输入 -->\r\n        <div class=\"card\">\r\n          <h2><span class=\"badge-dot\"></span>粘贴你的代码</h2>\r\n          <p class=\"sub\" id=\"simplifySub\">本地规则化简和 AI 化简共用这个输入框</p>\r\n          <textarea id=\"code\" spellcheck=\"false\" placeholder=\"例如:&#10;if x == True:&#10;    print(len(items) == 0)\"></textarea>\r\n          <div class=\"samples\">\r\n            <button data-sample=\"a\">示例:典型小白写法</button>\r\n            <button data-sample=\"b\">示例:判断+循环</button>\r\n            <button data-sample=\"c\">示例:空值+计数</button>\r\n          </div>\r\n          <div class=\"btn-row\">\r\n            <button class=\"btn btn-primary\" id=\"runBtn\">本地规则化简</button>\r\n            <button class=\"btn btn-ghost\" id=\"clearBtn\" style=\"flex:0 0 auto\">清空</button>\r\n          </div>\r\n        </div>\r\n\r\n        <!-- 速查表 -->\r\n        <div class=\"card\" style=\"margin-top:18px\">\r\n          <h2><span class=\"badge-dot\" style=\"background:var(--cl-amber)\"></span><span id=\"cheatTitle\">化简速查表</span></h2>\r\n          <p class=\"sub\" id=\"cheatSub\">新手最常见的\"可以更简洁\"的写法,记下来少走弯路</p>\r\n          <table>\r\n            <thead><tr><th>啰嗦写法</th><th>简洁写法</th></tr></thead>\r\n            <tbody id=\"cheatBody\"></tbody>\r\n          </table>\r\n        </div>\r\n      </div>\r\n\r\n      <!-- 右列:结果 -->\r\n      <div>\r\n        <!-- AI 化简结果 -->\r\n        <div class=\"card\" id=\"aiResultCard\" style=\"margin-bottom:18px\">\r\n          <div class=\"empty\" id=\"aiEmpty\">\r\n            <span class=\"big\">&#129488;</span>\r\n            AI 化简结果会显示在这里<br>先到「设置」配好平台和 Key,再点下方按钮\r\n          </div>\r\n          <div class=\"btn-row\" style=\"margin-top:0;margin-bottom:12px\">\r\n            <button class=\"btn btn-ai\" id=\"aiBtn\">用大模型化简左侧代码</button>\r\n          </div>\r\n          <div id=\"aiConfigMsg\"></div>\r\n          <div id=\"aiResult\" style=\"display:none\"></div>\r\n        </div>\r\n\r\n        <!-- 本地规则结果 -->\r\n        <div class=\"card\" id=\"resultCard\">\r\n          <div class=\"empty\" id=\"emptyState\">\r\n            <span class=\"big\">&#128218;</span>\r\n            本地规则化简结果会显示在这里<br>点左边「本地规则化简」试试\r\n          </div>\r\n          <div id=\"result\" style=\"display:none\"></div>\r\n        </div>\r\n      </div>\r\n    </div>\r\n  </section>\r\n\r\n  <!-- ============ 学习页 ============ -->\r\n  <section class=\"tab-panel\" id=\"panel-learn\">\r\n    <div class=\"cfg-bar\" id=\"learnCfgBar\"></div>\r\n\r\n    <div class=\"card\">\r\n      <h2><span class=\"badge-dot\" style=\"background:var(--cl-amber)\"></span>粘贴要学习的代码</h2>\r\n      <p class=\"sub\" id=\"learnSub\">AI 会逐行解释这段代码,讲人话、打比方,零基础也能懂</p>\r\n      <div class=\"code-editor\">\r\n        <div class=\"line-numbers\" id=\"lineNumbers\">1</div>\r\n        <textarea id=\"learnCode\" spellcheck=\"false\" placeholder=\"# 在这里粘贴或输入 Python 代码&#10;# 点击「开始解释」逐行学习\"></textarea>\r\n      </div>\r\n      <div class=\"btn-row\">\r\n        <button class=\"btn btn-primary\" id=\"explainBtn\">开始解释</button>\r\n        <button class=\"btn btn-ghost\" id=\"clearLearnBtn\" style=\"flex:0 0 auto\">清空代码</button>\r\n        <button class=\"btn btn-ghost\" id=\"loadLearnSample\" style=\"flex:0 0 auto\">载入示例</button>\r\n      </div>\r\n    </div>\r\n\r\n    <div class=\"card\" style=\"margin-top:18px\">\r\n      <h2><span class=\"badge-dot\" style=\"background:var(--cl-good)\"></span>逐行讲解</h2>\r\n      <p class=\"sub\">解释结果会实时流式显示在这里</p>\r\n      <div class=\"explain-content\" id=\"explainContent\">\r\n        <div class=\"empty\" style=\"padding:24px\"><span class=\"big\">&#128161;</span>点击上方「开始解释」,AI 老师逐行给你讲代码</div>\r\n      </div>\r\n    </div>\r\n\r\n    <div class=\"card\" style=\"margin-top:18px\">\r\n      <h2><span class=\"badge-dot\" style=\"background:var(--cl-primary)\"></span>针对某一行追问</h2>\r\n      <p class=\"sub\">哪一行看不懂?填行号 + 你的疑问,AI 结合上下文详细解答</p>\r\n      <div class=\"qa-row\">\r\n        <input type=\"number\" id=\"qaLineNum\" placeholder=\"行号\" min=\"1\">\r\n        <input type=\"text\" id=\"qaQuestion\" placeholder=\"例如:这行的 f 是什么意思?为什么要加引号?\">\r\n        <button class=\"btn btn-primary\" id=\"askBtn\" style=\"flex:0 0 auto\">提问</button>\r\n      </div>\r\n      <div class=\"qa-content\" id=\"qaContent\">\r\n        <div class=\"empty\" style=\"padding:24px\"><span class=\"big\">&#10067;</span>你的提问和 AI 的解答会显示在这里</div>\r\n      </div>\r\n    </div>\r\n\r\n    <div class=\"card\" style=\"margin-top:18px\">\r\n      <h2><span class=\"badge-dot\" style=\"background:var(--cl-amber)\"></span>学习历史</h2>\r\n      <p class=\"sub\">解释过的代码自动保存在浏览器本地,随时回顾(点击可重新查看)</p>\r\n      <div class=\"btn-row\" style=\"margin-top:0;margin-bottom:12px\">\r\n        <button class=\"btn btn-ghost\" id=\"exportHistoryBtn\" style=\"flex:0 0 auto\">导出记录</button>\r\n        <button class=\"btn btn-ghost\" id=\"importHistoryBtn\" style=\"flex:0 0 auto\">导入记录</button>\r\n        <button class=\"btn btn-ghost\" id=\"clearHistoryBtn\" style=\"flex:0 0 auto\">清空历史</button>\r\n        <input type=\"file\" id=\"importHistoryFile\" accept=\".json,application/json\" style=\"display:none\">\r\n      </div>\r\n      <div class=\"history-list\" id=\"historyList\"></div>\r\n    </div>\r\n  </section>\r\n\r\n  <!-- ============ 设置页 ============ -->\r\n  <section class=\"tab-panel\" id=\"panel-settings\">\r\n    <div class=\"card\">\r\n      <h2><span class=\"badge-dot\" style=\"background:var(--cl-amber)\"></span>模型平台</h2>\r\n      <p class=\"sub\">「代码化简」和「代码学习」共用这一套配置,配一次两个功能都能用</p>\r\n      <div id=\"providerGrid\" class=\"provider-grid\"></div>\r\n      <p class=\"hint\" style=\"margin-top:12px\">&#128161; 所有平台都走 OpenAI 兼容格式。国内平台(DeepSeek/通义/智谱/Kimi/硅基流动)和 OpenRouter 已实测支持浏览器直连;OpenAI 官方、Groq、Gemini、Mistral 会拦浏览器直连,请改用 OpenRouter 或在下方填代理。</p>\r\n    </div>\r\n\r\n    <div class=\"card\" style=\"margin-top:18px\">\r\n      <h2><span class=\"badge-dot\"></span>接口配置</h2>\r\n      <p class=\"sub\">填好即<b>自动保存</b>(API 地址 + API Key + 模型名称),下次打开自动载入;常用组合可在下方「配置记忆」保存多套,也可「导出」成 code-lab-config.js 放到 data 文件夹作永久备份</p>\r\n      <div class=\"field\">\r\n        <label>API 地址(OpenAI 兼容,填到 /v1 这一级即可)</label>\r\n        <input type=\"text\" id=\"apiBaseInput\" placeholder=\"https://api.deepseek.com/v1\">\r\n        <div class=\"hint\" id=\"apiBaseHint\"></div>\r\n      </div>\r\n      <div class=\"field\">\r\n        <label>API Key(仅存本地浏览器,不会上传)</label>\r\n        <input type=\"password\" id=\"apiKeyInput\" placeholder=\"sk-xxxxxxxxxxxxxxxxxxxx\">\r\n        <div class=\"hint\" id=\"apiKeyHint\"></div>\r\n      </div>\r\n      <div class=\"field\">\r\n        <label>模型名称</label>\r\n        <input type=\"text\" id=\"modelInput\" list=\"modelList\" placeholder=\"deepseek-chat\">\r\n        <datalist id=\"modelList\"></datalist>\r\n      </div>\r\n      <div class=\"field\">\r\n        <label>CORS 代理地址(可选,直连失败时使用)</label>\r\n        <input type=\"text\" id=\"proxyInput\" placeholder=\"留空则直连\">\r\n        <div class=\"hint\">如果浏览器直连报跨域(CORS)错误,可填代理地址,如 https://your-proxy.workers.dev/?url=</div>\r\n      </div>\r\n      <div class=\"btn-row\">\r\n        <button class=\"btn btn-primary\" id=\"saveSettingsBtn\">保存配置</button>\r\n        <button class=\"btn btn-ghost\" style=\"flex:0 0 auto\" id=\"testBtn\">测试连接</button>\r\n        <button class=\"btn btn-ghost\" style=\"flex:0 0 auto\" id=\"exportBtn\">导出配置</button>\r\n        <button class=\"btn btn-ghost\" style=\"flex:0 0 auto\" id=\"importBtn\">导入</button>\r\n        <input type=\"file\" id=\"importFile\" accept=\".js,.json,application/json,application/javascript\" style=\"display:none\">\r\n      </div>\r\n      <div class=\"hint\" id=\"saveStatus\" style=\"margin-top:8px\"></div>\r\n      <div id=\"configMsg\"></div>\r\n    </div>\r\n\r\n    <div class=\"note\" style=\"margin-top:18px\">\r\n      无需任何本地服务,浏览器直连大模型。配置自动保存在浏览器本地;常用组合可在「配置记忆」中保存多套,并自动备份到 data 文件夹。若担心清缓存丢配置,也可以点「导出配置」生成 code-lab-config.js。\r\n    </div>\r\n  </section>\r\n\r\n  <footer>本地规则只改动「语义完全等价」的部分;大模型讲解与化简由你选择的平台完成,请自行核对结果后再用。</footer>\r\n</div>\r\n\r\n<div class=\"toast-container\" id=\"toastContainer\"></div>\r\n\r\n<!-- code-lab-config.js:可选配置,放到 data 文件夹后自动生效 -->";

function mountCodeLab(host){
  if(!host) return null;
  try{ if(host.dataset && host.dataset.codeLabMounted === '1') return host.__codeLab || null; }catch(e){}
  var shadow;
  try{ shadow = host.shadowRoot || host.attachShadow({ mode:'open' }); }
  catch(e){ shadow = host; }
  while(shadow.firstChild) shadow.removeChild(shadow.firstChild);
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/code-lab.css';
  shadow.appendChild(link);
  var shell = document.createElement('div');
  shell.className = 'code-lab';
  shell.innerHTML = TEMPLATE;
  shadow.appendChild(shell);
  root = shadow;

'use strict';

  /* ============================================================
   * 工具函数
   * ============================================================ */
  function $(id){ return root.getElementById(id); }
  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function showToast(msg, type){
    var c = $('toastContainer');
    var t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' error' : '');
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 2600);
  }

  function errMsg(err){
    var m = (err && err.message) || String(err || '');
    if(/Failed to fetch|NetworkError|Load failed|CORS|跨域|Origin|network/i.test(m)){
      m += '\n\n(很可能是该平台不允许浏览器直连(CORS),或有网络/代理问题。建议:换支持直连的平台(DeepSeek/智谱/OpenRouter 等),或在「设置」里填写 CORS 代理地址。)';
    }
    return m;
  }

  /* ============================================================
   * 共享设置(化简 + 学习 两页共用)
   * ============================================================ */
  var SETTINGS_KEY = 'wb_py_allinone_settings';
  var HISTORY_KEY = 'wb_py_allinone_history';

  var PROVIDER_PRESETS = [
    { id:'deepseek', name:'DeepSeek', base:'https://api.deepseek.com/v1', model:'deepseek-flash',
      models:['deepseek-flash','deepseek-v4-pro'], cors:'ok', group:'国内(推荐)',
      hint:'到 platform.deepseek.com 创建 sk- 开头的 Key。deepseek-flash 快且便宜,v4-pro 更强。' },
    { id:'zhipu', name:'智谱 GLM', base:'https://open.bigmodel.cn/api/paas/v4', model:'glm-4-flash',
      models:['glm-4-flash','glm-4-air','glm-4-plus'], cors:'ok', group:'国内(推荐)',
      hint:'到 open.bigmodel.cn 注册实名后创建 Key,形如 xxxxx.yyyyy(带点)。glm-4-flash 永久免费。' },
    { id:'qwen', name:'通义千问', base:'https://dashscope.aliyuncs.com/compatible-mode/v1', model:'qwen-turbo',
      models:['qwen-turbo','qwen-plus','qwen-max'], cors:'ok', group:'国内(推荐)',
      hint:'到阿里云百炼(dashscope.console.aliyun.com)创建 sk- 开头的 Key。' },
    { id:'moonshot', name:'Kimi 月之暗面', base:'https://api.moonshot.cn/v1', model:'moonshot-v1-8k',
      models:['moonshot-v1-8k','moonshot-v1-32k','kimi-latest'], cors:'ok', group:'国内(推荐)',
      hint:'到 platform.moonshot.cn 创建 sk- 开头的 Key。' },
    { id:'siliconflow', name:'硅基流动', base:'https://api.siliconflow.cn/v1', model:'deepseek-ai/DeepSeek-V3',
      models:['deepseek-ai/DeepSeek-V3','Qwen/Qwen2.5-72B-Instruct'], cors:'ok', group:'国内(推荐)',
      hint:'到 cloud.siliconflow.cn 创建 Key,聚合多家开源模型,有免费额度。' },
    { id:'openrouter', name:'OpenRouter', base:'https://openrouter.ai/api/v1', model:'openrouter/auto',
      models:['openrouter/auto','openai/gpt-4o-mini','anthropic/claude-3.5-sonnet','google/gemini-flash-1.5','deepseek/deepseek-chat'], cors:'ok', group:'国际',
      hint:'到 openrouter.ai 注册拿 sk-or- 开头的 Key。一个 Key 即可调用 OpenAI/Claude/Gemini/Llama 等数百模型,已实测支持浏览器直连。' },
    { id:'anthropic', name:'Claude', base:'https://api.anthropic.com/v1', model:'claude-sonnet-4-5',
      models:['claude-sonnet-4-5','claude-3-5-haiku'], cors:'header', group:'国际',
      headers:{ 'anthropic-dangerous-direct-browser-access': 'true' },
      hint:'到 console.anthropic.com 拿 sk-ant- 开头的 Key。会自动附带浏览器直连所需请求头,但国内网络可能无法直达。' },
    { id:'openai', name:'OpenAI', base:'https://api.openai.com/v1', model:'gpt-4o-mini',
      models:['gpt-4o-mini','gpt-4o'], cors:'no', group:'国际',
      hint:'到 platform.openai.com 拿 Key。注意:官方 API 会拦浏览器直连(CORS),请改用 OpenRouter 或填代理。' },
    { id:'gemini', name:'Gemini', base:'https://generativelanguage.googleapis.com/v1beta/openai', model:'gemini-2.5-flash',
      models:['gemini-2.5-flash','gemini-2.0-flash'], cors:'no', group:'国际',
      hint:'到 aistudio.google.com 拿 Key。会拦浏览器直连,建议经 OpenRouter 或代理使用。' },
    { id:'xai', name:'xAI Grok', base:'https://api.x.ai/v1', model:'grok-4-fast',
      models:['grok-4-fast'], cors:'no', group:'国际',
      hint:'到 console.x.ai 拿 Key。可能拦浏览器直连。' },
    { id:'groq', name:'Groq', base:'https://api.groq.com/openai/v1', model:'llama-3.3-70b-versatile',
      models:['llama-3.3-70b-versatile'], cors:'no', group:'国际',
      hint:'到 console.groq.com 拿 Key,速度极快。会拦浏览器直连,建议填代理。' },
    { id:'mistral', name:'Mistral', base:'https://api.mistral.ai/v1', model:'mistral-large-latest',
      models:['mistral-large-latest'], cors:'no', group:'国际',
      hint:'到 console.mistral.ai 拿 Key。会拦浏览器直连。' },
    { id:'custom', name:'自定义', base:'', model:'',
      models:[], cors:'depends', group:'其他',
      hint:'填任意 OpenAI 兼容的 API 地址。例:Ollama 本地 http://localhost:11434/v1、LM Studio http://localhost:1234/v1、vLLM、自建网关等。' }
  ];

  /* 常用平台 API 开放平台入口；只放常用平台，保持设置页简洁 */
  var PLATFORM_LINKS = {
    deepseek: {
      console: 'https://platform.deepseek.com/',
      key: 'https://platform.deepseek.com/api_keys',
      note: 'Key 以 sk- 开头。deepseek-flash 便宜快速，deepseek-v4-pro 更强。'
    },
    zhipu: {
      console: 'https://open.bigmodel.cn/',
      key: 'https://open.bigmodel.cn/usercenter/apikeys',
      note: 'Key 形如 xxxxx.yyyyy（带小数点）。glm-4-flash 有免费额度。'
    },
    qwen: {
      console: 'https://bailian.console.aliyun.com/',
      key: 'https://bailian.console.aliyun.com/?apiKey=1#/api-key',
      note: '在阿里云百炼控制台创建 API-KEY；qwen-turbo 适合入门。'
    },
    moonshot: {
      console: 'https://platform.moonshot.cn/',
      key: 'https://platform.moonshot.cn/console/api-keys',
      note: '注册后创建 API Key，Key 以 sk- 开头。'
    },
    siliconflow: {
      console: 'https://cloud.siliconflow.cn/',
      key: 'https://cloud.siliconflow.cn/account/ak',
      note: '聚合多家开源模型，注册后有免费额度。'
    },
    openrouter: {
      console: 'https://openrouter.ai/',
      key: 'https://openrouter.ai/keys',
      note: '一个 Key 可调用 OpenAI / Claude / Gemini 等数百个模型，已实测支持浏览器直连。'
    },
    openai: {
      console: 'https://platform.openai.com/',
      key: 'https://platform.openai.com/api-keys',
      note: '官方接口会拦浏览器直连；如果连不上，建议改用 OpenRouter 或填写 CORS 代理。'
    },
    anthropic: {
      console: 'https://console.anthropic.com/',
      key: 'https://console.anthropic.com/settings/keys',
      note: 'Claude 原生接口可能需要代理；国内网络不稳定时建议用 OpenRouter。'
    },
    gemini: {
      console: 'https://aistudio.google.com/',
      key: 'https://aistudio.google.com/app/apikey',
      note: '在 Google AI Studio 创建 Key；官方接口可能拦浏览器直连。'
    },
    xai: {
      console: 'https://console.x.ai/',
      key: 'https://console.x.ai/',
      note: '在 xAI 控制台创建 Key；可能拦浏览器直连。'
    },
    groq: {
      console: 'https://console.groq.com/',
      key: 'https://console.groq.com/keys',
      note: 'Groq 生成速度快；官方接口可能拦浏览器直连。'
    },
    mistral: {
      console: 'https://console.mistral.ai/',
      key: 'https://console.mistral.ai/api-keys/',
      note: '在 Mistral 控制台创建 Key；可能拦浏览器直连。'
    }
  };

  var MODELS_KEY = 'wb_py_allinone_models';
  var modelsLoading = false;

  var settings = { provider:'deepseek', apiBase:'', apiKey:'', model:'', proxy:'' };

  function getPreset(id){
    for(var i=0;i<PROVIDER_PRESETS.length;i++){ if(PROVIDER_PRESETS[i].id === id) return PROVIDER_PRESETS[i]; }
    return PROVIDER_PRESETS[0];
  }

  var configFromFile = false; // 是否从 code-lab-config.js 恢复的配置

  function loadSettings(){
    try{
      var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if(saved.provider) settings.provider = saved.provider;
      if(saved.apiBase) settings.apiBase = saved.apiBase;
      if(saved.apiKey) settings.apiKey = saved.apiKey;
      if(saved.model) settings.model = saved.model;
      if(saved.proxy !== undefined) settings.proxy = saved.proxy || '';
    }catch(e){}
    // 浏览器本地没有配置时,从 data 文件夹的 code-lab-config.js 文件恢复(不受浏览器清缓存影响)
    if(!settings.apiKey && window.WB_CONFIG){
      var c = window.WB_CONFIG;
      if(c.provider) settings.provider = c.provider;
      if(c.apiBase) settings.apiBase = c.apiBase;
      if(c.apiKey) settings.apiKey = c.apiKey;
      if(c.model) settings.model = c.model;
      if(c.proxy !== undefined) settings.proxy = c.proxy || '';
      configFromFile = true;
      try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }catch(e){}
    }
    if(!settings.apiBase){ var p = getPreset(settings.provider); settings.apiBase = p.base; }
    if(!settings.model){ var p2 = getPreset(settings.provider); settings.model = p2.model; }
  }

  function saveSettings(){
    try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; }catch(e){ return false; }
  }


  /* ============================================================
   * 配置记忆：把常用 API 配置存成多套，随时切换
   * 本地 localStorage 立即保存；服务端可用时再备份到 data/code-lab-profiles.json
   * ============================================================ */
  var PROFILES_KEY = 'wb_py_allinone_profiles';
  var ACTIVE_PROFILE_KEY = 'wb_py_allinone_active_profile';
  var PROFILES_API = '/api/code-lab/profiles';
  var PROFILE_LIMIT = 50;
  var profiles = [];
  var activeProfileId = '';
  var profileBackupState = 'local';
  var profilePushTimer = 0;
  var canSyncProfiles = location.protocol === 'http:' || location.protocol === 'https:';

  function currentSettingsSnapshot(){
    return {
      provider: settings.provider,
      apiBase: settings.apiBase,
      apiKey: settings.apiKey,
      model: settings.model,
      proxy: settings.proxy
    };
  }

  function normalizeProfile(item){
    if(!item || typeof item !== 'object') return null;
    var id = typeof item.id === 'string' ? item.id.trim().slice(0, 64) : '';
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
    var name = typeof item.name === 'string' ? item.name.trim().slice(0, 60) : '';
    if(!name) return null;
    function text(value, max){
      return typeof value === 'string' ? value.trim().slice(0, max) : '';
    }
    var createdAt = text(item.createdAt, 40);
    var updatedAt = text(item.updatedAt, 40);
    return {
      id: id,
      name: name,
      provider: text(item.provider, 40) || 'deepseek',
      apiBase: text(item.apiBase, 600),
      apiKey: text(item.apiKey, 600),
      model: text(item.model, 120),
      proxy: text(item.proxy, 600),
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: updatedAt || createdAt || new Date().toISOString()
    };
  }

  function profileSettings(profile){
    var preset = getPreset(profile.provider);
    return {
      provider: profile.provider || 'deepseek',
      apiBase: profile.apiBase || preset.base,
      apiKey: profile.apiKey || '',
      model: profile.model || preset.model,
      proxy: profile.proxy || ''
    };
  }

  function sameProfileSettings(profile, value){
    var p = profileSettings(profile);
    return p.provider === value.provider
      && p.apiBase === value.apiBase
      && p.apiKey === value.apiKey
      && p.model === value.model
      && (p.proxy || '') === (value.proxy || '');
  }

  function syncActiveProfileMatch(){
    if(activeProfileId){
      for(var i=0;i<profiles.length;i++){
        if(profiles[i].id === activeProfileId && sameProfileSettings(profiles[i], settings)) return;
      }
    }
    activeProfileId = '';
    for(var j=0;j<profiles.length;j++){
      if(sameProfileSettings(profiles[j], settings)){ activeProfileId = profiles[j].id; return; }
    }
  }

  function profileLabel(profile){
    return profile.name + (profile.model ? ' · ' + profile.model : '');
  }

  function profileOptionsHtml(){
    var html = '<option value="">当前手动配置</option>';
    profiles.forEach(function(profile){
      html += '<option value="' + escapeHtml(profile.id) + '"'
        + (profile.id === activeProfileId ? ' selected' : '') + '>'
        + escapeHtml(profileLabel(profile)) + '</option>';
    });
    return html;
  }

  function persistProfilesLocalOnly(){
    try{
      localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
      localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId || '');
      return true;
    }catch(e){ return false; }
  }

  function scheduleProfilePush(delay){
    if(!canSyncProfiles) return;
    if(profilePushTimer) clearTimeout(profilePushTimer);
    profilePushTimer = setTimeout(function(){
      profilePushTimer = 0;
      pushProfilesToServer();
    }, delay == null ? 300 : delay);
  }

  function saveProfiles(){
    var ok = persistProfilesLocalOnly();
    if(profiles.length) scheduleProfilePush(300);
    return ok;
  }

  function pushProfilesToServer(){
    if(!canSyncProfiles) return;
    try{
      fetch(PROFILES_API, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles: profiles, activeProfileId: activeProfileId })
      }).then(function(response){
        profileBackupState = response.ok ? 'synced' : 'local';
        updateProfileHint();
      }).catch(function(){
        profileBackupState = 'local';
        updateProfileHint();
      });
    }catch(e){
      profileBackupState = 'local';
      updateProfileHint();
    }
  }

  function mergeProfiles(list){
    var byId = {};
    profiles.forEach(function(profile){ byId[profile.id] = profile; });
    (list || []).forEach(function(raw){
      var profile = normalizeProfile(raw);
      if(!profile) return;
      var old = byId[profile.id];
      if(!old || String(profile.updatedAt || '') > String(old.updatedAt || '')) byId[profile.id] = profile;
    });
    profiles = Object.keys(byId).map(function(id){ return byId[id]; });
    profiles.sort(function(a,b){ return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
    if(profiles.length > PROFILE_LIMIT) profiles = profiles.slice(0, PROFILE_LIMIT);
    syncActiveProfileMatch();
  }

  function pullProfilesFromServer(){
    if(!canSyncProfiles) return;
    fetch(PROFILES_API, { credentials: 'same-origin' })
      .then(function(response){
        if(!response.ok) throw new Error('profiles unavailable');
        return response.json();
      })
      .then(function(data){
        if(!data || !Array.isArray(data.profiles)) return;
        var before = JSON.stringify(profiles);
        mergeProfiles(data.profiles);
        if(JSON.stringify(profiles) !== before) persistProfilesLocalOnly();
        profileBackupState = 'synced';
        renderProfileSelect();
        refreshCfgBars();
        updateProfileHint();
        if(profiles.length) scheduleProfilePush(0);
        else if(data.profiles.length) scheduleProfilePush(0);
      })
      .catch(function(){
        profileBackupState = 'local';
        updateProfileHint();
      });
  }

  function loadProfiles(){
    try{
      var saved = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]');
      profiles = Array.isArray(saved) ? saved.map(normalizeProfile).filter(Boolean) : [];
    }catch(e){ profiles = []; }
    profiles.sort(function(a,b){ return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
    if(profiles.length > PROFILE_LIMIT) profiles = profiles.slice(0, PROFILE_LIMIT);
    activeProfileId = '';
    try{ activeProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY) || ''; }catch(e){}
    // config.js 里也能带 profiles（旧版只有单套配置，这里兼容）
    if(!profiles.length && window.WB_CONFIG && Array.isArray(window.WB_CONFIG.profiles) && window.WB_CONFIG.profiles.length){
      mergeProfiles(window.WB_CONFIG.profiles);
      persistProfilesLocalOnly();
    }
    syncActiveProfileMatch();
    renderProfileSelect();
  }

  function updateProfileHint(){
    var el = $('profileHint');
    if(!el) return;
    if(!profiles.length){
      el.innerHTML = '还没有保存的配置。填好下方参数后点「保存当前配置」，下次就能直接选择。';
      return;
    }
    var active = null;
    for(var i=0;i<profiles.length;i++){ if(profiles[i].id === activeProfileId){ active = profiles[i]; break; } }
    var backup = profileBackupState === 'synced'
      ? '已同步到 data/code-lab-profiles.json。'
      : '已保存在本机浏览器；服务端备份不可用时不影响使用。';
    el.innerHTML = '已记住 <b>' + profiles.length + '</b> 套配置'
      + (active ? '，当前使用：<b>' + escapeHtml(active.name) + '</b>' : '，当前是手动配置')
      + '。' + backup;
  }

  function renderProfileSelect(){
    var select = $('profileSelect');
    if(select){
      select.innerHTML = '<option value="">— 选择已保存的配置 —</option>' + profileOptionsHtml().replace('<option value="">当前手动配置</option>', '');
      if(activeProfileId && profiles.some(function(p){ return p.id === activeProfileId; })) select.value = activeProfileId;
      else select.value = '';
    }
    updateProfileHint();
  }

  function markManualConfig(){
    if(!activeProfileId) return;
    activeProfileId = '';
    saveProfiles();
    renderProfileSelect();
  }

  function saveCurrentProfile(){
    syncInputsToSettings();
    var nameInput = $('profileNameInput');
    var name = (nameInput && nameInput.value ? nameInput.value : '').trim().slice(0, 40);
    if(!name){
      var preset = getPreset(settings.provider);
      name = (preset.name + (settings.model ? ' · ' + settings.model : '')).slice(0, 40);
    }
    if(!settings.apiBase){
      $('profileMsg').innerHTML = '<div class="err">请先填写 API 地址，再保存配置。</div>';
      return;
    }
    if(!settings.model){
      $('profileMsg').innerHTML = '<div class="err">请先填写模型名称，再保存配置。</div>';
      return;
    }

    var now = new Date().toISOString();
    var existing = null;
    for(var i=0;i<profiles.length;i++){ if(profiles[i].name === name){ existing = profiles[i]; break; } }
    var snapshot = currentSettingsSnapshot();

    if(existing){
      existing.provider = snapshot.provider;
      existing.apiBase = snapshot.apiBase;
      existing.apiKey = snapshot.apiKey;
      existing.model = snapshot.model;
      existing.proxy = snapshot.proxy;
      existing.updatedAt = now;
      activeProfileId = existing.id;
    }else{
      var id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      profiles.unshift({
        id: id, name: name,
        provider: snapshot.provider,
        apiBase: snapshot.apiBase,
        apiKey: snapshot.apiKey,
        model: snapshot.model,
        proxy: snapshot.proxy,
        createdAt: now,
        updatedAt: now
      });
      if(profiles.length > PROFILE_LIMIT) profiles = profiles.slice(0, PROFILE_LIMIT);
      activeProfileId = id;
    }

    var ok = saveSettings();
    var profileOk = saveProfiles();
    if(nameInput) nameInput.value = name;
    refreshSettingsUI();
    updateSaveStatus(ok && profileOk);
    $('profileMsg').innerHTML = profileOk
      ? '<div class="ok-box">&#10003; 已保存配置「' + escapeHtml(name) + '」。下次打开可在上方或代码页顶部直接选择。</div>'
      : '<div class="err">配置已写入当前设置，但配置记忆保存失败（浏览器 localStorage 可能不可用）。</div>';
    if(ok && profileOk) showToast('已保存配置：' + name);
    pushProfilesToServer();
  }

  function applyProfile(id){
    var profile = null;
    for(var i=0;i<profiles.length;i++){ if(profiles[i].id === id){ profile = profiles[i]; break; } }
    if(!profile){
      activeProfileId = '';
      saveProfiles();
      renderProfileSelect();
      refreshCfgBars();
      return;
    }
    var next = profileSettings(profile);
    settings.provider = next.provider;
    settings.apiBase = next.apiBase;
    settings.apiKey = next.apiKey;
    settings.model = next.model;
    settings.proxy = next.proxy;
    activeProfileId = profile.id;
    var ok = saveSettings();
    saveProfiles();
    refreshSettingsUI();
    var nameInput = $('profileNameInput');
    if(nameInput) nameInput.value = profile.name;
    $('profileMsg').innerHTML = '<div class="ok-box">&#10003; 已切换到「' + escapeHtml(profile.name) + '」。</div>';
    updateSaveStatus(ok);
    showToast('已切换配置：' + profile.name);
    pushProfilesToServer();
  }

  function deleteSelectedProfile(){
    var select = $('profileSelect');
    var id = select ? select.value : '';
    if(!id){
      $('profileMsg').innerHTML = '<div class="err">请先在下拉框里选择要删除的配置。</div>';
      return;
    }
    var profile = null;
    for(var i=0;i<profiles.length;i++){ if(profiles[i].id === id){ profile = profiles[i]; break; } }
    if(!profile) return;
    if(!confirm('确定删除配置「' + profile.name + '」吗？当前正在使用的参数不会改变。')) return;
    profiles = profiles.filter(function(p){ return p.id !== id; });
    if(activeProfileId === id) activeProfileId = '';
    var ok = saveProfiles();
    renderProfileSelect();
    refreshCfgBars();
    $('profileMsg').innerHTML = ok
      ? '<div class="ok-box">已删除配置「' + escapeHtml(profile.name) + '」。</div>'
      : '<div class="err">删除失败：浏览器 localStorage 不可用。</div>';
    if(ok) showToast('已删除配置：' + profile.name);
    pushProfilesToServer();
  }

  function ensureProfileCard(){
    if($('profileCard')) return;
    var panel = $('panel-settings');
    if(!panel) return;
    var card = document.createElement('div');
    card.className = 'card';
    card.id = 'profileCard';
    card.style.marginTop = '18px';
    card.innerHTML = '<h2><span class="badge-dot" style="background:var(--cl-good)"></span>配置记忆</h2>'
      + '<p class="sub">把常用的平台 / Key 存成一套配置，下次直接选择；保存在本机，并在服务端可用时自动备份到 data 文件夹。</p>'
      + '<div class="field">'
      + '  <label>已保存的配置</label>'
      + '  <div class="profile-row">'
      + '    <select id="profileSelect" aria-label="选择已保存的配置"></select>'
      + '    <button class="btn btn-primary" type="button" id="applyProfileBtn">使用</button>'
      + '    <button class="btn btn-ghost" type="button" id="deleteProfileBtn">删除</button>'
      + '  </div>'
      + '  <div class="hint" id="profileHint"></div>'
      + '</div>'
      + '<div class="field">'
      + '  <label>保存当前配置为</label>'
      + '  <div class="profile-row">'
      + '    <input type="text" id="profileNameInput" maxlength="40" placeholder="例如：DeepSeek 日常 / 智谱免费额度">'
      + '    <button class="btn btn-primary" type="button" id="saveProfileBtn">保存</button>'
      + '  </div>'
      + '  <div class="hint">同名会更新；Key 只保存在本机，不会发到模型平台以外的地方。</div>'
      + '</div>'
      + '<div id="profileMsg"></div>';
    var note = panel.querySelector('.note');
    panel.insertBefore(card, note || null);
  }

  function bindProfileEvents(){
    $('saveProfileBtn').addEventListener('click', saveCurrentProfile);
    $('applyProfileBtn').addEventListener('click', function(){
      var select = $('profileSelect');
      if(!select || !select.value){
        $('profileMsg').innerHTML = '<div class="err">请先选择一套已保存的配置。</div>';
        return;
      }
      applyProfile(select.value);
    });
    $('deleteProfileBtn').addEventListener('click', deleteSelectedProfile);
    $('profileSelect').addEventListener('change', function(){
      if(this.value) applyProfile(this.value);
    });
    $('profileNameInput').addEventListener('keydown', function(event){
      if(event.key === 'Enter'){ event.preventDefault(); saveCurrentProfile(); }
    });
  }

  /* ===== 统一 LLM 调用(化简/学习/测试共用) ===== */
  function callLLM(messages, opts){
    opts = opts || {};
    if(!settings.apiKey){ if(opts.onError) opts.onError('请先在「设置」页填写 API Key'); return; }
    if(!settings.apiBase){ if(opts.onError) opts.onError('请先在「设置」页填写 API 地址'); return; }

    var baseUrl = settings.apiBase.replace(/\/+$/,'') + '/chat/completions';
    var url = settings.proxy ? (settings.proxy + encodeURIComponent(baseUrl)) : baseUrl;

    var headers = { 'Content-Type':'application/json', 'Authorization':'Bearer ' + settings.apiKey };
    if(settings.provider === 'openrouter'){
      headers['HTTP-Referer'] = location.origin || 'http://localhost';
      headers['X-Title'] = 'Python/C++学习化简工作台';
    }
    var preset = getPreset(settings.provider);
    if(preset.headers){ for(var h in preset.headers){ headers[h] = preset.headers[h]; } }

    var body = { model: settings.model, messages: messages };
    // 不传 temperature:不少新推理模型只接受默认值,自定义会报 "only 1 is allowed"

    if(opts.stream){
      body.stream = true;
      fetch(url, { method:'POST', headers:headers, body: JSON.stringify(body) })
        .then(function(response){
          if(!response.ok){
            return response.text().then(function(t){ throw new Error('HTTP ' + response.status + ': ' + (t || '').slice(0, 200)); });
          }
          if(!response.body){
            return response.json().then(function(data){
              var c = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
              if(opts.onChunk) opts.onChunk(c, c);
              if(opts.onDone) opts.onDone(c);
            });
          }
          var reader = response.body.getReader();
          var decoder = new TextDecoder();
          var buffer = '';
          var full = '';
          var finished = false;
          function finish(){
            if(finished) return;
            finished = true;
            if(opts.onDone) opts.onDone(full);
          }
          function pump(){
            return reader.read().then(function(result){
              if(result.done) return;
              buffer += decoder.decode(result.value, { stream:true });
              var lines = buffer.split('\n');
              buffer = lines.pop();
              for(var i=0;i<lines.length;i++){
                var line = lines[i].trim();
                if(line.indexOf('data: ') === 0){
                  var ds = line.slice(6);
                  if(ds === '[DONE]'){ finish(); return; }
                  try{
                    var p = JSON.parse(ds);
                    var d = p.choices && p.choices[0] && p.choices[0].delta;
                    if(d && d.content){
                      full += d.content;
                      if(opts.onChunk) opts.onChunk(d.content, full);
                    }
                  }catch(e){}
                }
              }
              return pump();
            });
          }
          return pump().then(finish);
        })
        .catch(function(err){ if(opts.onError) opts.onError(errMsg(err)); });
    } else {
      body.stream = false;
      fetch(url, { method:'POST', headers:headers, body: JSON.stringify(body) })
        .then(function(resp){
          return resp.text().then(function(raw){
            var data = null;
            try{ data = JSON.parse(raw); }catch(e){}
            if(!resp.ok){
              var m = 'HTTP ' + resp.status;
              if(data && data.error){ m = data.error.message || data.error.type || JSON.stringify(data.error); }
              else if(raw){ m = raw.slice(0, 300); }
              throw new Error(m);
            }
            var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if(!content){ throw new Error('平台返回结构异常,请检查模型名是否正确'); }
            return content;
          });
        })
        .then(function(content){ if(opts.onDone) opts.onDone(content); })
        .catch(function(err){ if(opts.onError) opts.onError(errMsg(err)); });
    }
  }

  /* ============================================================
   * Tab 切换
   * ============================================================ */
  function showTab(name){
    ['simplify','learn','settings'].forEach(function(t){
      var panel = $('panel-' + t);
      var btn = $('tab-' + t);
      if(t === name){ panel.classList.add('active'); btn.classList.add('active'); }
      else{ panel.classList.remove('active'); btn.classList.remove('active'); }
    });
    if(name === 'learn'){ updateLineNumbers(); }
    if(name === 'settings'){ maybeAutoLoadModels(); }
    window.scrollTo(0, 0);
  }
  $('tab-simplify').addEventListener('click', function(){ showTab('simplify'); });
  $('tab-learn').addEventListener('click', function(){ showTab('learn'); });
  $('tab-settings').addEventListener('click', function(){ showTab('settings'); });

  /* ============================================================
   * 设置页 UI
   * ============================================================ */
  function renderProviderGrid(){
    var grid = $('providerGrid');
    var html = '';
    var lastGroup = '';
    PROVIDER_PRESETS.forEach(function(p){
      if(p.group !== lastGroup){
        html += '<div class="provider-group-title">' + p.group + '</div>';
        lastGroup = p.group;
      }
      html += '<div class="provider-preset" data-provider="' + p.id + '">'
        + '<div class="provider-name">' + escapeHtml(p.name) + '</div>'
        + '<div class="provider-model">' + escapeHtml(p.model || '填入任意 OpenAI 兼容 API') + '</div>'
        + '</div>';
    });
    grid.innerHTML = html;
    grid.querySelectorAll('.provider-preset').forEach(function(el){
      el.addEventListener('click', function(){ applyProvider(el.getAttribute('data-provider')); });
    });
    markActivePreset();
  }

  function markActivePreset(){
    root.querySelectorAll('.provider-preset').forEach(function(el){
      if(el.getAttribute('data-provider') === settings.provider){ el.classList.add('active'); }
      else{ el.classList.remove('active'); }
    });
  }

  function platformLinkHtml(id, label){
    var link = PLATFORM_LINKS[id];
    if(!link) return '';
    return '<a href="' + escapeHtml(link.console) + '" target="_blank" rel="noopener noreferrer" title="打开 '
      + escapeHtml(label) + ' API 开放平台">' + escapeHtml(label) + ' ↗</a>';
  }

  function renderProviderLinks(){
    var el = $('providerLinks');
    if(!el) return;
    var ids = ['deepseek','zhipu','qwen','moonshot','siliconflow','openrouter','openai','anthropic','gemini'];
    var html = '<span class="api-links-label">API 开放平台：</span>';
    ids.forEach(function(id){
      var preset = getPreset(id);
      html += platformLinkHtml(id, preset.name);
    });
    html += '<a href="#" data-action="api-tutorial">&#128214; 获取 API 小白教程</a>';
    el.innerHTML = html;
  }

  function ensureProviderLinks(){
    if($('providerLinks')) return;
    var grid = $('providerGrid');
    if(!grid || !grid.parentNode) return;
    var div = document.createElement('div');
    div.id = 'providerLinks';
    div.className = 'api-links';
    grid.parentNode.insertBefore(div, grid.nextSibling);
    renderProviderLinks();
  }

  function ensureApiIntro(){
    if($('apiIntro')) return;
    var panel = $('panel-settings');
    if(!panel) return;
    var intro = document.createElement('div');
    intro.id = 'apiIntro';
    intro.className = 'api-explain';
    intro.innerHTML = '<b>API 是 AI 的钥匙</b>：没有 Key 也能用本地规则化简；配置 Key 后，才能使用 AI 化简、逐行讲解和追问。'
      + ' <a href="#" data-action="api-tutorial">第一次用？看小白教程 →</a>';
    panel.insertBefore(intro, panel.firstChild);
  }

  function parseModelList(data){
    var arr = [];
    if(Array.isArray(data)) arr = data;
    else if(data && Array.isArray(data.data)) arr = data.data;
    else if(data && Array.isArray(data.models)) arr = data.models;
    var out = [], seen = {};
    arr.forEach(function(item){
      var id = '';
      if(typeof item === 'string') id = item;
      else if(item && typeof item === 'object') id = item.id || item.name || item.model || item.slug || '';
      id = String(id || '').replace(/^models\//, '').trim();
      if(!id || seen[id]) return;
      seen[id] = 1;
      out.push(id);
    });
    out.sort(function(a,b){ return a.localeCompare(b); });
    return out;
  }

  function modelsCacheKey(){
    return settings.provider + '|' + String(settings.apiBase || '').replace(/\/+$/, '');
  }

  function readModelsCache(){
    try{
      var data = JSON.parse(localStorage.getItem(MODELS_KEY) || '{}');
      return data && typeof data === 'object' ? data : {};
    }catch(e){ return {}; }
  }

  function getCachedModels(){
    var entry = readModelsCache()[modelsCacheKey()];
    return entry && Array.isArray(entry.models) ? entry.models : [];
  }

  function saveModelsCache(list){
    try{
      var all = readModelsCache();
      var keys = Object.keys(all);
      if(keys.length > 20) delete all[keys[0]];
      all[modelsCacheKey()] = { models: list, at: Date.now() };
      localStorage.setItem(MODELS_KEY, JSON.stringify(all));
    }catch(e){}
  }

  function defaultModelHint(){
    return '填好 API 地址和 Key 后点「读取模型」，会自动列出平台支持的全部模型；也可以直接手动输入。';
  }

  function setModelHint(text, kind){
    var el = $('modelHint');
    if(!el) return;
    el.className = 'hint';
    el.style.color = kind === 'error' ? 'var(--cl-warn)' : (kind === 'ok' ? 'var(--cl-good)' : '');
    el.textContent = text;
  }

  function renderModelOptions(list, source){
    var select = $('modelSelect');
    var datalist = $('modelList');
    var clean = (Array.isArray(list) ? list : []).filter(function(id){ return typeof id === 'string' && id; });
    if(!select) return;
    if(!clean.length){
      select.hidden = true;
      select.innerHTML = '';
      if(datalist){
        datalist.innerHTML = '';
        (getPreset(settings.provider).models || []).forEach(function(id){
          var option = document.createElement('option');
          option.value = id;
          datalist.appendChild(option);
        });
      }
      setModelHint(defaultModelHint());
      return;
    }
    select.hidden = false;
    select.innerHTML = '<option value="">— 选择平台模型（共 ' + clean.length + ' 个）—</option>'
      + clean.map(function(id){
        return '<option value="' + escapeHtml(id) + '">' + escapeHtml(id) + '</option>';
      }).join('');
    if(clean.indexOf(settings.model) >= 0) select.value = settings.model;
    else select.value = '';
    if(datalist){
      datalist.innerHTML = '';
      clean.slice(0, 2000).forEach(function(id){
        var option = document.createElement('option');
        option.value = id;
        datalist.appendChild(option);
      });
    }
    setModelHint('已从平台读取 ' + clean.length + ' 个模型，直接在下方选择即可；也可以手动输入。', 'ok');
  }

  function renderCachedModels(){
    var cached = getCachedModels();
    if(cached.length) renderModelOptions(cached, 'cache');
    else renderModelOptions([], 'empty');
  }

  function modelRequestHeaders(){
    var headers = {};
    if(settings.provider === 'anthropic'){
      headers['x-api-key'] = settings.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }else{
      headers.Authorization = 'Bearer ' + settings.apiKey;
    }
    if(settings.provider === 'openrouter'){
      headers['HTTP-Referer'] = location.origin || 'http://localhost';
      headers['X-Title'] = '学习中心 · 代码学习';
    }
    return headers;
  }

  function loadModels(opts){
    opts = opts || {};
    if(modelsLoading) return;
    syncInputsToSettings();
    if(!settings.apiBase){
      setModelHint('请先填写 API 地址，再读取模型。', 'error');
      return;
    }
    if(!settings.apiKey){
      setModelHint('请先填写 API Key，再读取模型。', 'error');
      return;
    }

    var base = settings.apiBase.replace(/\/+$/, '');
    var target = base + '/models';
    if(settings.provider === 'anthropic') target += '?limit=1000';
    if(settings.proxy) target = settings.proxy + encodeURIComponent(target);

    var btn = $('loadModelsBtn');
    modelsLoading = true;
    if(btn){ btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>读取中…'; }
    setModelHint('正在从平台读取模型列表…');

    fetch(target, { headers: modelRequestHeaders() })
      .then(function(response){
        return response.text().then(function(raw){
          if(!response.ok){
            var message = 'HTTP ' + response.status;
            try{
              var err = JSON.parse(raw);
              if(err && err.error) message = err.error.message || err.error.type || message;
            }catch(e){}
            throw new Error(message);
          }
          var data = null;
          try{ data = JSON.parse(raw); }catch(e){ throw new Error('平台返回的不是 JSON，可能不支持模型列表接口'); }
          return parseModelList(data);
        });
      })
      .then(function(list){
        if(!list.length) throw new Error('平台没有返回可用模型');
        saveModelsCache(list);
        renderModelOptions(list, 'live');
        if(!opts.silent) showToast('已读取 ' + list.length + ' 个模型');
      })
      .catch(function(err){
        setModelHint('读取模型失败：' + (err && err.message ? err.message : err) + '。不影响手动输入模型名。', 'error');
        if(!opts.silent) showToast('读取模型失败，可手动输入模型名', 'error');
      })
      .then(function(){
        modelsLoading = false;
        if(btn){ btn.disabled = false; btn.textContent = '读取模型'; }
      });
  }

  function maybeAutoLoadModels(){
    if(modelsLoading || !settings.apiKey || !settings.apiBase) return;
    var panel = $('panel-settings');
    if(!panel || !panel.classList || typeof panel.classList.contains !== 'function') return;
    if(!panel.classList.contains('active')) return;
    if(getCachedModels().length){ renderCachedModels(); return; }
    loadModels({ silent: true });
  }

  function ensureModelPicker(){
    var input = $('modelInput');
    if(!input) return;
    if($('modelSelect')) return;
    var field = input.closest && input.closest('.field');
    if(!field) return;
    var row = document.createElement('div');
    row.className = 'profile-row';
    field.insertBefore(row, input);
    row.appendChild(input);
    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'loadModelsBtn';
    button.className = 'btn btn-ghost';
    button.textContent = '读取模型';
    row.appendChild(button);
    var hint = document.createElement('div');
    hint.id = 'modelHint';
    hint.className = 'hint';
    hint.textContent = defaultModelHint();
    field.appendChild(hint);
    var select = document.createElement('select');
    select.id = 'modelSelect';
    select.className = 'model-select';
    select.hidden = true;
    select.setAttribute('aria-label', '从平台读取的模型');
    field.appendChild(select);

    button.addEventListener('click', function(){ loadModels(); });
    select.addEventListener('change', function(){
      if(!select.value) return;
      $('modelInput').value = select.value;
      settings.model = select.value;
      markManualConfig();
      autoSave();
      refreshCfgBars();
    });
  }

  var tutorialOpen = false;
  var bodyOverflowBefore = '';

  function ensureTutorialModal(){
    if($('apiTutorial')) return;
    var overlay = document.createElement('div');
    overlay.id = 'apiTutorial';
    overlay.className = 'tutorial-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'tutorialTitle');
    overlay.addEventListener('click', function(event){
      if(event.target === overlay || event.target.closest('[data-tutorial-close]')) closeApiTutorial();
    });
    root.appendChild(overlay);
    window.addEventListener('keydown', function(event){
      if(event.key === 'Escape' && tutorialOpen) closeApiTutorial();
    });
  }

  function tutorialHtml(providerId){
    var preset = getPreset(providerId);
    var link = PLATFORM_LINKS[providerId] || null;
    var platformLink = link
      ? '<a href="' + escapeHtml(link.console) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(preset.name) + ' API 开放平台 ↗</a>'
      : '';
    var keyLink = link
      ? '<a href="' + escapeHtml(link.key) + '" target="_blank" rel="noopener noreferrer">直接打开 API Key 页面 ↗</a>'
      : '';
    var note = link && link.note
      ? '<div class="tutorial-note">' + escapeHtml(link.note) + '</div>'
      : '';
    var keyButton = link
      ? '<a class="btn btn-primary" href="' + escapeHtml(link.key) + '" target="_blank" rel="noopener noreferrer">去获取 Key</a>'
      : '';
    return '<div class="tutorial-panel">'
      + '<div class="tutorial-head"><div><span class="pill ai">小白教程</span><h2 id="tutorialTitle">获取 ' + escapeHtml(preset.name) + ' API Key</h2>'
      + '<p class="sub">API 是 AI 的钥匙：拿到 Key 并填进来，AI 功能才会打开。</p></div>'
      + '<button type="button" class="tutorial-close" data-tutorial-close aria-label="关闭教程">&#10005;</button></div>'
      + '<div class="tutorial-body">'
      + '<div class="api-explain"><b>API 是 AI 的钥匙</b>。学习中心不会替你注册平台，也不会保存你的账号密码；你只需要在平台创建一把「钥匙」（API Key），粘贴到设置里。没有 Key 时，代码化简的本地规则仍然能用，只是 AI 化简、逐行讲解和追问用不了。</div>'
      + '<h3>跟着做，大约 3 分钟</h3>'
      + '<ol class="tutorial-steps">'
      + '<li><b>打开平台</b><br>' + (platformLink || '在平台官网找到 API 开放平台') + (keyLink ? '<br>' + keyLink : '') + '</li>'
      + '<li><b>注册 / 登录</b><br>国内平台通常需要手机号注册和实名认证；已有账号直接登录。</li>'
      + '<li><b>创建 API Key</b><br>在控制台找「API Keys / 密钥 / 令牌 / API-KEY」；点创建，复制生成的一串字符。Key 通常只完整显示一次，先存到记事本。</li>'
      + '<li><b>回到学习中心填入</b><br>粘贴到「接口配置 → API Key」，点「读取模型」，从下拉列表选一个模型，再点「测试连接」。</li>'
      + '<li><b>开始使用</b><br>回到「代码化简 / 代码学习」，AI 功能就可以用了。</li>'
      + '</ol>'
      + note
      + '<div class="tutorial-note"><b>安全提醒：</b>API Key 相当于密码和钱包，只保存在你自己的电脑上；不要发给别人，也不要提交到 GitHub。Key 泄露时，去平台删除并重新创建。</div>'
      + '<div class="tutorial-actions">' + keyButton
      + '<button type="button" class="btn btn-ghost" data-tutorial-close>返回设置</button></div>'
      + '</div></div>';
  }

  function openApiTutorial(providerId){
    ensureTutorialModal();
    var overlay = $('apiTutorial');
    if(!overlay) return;
    overlay.innerHTML = tutorialHtml(providerId || settings.provider);
    overlay.hidden = false;
    tutorialOpen = true;
    if(root.host) root.host.classList.add('tutorial-open');
    bodyOverflowBefore = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    var close = overlay.querySelector('[data-tutorial-close]');
    if(close) setTimeout(function(){ close.focus(); }, 0);
  }

  function closeApiTutorial(){
    var overlay = $('apiTutorial');
    if(overlay) overlay.hidden = true;
    tutorialOpen = false;
    if(root.host) root.host.classList.remove('tutorial-open');
    document.body.style.overflow = bodyOverflowBefore || '';
  }

  function applyProvider(id){
    var p = getPreset(id);
    settings.provider = id;
    settings.apiBase = p.base;
    settings.model = p.model;
    markManualConfig();
    refreshSettingsUI();
    autoSave();
  }

  function refreshSettingsUI(){
    $('apiBaseInput').value = settings.apiBase || '';
    $('apiKeyInput').value = settings.apiKey || '';
    $('modelInput').value = settings.model || '';
    $('proxyInput').value = settings.proxy || '';
    $('apiKeyHint').innerHTML = '如何获取：<a href="#" data-action="api-tutorial">查看小白教程</a> · '
      + escapeHtml(getPreset(settings.provider).hint || '');

    var corsTxt = '';
    var p = getPreset(settings.provider);
    if(p.cors === 'ok'){ corsTxt = '<span style="color:var(--cl-good)">已实测支持浏览器直连,可放心使用。</span>'; }
    else if(p.cors === 'header'){ corsTxt = '已自动附带浏览器直连所需请求头;若仍失败请填代理。'; }
    else if(p.cors === 'no'){ corsTxt = '<span style="color:var(--cl-warn)">该平台会拦浏览器直连(CORS)。建议改用 OpenRouter 中转,或在下方填写 CORS 代理地址。</span>'; }
    else{ corsTxt = '自定义接口能否直连,取决于该服务是否放行跨域;本地 Ollama 请用 OLLAMA_ORIGINS=* 启动。'; }
    $('apiBaseHint').innerHTML = corsTxt;

    var ml = $('modelList');
    ml.innerHTML = '';
    (p.models || []).forEach(function(m){
      var o = document.createElement('option'); o.value = m; ml.appendChild(o);
    });
    markActivePreset();
    renderProfileSelect();
    refreshCfgBars();
    renderCachedModels();
    maybeAutoLoadModels();
  }

  function refreshCfgBars(){
    var p = getPreset(settings.provider);
    var ok = !!settings.apiKey;
    var html = '<span>&#9881;&#65039; 当前模型:</span><b>' + escapeHtml(settings.model || '(未填)') + '</b>'
      + '<span>@ ' + escapeHtml(p.name) + '</span>'
      + (ok ? '<span style="color:var(--cl-good);font-weight:600">Key 已配置 &#10003;</span>'
            : '<span style="color:var(--cl-warn);font-weight:600">未填 API Key,只影响 AI 功能</span>'
              + '<button class="link-btn" data-action="api-tutorial">API 是 AI 的钥匙 · 查看教程</button>');
    if(profiles.length){
      html += '<span class="cfg-profile"><span>配置:</span><select data-profile-select aria-label="切换已保存的配置">'
        + profileOptionsHtml() + '</select></span>';
    }
    html += '<button class="link-btn" data-action="goto-settings">去设置</button>';
    $('cfgBar').innerHTML = html;
    $('learnCfgBar').innerHTML = html;
  }

  root.addEventListener('click', function(e){
    var tutorial = e.target.closest('[data-action="api-tutorial"]');
    if(tutorial){
      e.preventDefault();
      openApiTutorial(tutorial.getAttribute('data-provider') || settings.provider);
      return;
    }
    var el = e.target.closest('[data-action="goto-settings"]');
    if(el){ showTab('settings'); }
  });

  root.addEventListener('change', function(e){
    var select = e.target.closest('[data-profile-select]');
    if(!select) return;
    if(select.value){
      applyProfile(select.value);
    }else{
      activeProfileId = '';
      saveProfiles();
      renderProfileSelect();
      refreshCfgBars();
    }
  });

  function syncInputsToSettings(){
    settings.apiBase = $('apiBaseInput').value.trim();
    settings.apiKey = $('apiKeyInput').value.trim();
    settings.model = $('modelInput').value.trim();
    settings.proxy = $('proxyInput').value.trim();
  }

  var autoSaveTimer = null;
  function updateSaveStatus(ok){
    var el = $('saveStatus');
    if(!el) return;
    var t = new Date();
    function two(n){ return ('0' + n).slice(-2); }
    var ts = two(t.getHours()) + ':' + two(t.getMinutes()) + ':' + two(t.getSeconds());
    var remembered = profiles.length ? ' · 已记住 ' + profiles.length + ' 套配置' : '';
    el.innerHTML = ok
      ? '<span style="color:var(--cl-good);font-weight:600">&#10003; 已自动保存 ' + ts + remembered + '</span><span class="hint" style="margin-left:8px">(存浏览器本地;点「导出」可生成 code-lab-config.js 永久备份)</span>'
      : '<span style="color:var(--cl-warn);font-weight:600">&#9888; 自动保存失败,请点「导出」把配置备份成 code-lab-config.js 文件</span>';
  }

  function autoSave(){
    if(autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function(){
      var ok = saveSettings();
      saveProfiles();
      updateSaveStatus(ok);
    }, 400);
  }

  ['apiBaseInput','apiKeyInput','modelInput','proxyInput'].forEach(function(id){
    $(id).addEventListener('input', function(){
      syncInputsToSettings(); markManualConfig(); refreshCfgBars(); autoSave();
    });
    $(id).addEventListener('change', function(){
      syncInputsToSettings(); markManualConfig(); refreshCfgBars(); autoSave();
      if(id === 'apiKeyInput' || id === 'apiBaseInput'){
        setTimeout(maybeAutoLoadModels, 400);
      }
    });
  });

  // 关闭/刷新页面前再保存一次,防止遗漏
  window.addEventListener('beforeunload', function(){ syncInputsToSettings(); saveSettings(); saveProfiles(); });

  $('saveSettingsBtn').addEventListener('click', function(){
    syncInputsToSettings();
    if(saveSettings()){
      updateSaveStatus(true);
      $('configMsg').innerHTML = '<div class="ok-box">&#10003; 已保存(API 地址 + API Key + 模型名称),下次打开自动载入</div>';
      showToast('配置已保存');
      refreshCfgBars();
    } else {
      updateSaveStatus(false);
      $('configMsg').innerHTML = '<div class="err">保存失败:浏览器 localStorage 不可用(可能处于隐私模式)。请点「导出配置」生成 code-lab-config.js,放到程序目录的 data 文件夹,即可永久生效。</div>';
    }
  });

  $('testBtn').addEventListener('click', function(){
    $('configMsg').innerHTML = '';
    var btn = $('testBtn');
    if(!settings.apiKey && !$('apiKeyInput').value.trim()){
      $('configMsg').innerHTML = '<div class="err">请先填写 API Key</div>';
      return;
    }
    // 先从输入框同步一次
    settings.apiBase = $('apiBaseInput').value.trim();
    settings.apiKey = $('apiKeyInput').value.trim();
    settings.model = $('modelInput').value.trim();
    settings.proxy = $('proxyInput').value.trim();
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>测试中…';
    callLLM([{role:'system',content:'你是一个助手。'},{role:'user',content:'请只回复两个字符:OK'}], {
      onDone:function(text){
        btn.disabled = false; btn.textContent = '测试连接';
        $('configMsg').innerHTML = '<div class="ok-box">连接成功,模型回复:' + escapeHtml((text || 'OK').trim().slice(0, 50)) + '</div>';
        loadModels({ silent: true });
      },
      onError:function(e){
        btn.disabled = false; btn.textContent = '测试连接';
        $('configMsg').innerHTML = '<div class="err">' + escapeHtml(e) + '</div>';
      }
    });
  });

  /* 设置导出 / 导入 */
  $('exportBtn').addEventListener('click', function(){
    syncInputsToSettings();
    var txt = '/* 学习中心 · 代码学习配置\n'
      + ' * 用法:把本文件放到学习中心程序目录的 data 文件夹,并命名为 code-lab-config.js,即可自动生效。\n'
      + ' * 作用:包含当前配置和全部配置记忆;浏览器缓存被清空、换电脑时,打开代码学习会自动恢复。\n'
      + ' * 注意:文件里含 API Key,请妥善保管,不要发给别人。\n'
      + ' */\n'
      + 'window.WB_CONFIG = ' + JSON.stringify({
        provider: settings.provider,
        apiBase: settings.apiBase,
        apiKey: settings.apiKey,
        model: settings.model,
        proxy: settings.proxy,
        profiles: profiles
      }, null, 2) + ';\n';
    var blob = new Blob([txt], { type:'application/javascript' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'code-lab-config.js';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
    $('configMsg').innerHTML = '<div class="ok-box">已导出 code-lab-config.js（含当前配置和 ' + profiles.length + ' 套配置记忆）。请把下载的文件放到学习中心程序目录的 <b>data 文件夹</b>,它就会成为永久备份。</div>';
  });

  $('importBtn').addEventListener('click', function(){ $('importFile').click(); });
  $('importFile').addEventListener('change', function(){
    var f = $('importFile').files && $('importFile').files[0];
    if(!f){ return; }
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var s = String(reader.result);
        var a = s.indexOf('{'), b = s.lastIndexOf('}');
        if(a < 0 || b <= a){ throw new Error('no json'); }
        var cfg = JSON.parse(s.slice(a, b + 1));
        if(cfg.provider) settings.provider = cfg.provider;
        if(cfg.apiBase) settings.apiBase = cfg.apiBase;
        if(cfg.apiKey) settings.apiKey = cfg.apiKey;
        if(cfg.model) settings.model = cfg.model;
        if(cfg.proxy !== undefined) settings.proxy = cfg.proxy || '';
        if(Array.isArray(cfg.profiles)) mergeProfiles(cfg.profiles);
        syncActiveProfileMatch();
        saveSettings();
        saveProfiles();
        refreshSettingsUI();
        updateSaveStatus(true);
        $('configMsg').innerHTML = '<div class="ok-box">&#10003; 已导入并保存配置</div>';
      }catch(e){
        $('configMsg').innerHTML = '<div class="err">导入失败:文件不是有效的配置文件(支持「导出」生成的 code-lab-config.js 或 json 文件)</div>';
      }
    };
    reader.readAsText(f);
    $('importFile').value = '';
  });

  /* ============================================================
   * 语言配置(Python / C++)
   * 每套语言各自带:语法高亮、本地化简规则、示例、速查表、AI 提示词
   * ============================================================ */
  var LANG_KEY = 'wb_py_allinone_lang';
  var LANG = 'python';

  /* 语法高亮的正则统一为 6 组,便于共用同一套解析逻辑:
     1 块注释  2 行注释  3 字符串/字符  4 预处理指令  5 标识符  6 数字  */
  function buildHlRegex(spec){
    return new RegExp(
      '(' + (spec.block || '(?!)') + ')'
      + '|(' + (spec.line || '(?!)') + ')'
      + '|(' + spec.str + ')'
      + '|(' + (spec.pre || '(?!)') + ')'
      + '|([A-Za-z_]\\w*)'
      + '|(\\d+(?:\\.\\d+)?[fFuUlL]*)', 'gm');
  }

  var LANGS = {
    /* ============================== Python ============================== */
    python: {
      id:'python', name:'Python', tag:'PY', fence:'python',
      placeholderCode: '例如:\nif x == True:\n    print(len(items) == 0)',
      placeholderLearn: '# 在这里粘贴或输入 Python 代码\n# 点击「开始解释」逐行学习',
      simplifySub: '本地规则化简和 AI 化简共用这个输入框(Python 规则)',
      learnSub: 'AI 会逐行解释这段代码,讲人话、打比方,零基础也能懂',
      cheatTitle: 'Python 化简速查表',
      cheatSub: '新手最常见的"可以更简洁"的写法,记下来少走弯路',
      lineComment: '#',
      hl: buildHlRegex({
        line: '#[^\\n]*',
        str: '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\''
      }),
      kw: ('def return if elif else for while in not and or True False None print input import from as class lambda with is '
        + 'break continue pass try except finally global del raise yield assert nonlocal async await self '
        + 'range len enumerate sorted sum str int float bool list dict set tuple open zip map filter type isinstance abs round min max').split(' '),
      cheat: [
        ['x = x + 1', 'x += 1'],
        ['if x == True:', 'if x:'],
        ['if x == False:', 'if not x:'],
        ['if x == None:', 'if x is None:'],
        ['if len(s) == 0:', 'if not s:'],
        ['for i in range(len(a))', 'for x in a'],
        ['空列表 + for + append', '列表推导式'],
        ['"..." + 变量 + "..."', 'f-string'],
        ['if c: return True else: return False', 'return c']
      ],
      auto: [
        {id:'aug', name:'增强赋值运算符',
         re: /\b([A-Za-z_]\w*)\s*=\s*\1\s*([+\-*/%]{1,2})\s*([^;#\n]+)/g,
         build: function(m,v,op,rhs){ return v + ' ' + op + '= ' + rhs.trim(); },
         reason: '<code>x = x + 1</code> 里变量 <code>x</code> 出现了两次,很啰嗦。Python 提供了等价简写 <code>x += 1</code>,含义完全不变,读起来更清爽。',
         thinking: ['发现同一个变量在等号两边重复出现','确认 x = x op y 可以写成 x op= y','改写后逻辑完全等价,放心替换']},
        {id:'eqTrue', name:'去掉多余的 == True',
         re: /\b([A-Za-z_]\w*)\s*==\s*True\b/g, build: function(m,v){ return v; },
         reason: '<code>if x == True:</code> 里的 <code>== True</code> 是多余的——<code>if x:</code> 本身就在判断 x 是否为"真"。',
         thinking: ['识别出 x == True 这种重复表达','非空、非零、True 都为真','去掉 == True,逻辑不变']},
        {id:'eqFalse', name:'用 not 代替 == False',
         re: /\b([A-Za-z_]\w*)\s*==\s*False\b/g, build: function(m,v){ return 'not ' + v; },
         reason: '<code>x == False</code> 等价于 <code>not x</code>,直接用 <code>not</code> 更简洁。',
         thinking: ['发现用 == False 做判断','x == False 与 not x 语义相同','用 not 表达,更自然']},
        {id:'neqTrue', name:'用 not 代替 != True',
         re: /\b([A-Za-z_]\w*)\s*!=\s*True\b/g, build: function(m,v){ return 'not ' + v; },
         reason: '<code>x != True</code> 就是在说"x 不是真",直接写 <code>not x</code> 更简洁。',
         thinking: ['看到 != True','它等价于 not x','替换为 not x']},
        {id:'neqFalse', name:'去掉 != False',
         re: /\b([A-Za-z_]\w*)\s*!=\s*False\b/g, build: function(m,v){ return v; },
         reason: '<code>x != False</code> 等价于 <code>x</code>。直接写 <code>if x:</code> 即可。',
         thinking: ['看到 != False','"不是假"等于"真"','直接写 x']},
        {id:'eqNone', name:'与 None 比较用 is',
         re: /\b([A-Za-z_]\w*)\s*==\s*None\b/g, build: function(m,v){ return v + ' is None'; },
         reason: '判断是否为 None,官方推荐用 <code>is</code> 而不是 <code>==</code>(PEP 8)。',
         thinking: ['看到 x == None','PEP 8 建议:与 None 比较要用 is','改为 x is None']},
        {id:'neqNone', name:'与 None 比较用 is not',
         re: /\b([A-Za-z_]\w*)\s*!=\s*None\b/g, build: function(m,v){ return v + ' is not None'; },
         reason: '判断"不是 None",官方推荐写 <code>is not None</code>。',
         thinking: ['看到 x != None','改为 is not None','更符合 PEP 8']},
        {id:'len0', name:'空判断用 not',
         re: /\blen\(([A-Za-z_]\w*)\)\s*==\s*0/g, build: function(m,v){ return 'not ' + v; },
         reason: '空列表、空字符串、空字典在 Python 里都是"假",直接 <code>if not x:</code> 就行。',
         thinking: ['看到 len(x) == 0','空容器本身为假','替换为 not x,更 Pythonic']},
        {id:'lenN0', name:'非空判断直接写',
         re: /\blen\(([A-Za-z_]\w*)\)\s*!=\s*0/g, build: function(m,v){ return v; },
         reason: '<code>len(x) != 0</code> 就是"x 非空",直接写 <code>if x:</code> 即可。',
         thinking: ['看到 len(x) != 0','非空即真','直接写 x']},
        {id:'lenG0', name:'非空判断直接写',
         re: /\blen\(([A-Za-z_]\w*)\)\s*>\s*0/g, build: function(m,v){ return v; },
         reason: '<code>len(x) > 0</code> 等价于"x 非空",直接写 <code>if x:</code> 更简洁。',
         thinking: ['看到 len(x) > 0','等价于判断非空','直接写 x']},
        {id:'lenG1', name:'非空判断直接写',
         re: /\blen\(([A-Za-z_]\w*)\)\s*>=\s*1/g, build: function(m,v){ return v; },
         reason: '<code>len(x) >= 1</code> 也是"非空"的意思,直接 <code>if x:</code>。',
         thinking: ['看到 len(x) >= 1','等价于判断非空','直接写 x']}
      ],
      adv: [
        {id:'rangeLen', name:'range(len(...)) 可换成直接遍历',
         detect: function(code){ return /\bfor\s+\w+\s+in\s+range\s*\(\s*len\s*\(/.test(code); },
         exampleBefore: 'for i in range(len(nums)):\n    print(nums[i])',
         exampleAfter: 'for x in nums:\n    print(x)\n\n# 需要下标时:\nfor i, x in enumerate(nums):\n    print(i, x)',
         reason: '<code>for i in range(len(列表))</code> 再用 <code>列表[i]</code> 取值等于绕远路。直接 <code>for item in 列表:</code> 即可;需要下标用 <code>enumerate</code>。',
         thinking: ['看到 range(len(...)) 的下标遍历','其实只想拿元素,不必关心下标','改成直接遍历,或 enumerate']},
        {id:'appendLoop', name:'循环 append 可换成列表推导式',
         detect: function(code){ return /\w+\s*=\s*\[\s*\]/.test(code) && /\.append\(/.test(code); },
         exampleBefore: 'evens = []\nfor x in nums:\n    if x % 2 == 0:\n        evens.append(x)',
         exampleAfter: 'evens = [x for x in nums if x % 2 == 0]',
         reason: '先建空列表、再 for 循环 append 是典型的新手长写法,列表推导式可以一行搞定。',
         thinking: ['看到"空列表 + for + append"','这可以用列表推导式合并','改写成推导式,少几行且更清晰']},
        {id:'format', name:'字符串拼接可换成 f-string',
         detect: function(code){ return /\.format\(/.test(code) || /%\s*[sd]/.test(code) || /(["'])[^"']*\1\s*\+/.test(code); },
         exampleBefore: 'print("我叫" + name + ",今年" + str(age) + "岁")',
         exampleAfter: 'print(f"我叫{name},今年{age}岁")',
         reason: '用 <code>+</code>、<code>%</code> 或 <code>.format()</code> 拼字符串都容易出错又绕,Python 3.6+ 的 f-string 最直观。',
         thinking: ['发现字符串拼接/格式化','对比几种写法,f-string 最清晰','改用 f-string']},
        {id:'returnBool', name:'if 返回 True/False 可简化为直接 return',
         detect: function(code){ return /return\s+True/.test(code) && /return\s+False/.test(code); },
         exampleBefore: 'if n % 2 == 0:\n    return True\nelse:\n    return False',
         exampleAfter: 'return n % 2 == 0',
         reason: '<code>if 条件: return True else: return False</code> 本质就是在返回"条件"本身,直接 <code>return 条件</code>。',
         thinking: ['看到 if 返回 True/False 两分支','分支结果恰好等于条件本身','直接 return 条件']},
        {id:'unusedElse', name:'if 里已 return,后面的 else 可去掉',
         detect: function(code){ return /return[^\n]*\n[ \t]*else\s*:/.test(code); },
         exampleBefore: 'if x > 0:\n    return "正"\nelse:\n    return "非正"',
         exampleAfter: 'if x > 0:\n    return "正"\nreturn "非正"',
         reason: '如果 <code>if</code> 分支已经 <code>return</code>,后面的 <code>else</code> 就是多余的,去掉后更扁平。',
         thinking: ['发现 if 分支已 return','此时 else 不改变执行流','去掉 else,减少嵌套']}
      ],
      samples: {
        a: [
          'def is_even(n):',
          '    if n % 2 == 0:',
          '        return True',
          '    else:',
          '        return False',
          '',
          'nums = [1, 2, 3, 4]',
          'evens = []',
          'for i in range(len(nums)):',
          '    if nums[i] % 2 == 0:',
          '        evens.append(nums[i])',
          'print("偶数有" + str(evens))'
        ].join('\n'),
        b: [
          'name = "小明"',
          'age = 10',
          'print("我叫" + name + ",今年" + str(age) + "岁")',
          '',
          'if age == True:',
          '    print("年龄是真")',
          '',
          'scores = [90, 80, 70]',
          'if len(scores) > 0:',
          '    print("有分数")'
        ].join('\n'),
        c: [
          'items = []',
          'count = 0',
          'count = count + 1',
          '',
          'if len(items) == 0:',
          '    print("空列表")',
          '',
          'x = None',
          'if x == None:',
          '    print("没有值")',
          '',
          'flag = True',
          'if flag == False:',
          '    print("关")'
        ].join('\n')
      },
      learnSample: '# 欢迎使用 Python 代码逐行学习\n# 粘贴你的代码,点击「开始解释」\n\nname = input("请输入你的名字:")\nprint(f"你好,{name}!欢迎学习 Python!")\n\ntotal = 0\nfor i in range(1, 11):\n    total += i\n\nprint(f"1 到 10 的和是:{total}")',
      simplifySystem: [
        '你是一位耐心的 Python 老师,擅长把初学者写得啰嗦的代码改得简洁、地道(Pythonic)。',
        '',
        '任务:化简用户提供的 Python 代码。',
        '',
        '要求:',
        '1. 只做简化,必须保持功能、逻辑、输入输出完全不变,不要引入任何 bug,不要改变行为。',
        '2. 优先使用 Python 惯用写法:真值判断(truthiness)、增强赋值(+= 等)、列表/字典推导式、f-string、enumerate、直接遍历、提前返回(early return)、去掉冗余 else 等。',
        '3. 如果代码已经很简洁,就如实说明"已经很好了",不要强行改动。',
        '4. 用简体中文、通俗易懂地解释,面向编程初学者。',
        '',
        '必须只输出一个 JSON 对象(不要输出 JSON 以外的任何文字、不要用 markdown 代码块包裹),格式如下:',
        '{',
        '  "simplified_code": "化简后的完整代码(字符串,保留原有缩进和换行)",',
        '  "summary": "一句话概括这次改了什么",',
        '  "changes": [',
        '    {"before": "原写法片段", "after": "化简后的写法", "reason": "为什么这么改(通俗)", "thinking": "思考过程,分①②③步"}',
        '  ]',
        '}',
        '如果没有可化简之处,changes 返回空数组,summary 说明代码已经很好。'
      ].join('\n'),
      simplifyLead: '待化简的 Python 代码:',
      explainSystem: [
        '你是一位经验丰富、耐心细致的 Python 编程老师。你的任务是帮助初学者理解 Python 代码。',
        '',
        '请逐行解释用户提供的 Python 代码,要求:',
        '1. 为每一行代码标注行号,格式为「### 第 X 行」',
        '2. 在行号下方用 ```python 代码块 展示该行代码',
        '3. 用通俗易懂的语言解释这一行做了什么',
        '4. 如果涉及重要概念,用生活中的比喻帮助理解',
        '5. 如果是空行或注释,简要说明',
        '6. 解释完所有行后,用「### 整体总结」给出这段代码的整体功能概述',
        '7. 如果有重要的语法知识点,在总结中列出',
        '',
        '注意:解释要面向零基础学习者,避免使用专业术语,如果用了术语要解释清楚。'
      ].join('\n'),
      explainLead: '请逐行解释以下 Python 代码:',
      askTeacher: '你是一位经验丰富、耐心细致的 Python 编程老师'
    },

    /* =============================== C++ =============================== */
    cpp: {
      id:'cpp', name:'C++', tag:'C++', fence:'cpp',
      placeholderCode: '例如:\nif (x == true) {\n    cout << s.size() == 0;\n}',
      placeholderLearn: '// 在这里粘贴或输入 C++ 代码\n// 点击「开始解释」逐行学习',
      simplifySub: '本地规则化简和 AI 化简共用这个输入框(C++ 规则)',
      learnSub: 'AI 会逐行解释这段 C++ 代码,讲人话、打比方,零基础也能懂',
      cheatTitle: 'C++ 化简速查表',
      cheatSub: '初学者最常见的"可以更现代"的写法,记下来少走弯路',
      lineComment: '//',
      hlBlock: true,
      hl: buildHlRegex({
        block: '\\/\\*[\\s\\S]*?\\*\\/',
        line: '\\/\\/[^\\n]*',
        str: '"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'',
        pre: '^[ \\t]*#[ \\t]*\\w+[^\\n]*'
      }),
      kw: ('int long short char bool float double void auto const constexpr static unsigned signed struct class union enum '
        + 'public private protected virtual override final template typename namespace using new delete this return if else '
        + 'for while do switch case default break continue goto try catch throw true false nullptr NULL sizeof typedef inline '
        + 'friend extern mutable explicit operator main '
        + 'std string vector array map unordered_map set unordered_set pair tuple queue stack deque list cout cin cerr endl '
        + 'printf scanf malloc free memset to_string stoi stod getline ifstream ofstream fstream iostream sstream bits '
        + 'make_unique make_shared unique_ptr shared_ptr sort find begin end push_back emplace_back size empty resize substr '
        + 'strlen strcpy strcmp puts gets size_t move swap min max abs pow sqrt').split(' '),
      cheat: [
        ['if (x == true)', 'if (x)'],
        ['if (x == false)', 'if (!x)'],
        ['p == NULL', 'p == nullptr'],
        ['if (p != nullptr)', 'if (p)'],
        ['s.size() == 0', 's.empty()'],
        ['s.size() > 0', '!s.empty()'],
        ['x = x + 1', 'x += 1'],
        ['for (int i = 0; i < v.size(); i++)', 'for (const auto& x : v)'],
        ['printf("%d\\n", n)', 'std::cout << n << \'\\n\''],
        ['std::endl', "'\\n'"],
        ['using namespace std;', '显式写 std::'],
        ['int arr[10]', 'std::vector<int> 或 std::array'],
        ['new / delete', 'std::unique_ptr + std::make_unique'],
        ['if (c) return true; else return false;', 'return c;']
      ],
      auto: [
        {id:'aug', name:'复合赋值运算符(+= 等)',
         re: /\b([A-Za-z_]\w*)\s*=\s*\1\s*([+\-*/%])\s*([^;\n]+)/g,
         build: function(m,v,op,rhs){ return v + ' ' + op + '= ' + rhs.trim(); },
         reason: '<code>x = x + 1</code> 里 <code>x</code> 写了两遍,容易看错、也容易写错。C++ 的复合赋值 <code>x += 1</code> 含义完全一样,更简洁。',
         thinking: ['发现同一个变量出现在等号两边','确认 x = x op y 可写成 x op= y','改写后语义完全等价']},
        {id:'eqTrue', name:'去掉多余的 == true',
         re: /\b([A-Za-z_][\w.\[\]\-]*)\s*==\s*true\b/g, build: function(m,v){ return v; },
         reason: '<code>x == true</code> 里 <code>== true</code> 是多余的——<code>if (x)</code> 本身就在判断 x 是否为真。',
         thinking: ['看到 == true','布尔判断再加 == true 是重复表达','直接写 x 即可']},
        {id:'eqFalse', name:'用 ! 代替 == false',
         re: /\b([A-Za-z_][\w.\[\]\-]*)\s*==\s*false\b/g, build: function(m,v){ return '!' + v; },
         reason: '<code>x == false</code> 等价于 <code>!x</code>,用逻辑非表达更直接。',
         thinking: ['看到 == false','"等于假"就是"取反"','改为 !x']},
        {id:'neqTrue', name:'用 ! 代替 != true',
         re: /\b([A-Za-z_][\w.\[\]\-]*)\s*!=\s*true\b/g, build: function(m,v){ return '!' + v; },
         reason: '<code>x != true</code> 就是"x 不是真",直接写 <code>!x</code>。',
         thinking: ['看到 != true','等价于取反','改为 !x']},
        {id:'neqFalse', name:'去掉 != false',
         re: /\b([A-Za-z_][\w.\[\]\-]*)\s*!=\s*false\b/g, build: function(m,v){ return v; },
         reason: '<code>x != false</code> 等价于 <code>x</code>,直接写变量本身。',
         thinking: ['看到 != false','"不是假"等于"真"','直接写 x']},
        {id:'eqNull', name:'判空直接写变量(C++ 指针/布尔)',
         re: /\b([A-Za-z_][\w.\[\]\-]*)\s*==\s*(?:NULL|nullptr)\b/g, build: function(m,v){ return '!' + v; },
         reason: '在 <code>if</code> 条件里,<code>p == nullptr</code> 直接写 <code>!p</code> 更简洁(指针为空即为假)。',
         thinking: ['看到与 nullptr/NULL 比较','空指针在布尔上下文中为假','写成 !p']},
        {id:'neqNull', name:'非空判断直接写变量',
         re: /\b([A-Za-z_][\w.\[\]\-]*)\s*!=\s*(?:NULL|nullptr)\b/g, build: function(m,v){ return v; },
         reason: '<code>p != nullptr</code> 就是"p 不为空",直接写 <code>p</code> 即可。',
         thinking: ['看到 != nullptr','非空指针为真','直接写 p']},
        {id:'emptySize', name:'判空用 empty() 更直观',
         re: /\b([A-Za-z_][\w.]*)\.(?:size|length)\(\)\s*==\s*0\b/g, build: function(m,v){ return v + '.empty()'; },
         reason: '<code>s.size() == 0</code> 要读懂"长度为 0",而 <code>s.empty()</code> 一眼就知道是在判空,而且对链表这类容器效率也更好。',
         thinking: ['看到 size() == 0','意图是"判断容器是否为空"','改用 empty(),语义直白']},
        {id:'emptySizeNe', name:'非空判断用 !empty()',
         re: /\b([A-Za-z_][\w.]*)\.(?:size|length)\(\)\s*(?:!=|>)\s*0\b/g, build: function(m,v){ return '!' + v + '.empty()'; },
         reason: '<code>s.size() != 0</code> 或 <code>> 0</code> 都是在说"不空",写 <code>!s.empty()</code> 更清楚。',
         thinking: ['看到 size() != 0 或 > 0','意图是"容器非空"','改用 !s.empty()']}
      ],
      adv: [
        {id:'rangeFor', name:'下标 for 循环可换成范围 for',
         detect: function(code){ return /for\s*\(\s*(?:int|size_t|unsigned|long)\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*\w+(?:\.size\(\)|\.length\(\)|\[\s*\d+\s*\])?\s*;/.test(code); },
         exampleBefore: 'for (int i = 0; i < nums.size(); i++) {\n    cout << nums[i] << "\\n";\n}',
         exampleAfter: 'for (const auto& x : nums) {\n    cout << x << "\\n";\n}\n\n// 需要下标时:\nfor (size_t i = 0; i < nums.size(); i++) {\n    cout << i << " " << nums[i] << "\\n";\n}',
         reason: 'C++11 起可以直接"遍历容器里的每个元素",不用再写下标 <code>i</code>、也不用 <code>v[i]</code> 取值,更不容易越界。',
         thinking: ['看到 for (int i = 0; i < v.size(); i++)','循环体里其实只用到元素本身','换成范围 for(const auto& x : v)']},
        {id:'printfToCout', name:'printf/scanf 可换成 cin/cout(或格式化库)',
         detect: function(code){ return /\bprintf\s*\(|\bscanf\s*\(/.test(code); },
         exampleBefore: 'printf("总分:%d\\n", total);\nscanf("%d", &n);',
         exampleAfter: 'std::cout << "总分:" << total << \'\\n\';\nstd::cin >> n;',
         reason: '<code>printf</code> 要手写格式符 <code>%d</code>,写错类型编译器不报错、运行时才出错;而 <code>cout</code>/<code>cin</code> 会自动识别类型,更安全。',
         thinking: ['看到 printf/scanf','它们的格式符与参数类型容易对不上','改用 cout/cin,类型自动匹配']},
        {id:'endlToNewline', name:'std::endl 可换成 \'\\n\'',
         detect: function(code){ return /std::endl|<<\s*endl\b/.test(code); },
         exampleBefore: 'cout << "hello" << std::endl;',
         exampleAfter: 'cout << "hello" << \'\\n\';',
         reason: '<code>std::endl</code> 除了换行还会强制刷新缓冲区,循环里用会明显变慢。只想要换行就写 <code>\'\\n\'</code>。',
         thinking: ['看到 std::endl','它 = 换行 + 刷新缓冲','只需换行时用 \'\\n\',性能更好']},
        {id:'returnBool', name:'if 返回 true/false 可直接 return 条件',
         detect: function(code){ return /return\s+true/.test(code) && /return\s+false/.test(code); },
         exampleBefore: 'if (n % 2 == 0) {\n    return true;\n} else {\n    return false;\n}',
         exampleAfter: 'return n % 2 == 0;',
         reason: '<code>if 条件: return true; else: return false;</code> 本质就是在返回"这个条件"本身,直接 <code>return 条件;</code>。',
         thinking: ['看到 if/else 两个分支只返回 true 和 false','返回值恰好等于条件表达式','直接 return 条件']},
        {id:'rawPointer', name:'裸 new/delete 可换成智能指针',
         detect: function(code){ return /\bnew\s+[A-Za-z_]\w*/.test(code) && /\bdelete\b/.test(code); },
         exampleBefore: 'int* p = new int(5);\n// ... 用完后\n delete p;',
         exampleAfter: '#include <memory>\nauto p = std::make_unique<int>(5);\n// 离开作用域自动释放,不用手写 delete',
         reason: '手动 <code>new</code>/<code>delete</code> 一旦忘记释放就内存泄漏,提前 return 或抛异常时还可能漏掉。<code>unique_ptr</code> 会在作用域结束时自动释放。',
         thinking: ['看到 new 配 delete','手动管理生命周期容易漏','换成 make_unique/unique_ptr 自动管理']},
        {id:'usingNamespace', name:'尽量不用 using namespace std;',
         detect: function(code){ return /using\s+namespace\s+std\s*;/.test(code); },
         exampleBefore: 'using namespace std;\ncout << "hi";',
         exampleAfter: 'std::cout << "hi";\n\n// 嫌长可以只引入需要的名字:\nusing std::cout;',
         reason: '<code>using namespace std;</code> 会把整个标准库的名字倒进全局空间,同名函数容易冲突(比如 <code>count</code>、<code>size</code>),在头文件里写更会污染别的文件。练习小代码无所谓,但早点养成显式写 <code>std::</code> 的习惯更好。',
         thinking: ['看到 using namespace std','它把所有标准库名字放入全局','改成显式 std:: 或只 using 单个名字']},
        {id:'cArray', name:'C 风格数组可换成 std::vector / std::array',
         detect: function(code){ return /\b(?:int|double|float|char|long|bool)\s+\w+\s*\[\s*\d*\s*\]/.test(code); },
         exampleBefore: 'int nums[4] = {1, 2, 3, 4};\nfor (int i = 0; i < 4; i++) { cout << nums[i]; }',
         exampleAfter: 'std::vector<int> nums = {1, 2, 3, 4};\nfor (const auto& x : nums) { std::cout << x; }',
         reason: 'C 风格数组不会记住自己的长度,长度写错就静默越界(可能看似正常运行,其实是未定义行为)。<code>vector</code> 自带 <code>size()</code>,还能动态增长。',
         thinking: ['看到固定长度数组','长度要自己记、自己传','换成 vector/array,自带长度更安全']},
        {id:'cString', name:'C 风格字符串可换成 std::string',
         detect: function(code){ return /\bchar\s*\*|\bchar\s+\w+\s*\[|\bstrlen\s*\(|\bstrcpy\s*\(|\bstrcmp\s*\(/.test(code); },
         exampleBefore: 'char name[20] = "Tom";\nint n = strlen(name);',
         exampleAfter: 'std::string name = "Tom";\nint n = name.size();',
         reason: '<code>char*</code>/<code>char[]</code> 要手动管长度和内存,拼接还可能溢出。<code>std::string</code> 能自动扩容、支持 <code>+</code> 和 <code>==</code>,写起来和 Python 的字符串一样省心。',
         thinking: ['看到 char*/strlen/strcpy','C 风格字符串需要手工管理长度','换成 std::string,更安全直观']}
      ],
      samples: {
        a: [
          '#include <iostream>',
          '#include <string>',
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
          '    string name = "小明";',
          '    int age = 10;',
          '    cout << "我叫" + name + ",今年" + to_string(age) + "岁" << endl;',
          '',
          '    int nums[4] = {1, 2, 3, 4};',
          '    for (int i = 0; i < 4; i++) {',
          '        if (isEven(nums[i]) == true) {',
          '            cout << nums[i] << endl;',
          '        }',
          '    }',
          '    return 0;',
          '}'
        ].join('\n'),
        b: [
          '#include <iostream>',
          '#include <vector>',
          'using namespace std;',
          '',
          'int main() {',
          '    vector<int> scores = {90, 80, 70};',
          '    int count = 0;',
          '    count = count + 1;',
          '',
          '    if (scores.size() > 0) {',
          '        cout << "有分数" << endl;',
          '    }',
          '',
          '    if (scores.size() == 0) {',
          '        cout << "没有分数" << endl;',
          '    }',
          '',
          '    bool ok = true;',
          '    if (ok == false) {',
          '        cout << "不通过" << endl;',
          '    }',
          '    return 0;',
          '}'
        ].join('\n'),
        c: [
          '#include <iostream>',
          '#include <string>',
          'using namespace std;',
          '',
          'int main() {',
          '    string msg = "";',
          '    if (msg.size() == 0) {',
          '        cout << "空字符串" << endl;',
          '    }',
          '',
          '    int* p = NULL;',
          '    if (p == NULL) {',
          '        cout << "空指针" << endl;',
          '    }',
          '',
          '    int count = 0;',
          '    count = count + 1;',
          '    for (int i = 0; i < 10; i++) {',
          '        count = count + i;',
          '    }',
          '    cout << count << endl;',
          '    return 0;',
          '}'
        ].join('\n')
      },
      learnSample: '// 欢迎使用 C++ 代码逐行学习\n// 粘贴你的代码,点击「开始解释」\n\n#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> nums = {1, 2, 3, 4, 5};\n    int total = 0;\n\n    for (int i = 0; i < nums.size(); i++) {\n        total += nums[i];\n    }\n\n    std::cout << "总和是:" << total << \'\\n\';\n    return 0;\n}',
      simplifySystem: [
        '你是一位耐心的 C++ 老师,擅长把初学者写得啰嗦的代码改得简洁、现代(C++11 及以上风格)。',
        '',
        '任务:化简用户提供的 C++ 代码。',
        '',
        '要求:',
        '1. 只做简化,必须保持功能、逻辑、输入输出完全不变,不要引入任何 bug,不要改变行为(包括不要改变循环边界、类型宽度、求值顺序)。',
        '2. 优先使用现代 C++ 惯用写法:nullptr 代替 NULL、范围 for 循环(range-based for)、auto、复合赋值(+=)、s.empty() 代替 s.size() == 0、\'\\n\' 代替 std::endl、const 引用传参、emplace_back、std::vector/std::string 代替裸数组与 C 风格字符串、std::unique_ptr/std::shared_ptr 代替裸 new/delete、去掉冗余 else、避免 using namespace std。',
        '3. 保持原有的 #include、命名空间、函数签名与返回值类型不变(除非化简必须调整)。',
        '4. 如果代码已经很简洁,就如实说明"已经很好了",不要强行改动。',
        '5. 用简体中文、通俗易懂地解释,面向编程初学者。',
        '',
        '必须只输出一个 JSON 对象(不要输出 JSON 以外的任何文字、不要用 markdown 代码块包裹),格式如下:',
        '{',
        '  "simplified_code": "化简后的完整代码(字符串,保留原有缩进和换行)",',
        '  "summary": "一句话概括这次改了什么",',
        '  "changes": [',
        '    {"before": "原写法片段", "after": "化简后的写法", "reason": "为什么这么改(通俗)", "thinking": "思考过程,分①②③步"}',
        '  ]',
        '}',
        '如果没有可化简之处,changes 返回空数组,summary 说明代码已经很好。'
      ].join('\n'),
      simplifyLead: '待化简的 C++ 代码:',
      explainSystem: [
        '你是一位经验丰富、耐心细致的 C++ 编程老师。你的任务是帮助初学者理解 C++ 代码。',
        '',
        '请逐行解释用户提供的 C++ 代码,要求:',
        '1. 为每一行代码标注行号,格式为「### 第 X 行」',
        '2. 在行号下方用 ```cpp 代码块 展示该行代码',
        '3. 用通俗易懂的语言解释这一行做了什么',
        '4. 如果涉及重要概念,用生活中的比喻帮助理解',
        '5. 遇到 C++ 特有的东西要顺带讲清楚:头文件 #include、命名空间 std、语句末尾的分号、花括号作用域、类型声明、编译运行方式等',
        '6. 如果是空行或注释,简要说明',
        '7. 解释完所有行后,用「### 整体总结」给出这段代码的整体功能概述',
        '8. 如果有重要的语法知识点,在总结中列出',
        '',
        '注意:解释要面向零基础学习者,避免使用专业术语,如果用了术语要解释清楚。'
      ].join('\n'),
      explainLead: '请逐行解释以下 C++ 代码:',
      askTeacher: '你是一位经验丰富、耐心细致的 C++ 编程老师'
    }
  };

  function langConf(){ return LANGS[LANG] || LANGS.python; }
  function otherLangSamples(){
    var out = [];
    for(var k in LANGS){
      if(!LANGS.hasOwnProperty(k)) continue;
      var s = LANGS[k].samples;
      out.push(LANGS[k].learnSample);
      for(var key in s){ if(s.hasOwnProperty(key)) out.push(s[key]); }
    }
    return out;
  }

  /* 简易语言识别:只在特征明显时给出结论,否则返回 null */
  function detectLang(code){
    if(!code || !code.trim()) return null;
    var cpp = 0, py = 0;
    if(/#include\s*[<"]/.test(code)) cpp += 4;
    if(/\bint\s+main\s*\(/.test(code)) cpp += 4;
    if(/\bstd::|\b(cout|cin|endl|printf|scanf|nullptr)\b/.test(code)) cpp += 3;
    if(/\b(using\s+namespace|#define|#pragma)\b/.test(code)) cpp += 2;
    if(/->|::/.test(code)) cpp += 1;
    if(/\b(vector|string|map|pair)\s*</.test(code)) cpp += 2;
    if(/\)\s*\{/.test(code) && /;\s*$/m.test(code)) cpp += 2;
    if(/\b(int|void|double|float|char|bool|long)\s+\w+\s*[=;(\[]/.test(code)) cpp += 1;
    if(/;\s*$/m.test(code)) cpp += 1;

    if(/^\s*def\s+\w+\s*\(.*\)\s*:/m.test(code)) py += 4;
    if(/\belif\b/.test(code)) py += 4;
    if(/\b(True|False|None)\b/.test(code)) py += 2;
    if(/\bprint\s*\(/.test(code)) py += 2;
    if(/\bimport\s+[A-Za-z_]/.test(code)) py += 2;
    if(/\bf["']/.test(code)) py += 2;
    if(/^\s*(#|""")/m.test(code)) py += 1;
    if(/:\s*$/m.test(code)) py += 1;

    if(cpp > py + 1) return 'cpp';
    if(py > cpp + 1) return 'python';
    return null;
  }

  /* ============================================================
   * 代码高亮(按当前语言)
   * ============================================================ */
  var kwCache = {};
  function kwSet(langId){
    if(!kwCache[langId]){
      var o = {};
      LANGS[langId].kw.forEach(function(k){ o[k] = true; });
      kwCache[langId] = o;
    }
    return kwCache[langId];
  }

  function highlightCode(code, dark){
    code = String(code == null ? '' : code);
    var c = langConf();
    var set = kwSet(c.id);
    var re = c.hl;
    re.lastIndex = 0;
    var out = '', last = 0, m;
    function cls(name){ return ' class="tok-' + name + (dark ? '-dark' : '') + '"'; }
    while((m = re.exec(code)) !== null){
      if(m[0] === ''){ re.lastIndex++; continue; }
      if(m.index > last){ out += escapeHtml(code.slice(last, m.index)); }
      var text = m[0];
      if(m[1] !== undefined){ out += '<span' + cls('com') + '>' + escapeHtml(text) + '</span>'; }
      else if(m[2] !== undefined){ out += '<span' + cls('com') + '>' + escapeHtml(text) + '</span>'; }
      else if(m[3] !== undefined){ out += '<span' + cls('str') + '>' + escapeHtml(text) + '</span>'; }
      else if(m[4] !== undefined){ out += '<span' + cls('pre') + '>' + escapeHtml(text) + '</span>'; }
      else if(m[5] !== undefined){
        out += set[text] ? '<span' + cls('kw') + '>' + escapeHtml(text) + '</span>' : escapeHtml(text);
      }
      else if(m[6] !== undefined){ out += '<span' + cls('num') + '>' + escapeHtml(text) + '</span>'; }
      else{ out += escapeHtml(text); }
      last = m.index + text.length;
    }
    out += escapeHtml(code.slice(last));
    return out;
  }
  function highlight(code){ return highlightCode(code, false); }
  function highlightDark(code){ return highlightCode(code, true); }

  function renderCheatTable(){
    var tb = $('cheatBody');
    if(!tb) return;
    tb.innerHTML = langConf().cheat.map(function(row){
      return '<tr><td><code class="bad">' + escapeHtml(row[0]) + '</code></td>'
        + '<td><span class="arr">&rarr;</span> <code class="good">' + escapeHtml(row[1]) + '</code></td></tr>';
    }).join('');
  }

  function applyLangUI(){
    var c = langConf();
    if($('langTitle')) $('langTitle').textContent = c.name;
    root.querySelectorAll('.lang-btn').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-lang') === LANG);
    });
    if($('code')) $('code').setAttribute('placeholder', c.placeholderCode);
    if($('learnCode')) $('learnCode').setAttribute('placeholder', c.placeholderLearn);
    if($('simplifySub')) $('simplifySub').textContent = c.simplifySub;
    if($('learnSub')) $('learnSub').textContent = c.learnSub;
    if($('cheatTitle')) $('cheatTitle').textContent = c.cheatTitle;
    if($('cheatSub')) $('cheatSub').textContent = c.cheatSub;
    renderCheatTable();
  }

  /* 切换语言:代码框里还是示例/空的话,顺手换成新语言的示例,避免"语言对不上" */
  function switchLang(id, silent){
    if(!LANGS[id] || id === LANG) return;
    var others = otherLangSamples();
    LANG = id;
    try{ localStorage.setItem(LANG_KEY, id); }catch(e){}
    applyLangUI();
    var code = $('code');
    if(code && (code.value.trim() === '' || others.indexOf(code.value) !== -1)){
      code.value = langConf().samples.a;
    }
    var lc = $('learnCode');
    if(lc && (lc.value.trim() === '' || others.indexOf(lc.value) !== -1)){
      lc.value = langConf().learnSample;
      updateLineNumbers();
    }
    if(!silent){ showToast('已切换到 ' + langConf().name + ' 模式'); }
  }

  /* 粘贴时自动识别语言:只在识别出的语言与当前不同、且特征明显时才切换 */
  function autoDetectOnPaste(el){
    el.addEventListener('paste', function(e){
      var pasted = '';
      try{ if(e && e.clipboardData){ pasted = e.clipboardData.getData('text') || ''; } }catch(err){}
      function decide(text){
        var guess = detectLang(text);
        if(guess && guess !== LANG){
          switchLang(guess, true);
          showToast('检测到 ' + LANGS[guess].name + ' 代码,已自动切换语言');
        }
      }
      if(pasted){ decide(pasted); }
      else{ setTimeout(function(){ decide(el.value); }, 30); }
    });
  }
  /* ============================================================
   * 化简页:本地规则引擎(规则按当前语言选取)
   * ============================================================ */
  /* 把一行拆成「代码片段」与「字符串/注释片段」,规则只作用于代码片段,
     避免把字符串或注释里的 == true 之类也一起改掉 */
  function splitCodeSegments(line, c){
    var segs = [], buf = '', i = 0, n = line.length;
    function flushCode(){ if(buf){ segs.push({text:buf, code:true}); buf = ''; } }
    while(i < n){
      /* 块注释(如 C++ 的 斜杠星号 ... 星号斜杠) */
      if(c.hlBlock && line.substr(i, 2) === '/*'){
        flushCode();
        var endB = line.indexOf('*/', i + 2);
        var stopB = (endB === -1) ? n : endB + 2;
        segs.push({text:line.slice(i, stopB), code:false});
        i = stopB;
        continue;
      }
      /* 行注释(如 # 或 //) */
      if(line.substr(i, c.lineComment.length) === c.lineComment){
        flushCode();
        segs.push({text:line.slice(i), code:false});
        i = n;
        continue;
      }
      /* 字符串 / 字符字面量(含转义) */
      if(line.charAt(i) === '"' || line.charAt(i) === "'"){
        flushCode();
        var q = line.charAt(i), j = i + 1;
        while(j < n){
          if(line.charAt(j) === '\\'){ j += 2; continue; }
          if(line.charAt(j) === q){ j++; break; }
          j++;
        }
        var stopS = Math.min(j, n);
        segs.push({text:line.slice(i, stopS), code:false});
        i = stopS;
        continue;
      }
      buf += line.charAt(i);
      i++;
    }
    flushCode();
    return segs;
  }

  function analyzeLocal(code){
    var c = langConf();
    var lines = code.replace(/\r\n/g,'\n').split('\n');
    var auto = [], simplifiedLines = [];
    lines.forEach(function(line){
      var segs = splitCodeSegments(line, c);
      var outLine = '';
      segs.forEach(function(seg){
        if(!seg.code){ outLine += seg.text; return; }
        var cur = seg.text;
        c.auto.forEach(function(rule){
          rule.re.lastIndex = 0;
          cur = cur.replace(rule.re, function(m, p1, p2, p3){
            var replaced = rule.build(m, p1, p2, p3);
            if(replaced !== m){ auto.push({rule:rule, original:m.trim(), replaced:replaced.trim()}); }
            return replaced;
          });
        });
        outLine += cur;
      });
      simplifiedLines.push(outLine);
    });
    var simplified = simplifiedLines.join('\n');
    var adv = c.adv.filter(function(r){ return r.detect(code); });
    return {auto:auto, adv:adv, simplified:simplified};
  }

  function renderLocal(data){
    var container = $('result');
    var empty = $('emptyState');
    var total = data.auto.length + data.adv.length;
    if(total === 0){ empty.style.display='block'; container.style.display='none'; return; }
    empty.style.display='none'; container.style.display='block';
    var html = '';
    html += '<div class="summary">';
    html += '<div class="stat"><div class="num">'+total+'</div><div class="label">发现可化简处</div></div>';
    html += '<div class="stat"><div class="num" style="color:var(--cl-good)">'+data.auto.length+'</div><div class="label">已自动改写</div></div>';
    html += '<div class="stat"><div class="num" style="color:var(--cl-amber)">'+data.adv.length+'</div><div class="label">进阶建议</div></div>';
    html += '</div>';
    var idx = 0;
    if(data.auto.length){
      html += '<div class="section-title"><span class="badge-dot" style="background:var(--cl-good)"></span>已自动改写(语义完全等价)</div>';
      data.auto.forEach(function(it){
        idx++;
        html += '<div class="issue"><div class="head"><span class="tag auto">自动化简</span><span class="title">'+escapeHtml(it.rule.name)+'</span><span class="no">#'+idx+'</span></div>';
        html += '<div class="cmp"><div class="box before"><div class="lab">原写法</div><pre>'+highlight(it.original)+'</pre></div>';
        html += '<div class="box after"><div class="lab">化简后</div><pre>'+highlight(it.replaced)+'</pre></div></div>';
        html += '<div class="why"><b>为什么:</b> '+it.rule.reason+'</div>';
        html += '<div class="thinking">';
        it.rule.thinking.forEach(function(s,i){ html += '<div class="step"><span class="n">'+(i+1)+'.</span><span>'+escapeHtml(s)+'</span></div>'; });
        html += '</div></div>';
      });
    }
    if(data.adv.length){
      html += '<div class="section-title"><span class="badge-dot" style="background:var(--cl-amber)"></span>进阶学习建议(理解后可手动改写)</div>';
      data.adv.forEach(function(r){
        idx++;
        html += '<div class="issue"><div class="head"><span class="tag adv">学习建议</span><span class="title">'+escapeHtml(r.name)+'</span><span class="no">#'+idx+'</span></div>';
        html += '<div class="cmp"><div class="box before"><div class="lab">常见长写法</div><pre>'+highlight(r.exampleBefore)+'</pre></div>';
        html += '<div class="box after"><div class="lab">建议改成</div><pre>'+highlight(r.exampleAfter)+'</pre></div></div>';
        html += '<div class="why"><b>为什么:</b> '+r.reason+'</div>';
        html += '<div class="thinking">';
        r.thinking.forEach(function(s,i){ html += '<div class="step"><span class="n">'+(i+1)+'.</span><span>'+escapeHtml(s)+'</span></div>'; });
        html += '</div></div>';
      });
    }
    html += '<div class="section-title"><span class="badge-dot" style="background:var(--cl-primary)"></span>化简后的完整代码</div>';
    html += '<div class="result-code"><button class="copy-btn" data-copy="local">复制</button><pre>'+highlight(data.simplified)+'</pre></div>';
    if(data.adv.length){ html += '<div class="note">提示:完整代码只应用了"自动改写";"进阶建议"涉及多行结构,请理解后手动调整。想深入理解某个写法?切到「代码学习」页让 AI 逐行讲给你听。</div>'; }
    container.innerHTML = html;
  }

  /* ===== 化简页:AI 化简(提示词按当前语言生成) ===== */
  function parseModelResponse(text){
    if(!text) return null;
    var t = text.trim();
    t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '');
    var s = t.indexOf('{'), e = t.lastIndexOf('}');
    if(s !== -1 && e !== -1 && e > s){ t = t.slice(s, e + 1); }
    try{ return JSON.parse(t); }catch(err){ return null; }
  }

  function renderAi(data){
    data = data || {};
    var container = $('aiResult');
    var empty = $('aiEmpty');
    empty.style.display='none'; container.style.display='block';
    var html = '';
    if(data.summary){
      html += '<div class="ai-summary"><b>小结:</b> '+escapeHtml(data.summary)+'</div>';
    }
    if(data.simplified_code){
      html += '<div class="section-title"><span class="badge-dot" style="background:var(--cl-amber)"></span>AI 化简后的代码</div>';
      html += '<div class="result-code"><button class="copy-btn" data-copy="ai">复制</button><pre>'+highlightDark(data.simplified_code)+'</pre></div>';
    }
    var changes = Array.isArray(data.changes) ? data.changes : [];
    if(changes.length){
      html += '<div class="section-title" style="margin-top:16px"><span class="badge-dot" style="background:var(--cl-primary)"></span>逐条改动与思考</div>';
      changes.forEach(function(c, i){
        html += '<div class="issue"><div class="head"><span class="tag ai">AI 改动</span><span class="no">#'+(i+1)+'</span></div>';
        html += '<div class="cmp"><div class="box before"><div class="lab">原写法</div><pre>'+highlight(c.before || '')+'</pre></div>';
        html += '<div class="box after"><div class="lab">化简后</div><pre>'+highlight(c.after || '')+'</pre></div></div>';
        if(c.reason){ html += '<div class="why"><b>为什么:</b> '+escapeHtml(c.reason)+'</div>'; }
        if(c.thinking){ html += '<div class="thinking"><div class="step"><span class="n">&middot;</span><span>'+escapeHtml(c.thinking)+'</span></div></div>'; }
        html += '</div>';
      });
    }
    container.innerHTML = html;
  }

  function setBusy(btn, busy, text){
    if(busy){ btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'+text; }
    else{ btn.disabled = false; }
  }

  $('aiBtn').addEventListener('click', function(){
    var code = $('code').value;
    $('aiConfigMsg').innerHTML = '';
    if(!code.trim()){
      $('aiEmpty').style.display='block';
      $('aiEmpty').innerHTML = '<span class="big">&#129488;</span>先在左侧输入框粘贴代码,再点 AI 化简';
      $('aiResult').style.display='none';
      return;
    }
    if(!settings.apiKey){
      $('aiConfigMsg').innerHTML = '<div class="err">还没有配置 API Key。请点上方「去设置」完成配置(国内平台大多有免费额度)。</div>';
      return;
    }
    var lc = langConf();
    var btn = $('aiBtn');
    setBusy(btn, true, '化简中…');
    callLLM([
      {role:'system', content: lc.simplifySystem},
      {role:'user', content: lc.simplifyLead + '\n```' + lc.fence + '\n' + code + '\n```'}
    ], {
      onDone:function(text){
        setBusy(btn, false); btn.textContent = '用大模型化简左侧代码';
        var parsed = parseModelResponse(text);
        if(!parsed){
          $('aiConfigMsg').innerHTML = '<div class="err">模型返回的内容不是有效 JSON,可能没按格式回答,请重试一次。</div>';
          return;
        }
        renderAi({
          simplified_code: parsed.simplified_code || '',
          summary: parsed.summary || '',
          changes: parsed.changes || []
        });
      },
      onError:function(e){
        setBusy(btn, false); btn.textContent = '用大模型化简左侧代码';
        $('aiConfigMsg').innerHTML = '<div class="err">' + escapeHtml(e) + '</div>';
      }
    });
  });

  /* ===== 化简页:本地规则按钮 ===== */
  $('runBtn').addEventListener('click', function(){
    var code = $('code').value;
    if(!code.trim()){
      $('emptyState').style.display='block';
      $('emptyState').innerHTML = '<span class="big">&#128218;</span>先粘贴点代码再点化简哦';
      $('result').style.display='none';
      return;
    }
    renderLocal(analyzeLocal(code));
  });
  $('clearBtn').addEventListener('click', function(){
    $('code').value='';
    $('emptyState').style.display='block';
    $('emptyState').innerHTML = '<span class="big">&#128218;</span>本地规则化简结果会显示在这里';
    $('result').style.display='none';
  });
  root.querySelectorAll('.samples button').forEach(function(btn){
    btn.addEventListener('click', function(){
      $('code').value = langConf().samples[btn.getAttribute('data-sample')];
      showToast('示例已载入,点「本地规则化简」或「用大模型化简」试试');
    });
  });

  /* ============================================================
   * 学习页:逐行解释 + 追问 + 历史
   * ============================================================ */
  var isExplaining = false;
  var isAsking = false;

  function updateLineNumbers(){
    var code = $('learnCode').value;
    var n = code.split('\n').length;
    var nums = [];
    for(var i=1; i<=n; i++){ nums.push(i); }
    $('lineNumbers').innerHTML = nums.join('<br>');
  }
  $('learnCode').addEventListener('input', updateLineNumbers);
  $('learnCode').addEventListener('scroll', function(){ $('lineNumbers').scrollTop = this.scrollTop; });

  /* 简易 Markdown 渲染(先抽走代码块,再做行内格式化,最后还原) */
  function renderMarkdown(text){
    var codeBlocks = [];
    text = String(text == null ? '' : text).replace(/```(\w*)\n?([\s\S]*?)```/g, function(m, lang, code){
      var i = codeBlocks.length;
      codeBlocks.push('<pre class="md-pre"><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>');
      return '\u0000CB' + i + '\u0000';
    });
    var html = escapeHtml(text);
    html = html.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^### (.+)$/gm, '<div class="md-h3">$1</div>');
    html = html.replace(/^## (.+)$/gm, '<div class="md-h2">$1</div>');
    html = html.replace(/^# (.+)$/gm, '<div class="md-h1">$1</div>');
    html = html.replace(/^(\s*)- (.+)$/gm, '<div class="md-li">&bull; $2</div>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/\u0000CB(\d+)\u0000/g, function(m, i){ return codeBlocks[+i]; });
    return html;
  }

  function explainCode(){
    if(isExplaining) return;
    var code = $('learnCode').value.trim();
    if(!code){ showToast('请先输入 ' + langConf().name + ' 代码', 'error'); return; }
    if(!settings.apiKey){
      showToast('请先到「设置」页配置 API Key', 'error');
      showTab('settings');
      return;
    }

    isExplaining = true;
    var btn = $('explainBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>解释中…';

    var content = $('explainContent');
    content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--cl-muted)"><span class="loading-dots"><span></span><span></span><span></span></span> AI 正在逐行分析代码…</div>';

    var fullText = '';
    var lc = langConf();
    callLLM([
      {role:'system', content: lc.explainSystem},
      {role:'user', content: lc.explainLead + '\n\n```' + lc.fence + '\n' + code + '\n```'}
    ], {
      stream:true,
      onChunk:function(chunk, full){
        fullText = full;
        content.innerHTML = renderMarkdown(fullText) + '<span class="stream-cursor"></span>';
        content.scrollTop = content.scrollHeight;
      },
      onDone:function(full){
        isExplaining = false;
        btn.disabled = false; btn.textContent = '开始解释';
        if(full){ content.innerHTML = renderMarkdown(full); saveHistoryItem(code, full); }
        content.scrollTop = content.scrollHeight;
      },
      onError:function(e){
        isExplaining = false;
        btn.disabled = false; btn.textContent = '开始解释';
        content.innerHTML = '<div class="err">' + escapeHtml(e) + '</div>';
      }
    });
  }
  $('explainBtn').addEventListener('click', explainCode);

  $('clearLearnBtn').addEventListener('click', function(){
    $('learnCode').value = '';
    updateLineNumbers();
    showToast('代码已清空');
  });
  $('loadLearnSample').addEventListener('click', function(){
    $('learnCode').value = langConf().learnSample;
    updateLineNumbers();
    showToast('已载入 ' + langConf().name + ' 示例,点「开始解释」试试');
  });

  /* ===== 追问 ===== */
  function askQuestion(){
    if(isAsking) return;
    var lineNum = $('qaLineNum').value.trim();
    var question = $('qaQuestion').value.trim();
    var code = $('learnCode').value.trim();

    if(!code){ showToast('请先输入代码', 'error'); return; }
    if(!lineNum){ showToast('请输入行号', 'error'); return; }
    if(!question){ showToast('请输入你的问题', 'error'); return; }
    if(!settings.apiKey){ showToast('请先到「设置」页配置 API Key', 'error'); showTab('settings'); return; }

    var lines = code.split('\n');
    var lineIdx = parseInt(lineNum, 10) - 1;
    if(lineIdx < 0 || lineIdx >= lines.length){
      showToast('行号超出范围,共 ' + lines.length + ' 行', 'error');
      return;
    }
    var targetLine = lines[lineIdx];

    isAsking = true;
    var btn = $('askBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>回答中…';

    var qaContent = $('qaContent');
    var emptyEl = qaContent.querySelector('.empty');
    if(emptyEl){ qaContent.innerHTML = ''; }

    var msgDiv = document.createElement('div');
    msgDiv.className = 'qa-message';
    msgDiv.innerHTML = '<div class="qa-q"><div class="qa-q-badge">Q</div>'
      + '<div class="qa-q-text">第 <strong>' + escapeHtml(lineNum) + '</strong> 行:' + escapeHtml(question) + '</div></div>'
      + '<div class="qa-a"><span class="loading-dots"><span></span><span></span><span></span></span> AI 思考中…</div>';
    qaContent.appendChild(msgDiv);
    qaContent.scrollTop = qaContent.scrollHeight;
    var answerDiv = msgDiv.querySelector('.qa-a');

    var lc = langConf();
    var sys = lc.askTeacher + '。学生正在学习 ' + lc.name + ' 代码,对第 ' + lineNum + ' 行代码有疑问。\n\n请用通俗易懂的语言详细解答学生的问题。要求:\n1. 如果涉及编程概念,请用生活中的例子来比喻\n2. 解释要具体,不要泛泛而谈\n3. 如果问题涉及其他行的代码,也一起解释关联关系\n4. 如果适当,可以给出代码示例帮助理解\n5. 面向零基础学习者,避免使用专业术语,如果用了术语要解释清楚';

    var contextLines = [];
    var start = Math.max(0, lineIdx - 2);
    var end = Math.min(lines.length, lineIdx + 3);
    for(var i = start; i < end; i++){
      var prefix = (i === lineIdx) ? ' >>> ' : '     ';
      contextLines.push(prefix + (i + 1) + ': ' + lines[i]);
    }
    var user = '完整代码上下文(>>> 标记的是第 ' + lineNum + ' 行):\n```\n' + contextLines.join('\n') + '\n```\n\n第 ' + lineNum + ' 行代码是:\n```\n' + targetLine + '\n```\n\n我的问题是:' + question;

    callLLM([
      {role:'system', content: sys},
      {role:'user', content: user}
    ], {
      stream:true,
      onChunk:function(chunk, full){
        answerDiv.innerHTML = renderMarkdown(full) + '<span class="stream-cursor"></span>';
        qaContent.scrollTop = qaContent.scrollHeight;
      },
      onDone:function(full){
        isAsking = false;
        btn.disabled = false; btn.textContent = '提问';
        if(full){ answerDiv.innerHTML = renderMarkdown(full); }
        qaContent.scrollTop = qaContent.scrollHeight;
      },
      onError:function(e){
        isAsking = false;
        btn.disabled = false; btn.textContent = '提问';
        answerDiv.innerHTML = '<div class="err">' + escapeHtml(e) + '</div>';
      }
    });
  }
  $('askBtn').addEventListener('click', askQuestion);
  $('qaQuestion').addEventListener('keydown', function(e){ if(e.key === 'Enter') askQuestion(); });

  /* ===== 学习历史 ===== */
  var historyList = [];

  function loadHistory(){
    try{ historyList = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }catch(e){ historyList = []; }
    if(!Array.isArray(historyList)) historyList = [];
    renderHistory();
  }

  function saveHistoryItem(code, text){
    historyList.unshift({ id: Date.now(), time: new Date().toLocaleString('zh-CN'), code: code, text: text, lang: LANG });
    if(historyList.length > 100){ historyList = historyList.slice(0, 100); }
    try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(historyList)); }catch(e){}
    renderHistory();
  }

  function renderHistory(){
    var el = $('historyList');
    if(!historyList.length){
      el.innerHTML = '<div class="history-empty">还没有学习记录。到上方解释一段代码,记录会自动保存到这里。</div>';
      return;
    }
    el.innerHTML = historyList.map(function(h){
      var preview = (h.code || '').split('\n').slice(0, 2).join(' ').slice(0, 70);
      var tag = (h.lang === 'cpp') ? 'C++' : (h.lang === 'python' ? 'Python' : '');
      return '<div class="history-item" data-id="' + h.id + '">'
        + '<div class="history-meta"><span class="history-time">' + (tag ? '[' + tag + '] ' : '') + escapeHtml(h.time) + '</span>'
        + '<button class="history-del" data-del="' + h.id + '">删除</button></div>'
        + '<div class="history-preview">' + escapeHtml(preview) + '</div>'
        + '</div>';
    }).join('');
  }

  $('historyList').addEventListener('click', function(e){
    var del = e.target.closest('.history-del');
    if(del){
      e.stopPropagation();
      var id = parseInt(del.getAttribute('data-del'), 10);
      historyList = historyList.filter(function(h){ return h.id !== id; });
      try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(historyList)); }catch(err){}
      renderHistory();
      showToast('已删除该条记录');
      return;
    }
    var item = e.target.closest('.history-item');
    if(item){
      var id2 = parseInt(item.getAttribute('data-id'), 10);
      for(var i=0;i<historyList.length;i++){
        if(historyList[i].id === id2){
          var h = historyList[i];
          if(h.lang && LANGS[h.lang] && h.lang !== LANG){ switchLang(h.lang, true); }
          $('learnCode').value = h.code;
          updateLineNumbers();
          $('explainContent').innerHTML = renderMarkdown(h.text);
          showToast('已载入该条学习记录');
          $('explainContent').scrollIntoView({ behavior:'smooth' });
          return;
        }
      }
    }
  });

  $('clearHistoryBtn').addEventListener('click', function(){
    if(!historyList.length){ showToast('历史已经是空的'); return; }
    if(confirm('确定清空全部 ' + historyList.length + ' 条学习记录吗?此操作不可恢复(建议先导出备份)。')){
      historyList = [];
      try{ localStorage.removeItem(HISTORY_KEY); }catch(e){}
      renderHistory();
      showToast('历史已清空');
    }
  });

  $('exportHistoryBtn').addEventListener('click', function(){
    if(!historyList.length){ showToast('还没有学习记录可导出'); return; }
    var blob = new Blob([JSON.stringify(historyList, null, 2)], { type:'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'learn-history.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
    showToast('已导出 ' + historyList.length + ' 条学习记录');
  });

  $('importHistoryBtn').addEventListener('click', function(){ $('importHistoryFile').click(); });
  $('importHistoryFile').addEventListener('change', function(){
    var f = $('importHistoryFile').files && $('importHistoryFile').files[0];
    if(!f){ return; }
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var arr = JSON.parse(reader.result);
        if(!Array.isArray(arr)) throw new Error('格式不对');
        var ids = {};
        historyList.forEach(function(h){ ids[h.id] = true; });
        arr.forEach(function(h){
          if(h && h.code !== undefined && !ids[h.id]){ historyList.push(h); }
        });
        historyList.sort(function(a,b){ return (b.id || 0) - (a.id || 0); });
        if(historyList.length > 200){ historyList = historyList.slice(0, 200); }
        try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(historyList)); }catch(e){}
        renderHistory();
        showToast('已导入学习记录');
      }catch(e){
        showToast('导入失败:文件不是有效的学习记录', 'error');
      }
    };
    reader.readAsText(f);
    $('importHistoryFile').value = '';
  });

  /* ============================================================
   * 复制按钮(事件委托)
   * ============================================================ */
  root.addEventListener('click', function(e){
    var btn = e.target.closest('.copy-btn');
    if(!btn) return;
    var target = btn.getAttribute('data-copy');
    var text = '';
    if(target === 'local'){
      var el = root.querySelector('#result .result-code pre');
      text = el ? el.textContent : '';
    } else if(target === 'ai'){
      var el2 = root.querySelector('#aiResult .result-code pre');
      text = el2 ? el2.textContent : '';
    }
    copyText(text);
    btn.textContent = '已复制';
    setTimeout(function(){ btn.textContent = '复制'; }, 1500);
  });

  function copyText(text){
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).catch(function(){}); }
    else{
      var ta = document.createElement('textarea'); ta.value = text;
      document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); }catch(e){}
      document.body.removeChild(ta);
    }
  }

  /* ============================================================
   * 初始化
   * ============================================================ */
  // 读取上次选择的语言
  try{
    var savedLang = localStorage.getItem(LANG_KEY);
    if(savedLang && LANGS[savedLang]) LANG = savedLang;
  }catch(e){}

  ensureApiIntro();
  ensureProviderLinks();
  ensureModelPicker();
  ensureProfileCard();
  bindProfileEvents();
  loadSettings();
  loadProfiles();
  renderProviderGrid();
  refreshSettingsUI();
  applyLangUI();
  loadHistory();
  updateLineNumbers();
  pullProfilesFromServer();

  // 代码框为空时填入当前语言的示例,方便一打开就能试
  if($('learnCode') && !$('learnCode').value.trim()){ $('learnCode').value = langConf().learnSample; updateLineNumbers(); }
  if($('code') && !$('code').value.trim()){ $('code').value = langConf().samples.a; }

  // 语言切换按钮
  root.querySelectorAll('.lang-btn').forEach(function(b){
    b.addEventListener('click', function(){ switchLang(b.getAttribute('data-lang')); });
  });
  // 粘贴时自动识别语言
  autoDetectOnPaste($('code'));
  autoDetectOnPaste($('learnCode'));

  // 存储状态反馈
  try{
    if(configFromFile){
      showToast('已从 data 文件夹的 code-lab-config.js 恢复配置');
      if($('saveStatus')){ $('saveStatus').innerHTML = '<span style="color:var(--cl-good);font-weight:600">&#10003; 已从 data 文件夹的 code-lab-config.js 恢复配置</span>'; }
    } else {
      var hadSaved = !!JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').apiKey;
      if(hadSaved){ showToast('已自动载入上次保存的配置'); }
    }
  }catch(e){}


  try{ if(host.dataset) host.dataset.codeLabMounted = '1'; }catch(e){}
  var api = {
    LANGS: LANGS,
    getLANG: function(){ return LANG; },
    switchLang: switchLang,
    analyzeLocal: analyzeLocal,
    highlight: highlight,
    detectLang: detectLang,
    parseModelResponse: parseModelResponse,
    renderLocal: renderLocal,
    langConf: langConf,
    callLLM: callLLM,
    PROVIDER_PRESETS: PROVIDER_PRESETS,
    parseModelList: parseModelList,
    loadModels: loadModels,
    getCachedModels: getCachedModels,
    settings: settings,
    getProfiles: function(){ return profiles; },
    getActiveProfileId: function(){ return activeProfileId; },
    saveCurrentProfile: saveCurrentProfile,
    applyProfile: applyProfile,
    deleteSelectedProfile: deleteSelectedProfile
  };
  host.__codeLab = api;
  return api;
}

window.mountCodeLab = mountCodeLab;
})();
