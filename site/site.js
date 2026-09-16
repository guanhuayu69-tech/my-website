document.documentElement.classList.add('motion-ready');

const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.main-nav');
const header = document.querySelector('.site-header');
const progress = document.querySelector('.scroll-progress i');
const toast = document.querySelector('#site-toast');

let toastTimer;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function updatePagePosition() {
  const top = window.scrollY || document.documentElement.scrollTop;
  const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  header?.classList.toggle('is-scrolled', top > 24);
  if (progress) progress.style.width = `${Math.min(100, (top / total) * 100)}%`;
}

updatePagePosition();
window.addEventListener('scroll', updatePagePosition, { passive: true });

toggle?.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  toggle.setAttribute('aria-expanded', String(open));
});

nav?.addEventListener('click', () => {
  document.body.classList.remove('nav-open');
  toggle?.setAttribute('aria-expanded', 'false');
});

const chat = {
  form: document.querySelector('#chat-form'),
  input: document.querySelector('#detail'),
  send: document.querySelector('#chat-form button'),
  log: document.querySelector('#chat-log'),
  status: document.querySelector('#chat-status'),
  counter: document.querySelector('#turn-count'),
  consent: document.querySelector('#privacy-consent'),
  limit: document.querySelector('#consult-limit'),
  copy: document.querySelector('#copy-wechat'),
  retry: document.querySelector('#chat-retry'),
  charCount: document.querySelector('#char-count'),
  chipGroup: document.querySelector('.symptom-chips'),
  chips: [...document.querySelectorAll('.symptom-chips button')]
};

const STORAGE_KEY = 'pujiantang-health-chat-v1';
const MAX_TURNS = 8;
let busy = false;
let retryText = '';
let state = { turns: 0, history: [], limited: false };

try {
  const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && Array.isArray(saved.history)) {
    state = {
      turns: Math.min(MAX_TURNS, Math.max(0, Number(saved.turns) || 0)),
      history: saved.history
        .filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item?.content === 'string')
        .slice(-16),
      limited: Boolean(saved.limited)
    };
  }
} catch {
  // Browsers that block session storage can still use the consultation normally.
}

function saveState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Conversation remains usable when storage is unavailable.
  }
}

function addMessage(role, content, options = {}) {
  if (!chat.log || !content) return null;
  const message = document.createElement('div');
  message.className = `bubble ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  if (options.emergency) message.classList.add('emergency-message');
  if (options.summary) message.classList.add('summary-message');
  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = role === 'user' ? '你' : options.summary ? '阶段总结' : '普健堂 AI 就诊助手';
  const text = document.createElement('span');
  text.textContent = content;
  message.append(label, text);
  chat.log.append(message);
  chat.log.scrollTop = chat.log.scrollHeight;
  return message;
}

function setStatus(text, type = '') {
  if (!chat.status) return;
  chat.status.textContent = text;
  chat.status.className = `chat-status${type ? ` ${type}` : ''}`;
}

function updateCounter(turns) {
  const remaining = Math.max(0, MAX_TURNS - turns);
  chat.log?.classList.toggle('is-initial', turns === 0);
  if (chat.chipGroup) chat.chipGroup.hidden = turns > 0;
  if (chat.counter) {
    chat.counter.textContent = turns >= 6 ? `还可发送 ${remaining} 条` : (turns ? '咨询进行中' : '可以开始');
  }
  if (!remaining) {
    setStatus('本次咨询已完成，阶段总结见上方', 'complete');
  } else if (remaining <= 2) {
    setStatus(`接近本次会话结束，还可发送 ${remaining} 条`);
  } else {
    setStatus('可以继续交流');
  }
}

function setBusy(nextBusy) {
  busy = nextBusy;
  const locked = state.limited || state.turns >= MAX_TURNS;
  if (chat.input) chat.input.disabled = nextBusy || locked;
  if (chat.send) chat.send.disabled = nextBusy || locked;
  chat.chips.forEach((button) => { button.disabled = nextBusy || locked; });
  if (nextBusy) setStatus('正在认真梳理你的情况', 'loading');
}

function showLimit() {
  state.limited = true;
  saveState();
  if (chat.limit) chat.limit.hidden = false;
  setBusy(false);
  updateCounter(MAX_TURNS);
}

if (state.history.length) {
  state.history.forEach((item, index) => {
    const isLast = index === state.history.length - 1;
    addMessage(item.role, item.content, { summary: isLast && state.limited && item.role === 'assistant' });
  });
}
updateCounter(state.turns);
if (state.limited || state.turns >= MAX_TURNS) showLimit();

chat.chips.forEach((button) => {
  button.addEventListener('click', () => {
    if (!chat.input || busy || state.limited) return;
    chat.chips.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    chat.input.value = button.dataset.prompt || button.textContent.trim();
    chat.input.focus();
  });
});

chat.input?.addEventListener('input', () => {
  chat.input.style.height = 'auto';
  chat.input.style.height = `${Math.min(chat.input.scrollHeight, 96)}px`;
  if (chat.charCount) chat.charCount.textContent = `${chat.input.value.length} / 1200`;
});

chat.input?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    chat.form?.requestSubmit();
  }
});

chat.form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = chat.input?.value.trim();
  if (!message || busy) return;
  if (state.limited || state.turns >= MAX_TURNS) {
    showLimit();
    return;
  }
  if (!chat.consent?.checked) {
    setStatus('请先勾选隐私提示，再发送咨询内容', 'error');
    chat.consent?.focus();
    return;
  }

  const priorHistory = state.history.slice(-14);
  addMessage('user', message);
  chat.log?.classList.remove('is-initial');
  if (chat.chipGroup) chat.chipGroup.hidden = true;
  chat.input.value = '';
  chat.input.style.height = 'auto';
  if (chat.charCount) chat.charCount.textContent = '0 / 1200';
  retryText = '';
  if (chat.retry) chat.retry.hidden = true;
  setBusy(true);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ message, history: priorHistory }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && !data.limitReached) {
      throw new Error(data.error || '服务暂时无法回复，请稍后再试。');
    }

    const reply = data.reply || '本次咨询已达到 8 条消息，请添加微信 dannyyuguanhua 继续沟通。';
    const turn = Math.min(MAX_TURNS, Math.max(state.turns, Number(data.turn) || state.turns));
    addMessage('assistant', reply, { emergency: Boolean(data.emergency), summary: Boolean(data.limitReached) });
    state.turns = turn;
    state.history.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
    state.history = state.history.slice(-16);
    state.limited = Boolean(data.limitReached) || turn >= MAX_TURNS;
    saveState();
    if (state.limited) showLimit();
    else updateCounter(state.turns);
  } catch (error) {
    retryText = message;
    if (chat.retry) chat.retry.hidden = false;
    const messageText = error.name === 'AbortError'
      ? '回复等待时间较长，请稍后重新发送。刚才这条不会计入 8 次咨询。'
      : (error.message || '服务暂时无法回复，请稍后再试。');
    setStatus(messageText, 'error');
  } finally {
    clearTimeout(timeout);
    setBusy(false);
    if (!state.limited && state.turns < MAX_TURNS && !chat.status?.classList.contains('error')) {
      updateCounter(state.turns);
    }
  }
});

chat.retry?.addEventListener('click', () => {
  if (!chat.input || !retryText || busy || state.limited) return;
  chat.input.value = retryText;
  chat.input.dispatchEvent(new Event('input'));
  retryText = '';
  chat.retry.hidden = true;
  chat.input.focus();
});

async function copyWechat() {
  try {
    await navigator.clipboard.writeText('dannyyuguanhua');
    if (chat.copy) chat.copy.textContent = '已复制微信号';
    showToast('微信号 dannyyuguanhua 已复制');
    setTimeout(() => { if (chat.copy) chat.copy.textContent = '复制微信号'; }, 1800);
  } catch {
    const wechat = document.querySelector('#wechat-id');
    const selection = window.getSelection();
    const range = document.createRange();
    if (wechat && selection) {
      range.selectNodeContents(wechat);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    showToast('请长按复制微信号：dannyyuguanhua');
  }
}

document.querySelectorAll('[data-copy-wechat]').forEach((button) => {
  button.addEventListener('click', copyWechat);
});
chat.copy?.addEventListener('click', copyWechat);

document.querySelectorAll('[data-consult-prefill]').forEach((link) => {
  link.addEventListener('click', () => {
    if (!chat.input || state.limited) return;
    chat.input.value = link.dataset.consultPrefill || '';
    chat.input.dispatchEvent(new Event('input'));
    setTimeout(() => chat.input?.focus(), 450);
  });
});

const queryPrefills = {
  sleep: '我最近睡眠状态不太好，想请你帮我梳理。',
  fatigue: '我最近总是疲倦乏力，想请你帮我梳理。',
  digestion: '我最近有脾胃不适，想请你帮我梳理。',
  stress: '我最近情绪压力比较大，也有一些身体不适。',
  family: '我想为家人做长期健康管理，请先帮我梳理需要了解的情况。',
  seasonal: '我想了解适合自己的节气与日常养护方向。'
};

const requestedPrefill = new URLSearchParams(window.location.search).get('consult');
if (chat.input && !state.limited && requestedPrefill && queryPrefills[requestedPrefill] && !chat.input.value) {
  chat.input.value = queryPrefills[requestedPrefill];
  chat.input.dispatchEvent(new Event('input'));
}

const consultSection = document.querySelector('#consult');
if ('IntersectionObserver' in window && consultSection) {
  const consultObserver = new IntersectionObserver(([entry]) => {
    document.body.classList.toggle('consult-visible', entry.isIntersecting);
  }, { threshold: 0.08 });
  consultObserver.observe(consultSection);
}

const revealItems = [...document.querySelectorAll('.reveal')];
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const navLinks = [...document.querySelectorAll('.main-nav a[href^="#"]')];
const navSections = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);
if ('IntersectionObserver' in window && navSections.length) {
  const navObserver = new IntersectionObserver((entries) => {
    const current = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!current) return;
    navLinks.forEach((link) => {
      const active = link.getAttribute('href') === `#${current.target.id}`;
      if (active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-20% 0px -62% 0px', threshold: [0.01, 0.2, 0.5] });
  navSections.forEach((section) => navObserver.observe(section));
}
