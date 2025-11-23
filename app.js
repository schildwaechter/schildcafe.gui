const state = {
  config: null,
  trackedOrderId: '',
  currentOrder: null,
  pollTimer: null
};

const els = {
  apiBase: document.getElementById('api-base'),
  itemCount: document.getElementById('item-count'),
  menuGrid: document.getElementById('menu-grid'),
  orderLines: document.getElementById('order-lines'),
  addLine: document.getElementById('add-line'),
  orderForm: document.getElementById('order-form'),
  orderId: document.getElementById('order-id'),
  totalCount: document.getElementById('total-count'),
  orderAlert: document.getElementById('order-alert'),
  trackForm: document.getElementById('track-form'),
  trackId: document.getElementById('track-id'),
  statusBadge: document.getElementById('status-badge'),
  statusText: document.getElementById('status-text'),
  statusSub: document.getElementById('status-subtext'),
  progressFill: document.getElementById('progress-fill'),
  statusMeta: document.getElementById('status-meta'),
  retrieveBtn: document.getElementById('retrieve-btn'),
  heroStatus: document.getElementById('hero-status'),
  heroDetail: document.getElementById('hero-detail'),
  toast: document.getElementById('toast')
};

const formatTime = (value) => {
  if (!value || value === '0' || Number(value) === 0) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const showToast = (message) => {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 3000);
};

const setBadge = (text, tone = 'mint') => {
  els.statusBadge.textContent = text;
  if (tone === 'alert') {
    els.statusBadge.style.background = 'rgba(242, 93, 80, 0.12)';
    els.statusBadge.style.color = '#fcb1a7';
    els.statusBadge.style.borderColor = 'rgba(242, 93, 80, 0.3)';
  } else if (tone === 'neutral') {
    els.statusBadge.style.background = 'rgba(255, 255, 255, 0.1)';
    els.statusBadge.style.color = '#f5efe7';
    els.statusBadge.style.borderColor = 'rgba(255, 255, 255, 0.15)';
  } else {
    els.statusBadge.style.background = 'rgba(91, 211, 199, 0.12)';
    els.statusBadge.style.color = '#7ee1d8';
    els.statusBadge.style.borderColor = 'rgba(91, 211, 199, 0.25)';
  }
};

const renderMenuItems = (items) => {
  els.menuGrid.innerHTML = '';
  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'menu-card';
    card.innerHTML = `
      <div class="menu-title">${item.name}</div>
      <div class="menu-desc">${item.description || ''}</div>
      <div class="actions">
        <span class="badge soft">${item.id}</span>
        <button class="secondary" type="button">Add</button>
      </div>
    `;
    card.querySelector('button').addEventListener('click', () => addOrderLine(item.id, 1));
    els.menuGrid.appendChild(card);
  });
};

const addOrderLine = (productId, count = 1) => {
  if (!state.config?.items?.length) {
    showToast('Menu not loaded yet.');
    return;
  }
  const line = document.createElement('div');
  line.className = 'order-line';
  const select = document.createElement('select');
  state.config.items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    if (item.id === productId) option.selected = true;
    select.appendChild(option);
  });

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.value = String(count);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'ghost';
  remove.textContent = 'Remove';

  // Recalculate totals whenever the line changes.
  select.addEventListener('change', updateTotals);
  input.addEventListener('input', updateTotals);
  remove.addEventListener('click', () => {
    line.remove();
    updateTotals();
  });

  line.append(select, input, remove);
  els.orderLines.appendChild(line);
  updateTotals();
};

const updateTotals = () => {
  const lines = [...els.orderLines.querySelectorAll('.order-line')];
  const total = lines.reduce((sum, line) => {
    const qty = Number(line.querySelector('input').value) || 0;
    return sum + qty;
  }, 0);
  els.totalCount.textContent = total;
};

const readErrorMessage = async (res) => {
  try {
    const data = await res.json();
    const message = data?.body?.message || data?.message;
    return message || `Request failed (${res.status})`;
  } catch (err) {
    return `Request failed (${res.status})`;
  }
};

const submitOrder = async (event) => {
  event.preventDefault();
  if (!state.config) return;

  const lines = [...els.orderLines.querySelectorAll('.order-line')].map((line) => ({
    product: line.querySelector('select').value,
    count: Number(line.querySelector('input').value) || 0
  })).filter((entry) => entry.count > 0);

  if (!lines.length) {
    els.orderAlert.textContent = 'Add at least one product.';
    return;
  }

  els.orderAlert.textContent = '';
  const payload = { coffeeOrder: lines };
  const customId = els.orderId.value.trim();
  if (customId) payload.orderId = customId;

  try {
    const res = await fetch(`${state.config.apiBaseUrl}/submit-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const message = await readErrorMessage(res);
      els.orderAlert.textContent = message;
      showToast(message);
      return;
    }

    const text = await res.text();
    const orderId = text.replace(/"/g, '').trim();
    state.trackedOrderId = orderId;
    els.trackId.value = orderId;
    showToast(`Order submitted! Tracking ${orderId}`);
    startPolling(orderId);
  } catch (error) {
    const message = error?.message || 'Unable to submit order.';
    els.orderAlert.textContent = message;
    showToast(message);
  }
};

const interpretStage = (order) => {
  if (!order) {
    return { label: 'Not tracking', progress: 0.06, tone: 'neutral', sub: 'Submit or follow an order to begin.' };
  }

  const size = order.orderSize || 0;
  const brewed = order.orderBrewed || 0;
  const ready = order.orderReady && order.orderReady !== '0';
  const retrieved = order.orderRetrieved && order.orderRetrieved !== '0';

  if (retrieved) {
    return { label: 'Retrieved', progress: 1, tone: 'mint', sub: 'Enjoy your coffees! You may stop tracking.' };
  }
  if (ready) {
    return { label: 'Ready for pickup', progress: 0.95, tone: 'mint', sub: 'Head to the bar to retrieve your order.' };
  }
  if (brewed > 0 && size > 0) {
    const p = Math.min(0.2 + (brewed / size) * 0.6, 0.8);
    return { label: `Brewing ${brewed}/${size}`, progress: p, tone: 'neutral', sub: 'Barista is brewing your round.' };
  }
  return { label: 'Received', progress: 0.18, tone: 'neutral', sub: 'Order accepted, waiting to start.' };
};

const renderOrderStatus = (order) => {
  const stage = interpretStage(order);
  setBadge(stage.label, stage.tone === 'mint' ? 'mint' : 'neutral');
  els.statusText.textContent = stage.label;
  els.statusSub.textContent = stage.sub;
  els.progressFill.style.width = `${Math.max(stage.progress * 100, 6)}%`;
  els.heroStatus.textContent = stage.label;
  els.heroDetail.textContent = stage.sub;

  const meta = [
    { label: 'Order ID', value: order?.orderId || '—' },
    { label: 'Received', value: formatTime(order?.orderReceived) },
    { label: 'Brewed', value: `${order?.orderBrewed ?? 0}/${order?.orderSize ?? 0}` },
    { label: 'Ready at', value: formatTime(order?.orderReady) },
    { label: 'Retrieved', value: formatTime(order?.orderRetrieved) }
  ];

  els.statusMeta.innerHTML = meta.map((entry) => `
    <div>
      <div class="meta-label">${entry.label}</div>
      <div class="meta-value">${entry.value}</div>
    </div>
  `).join('');

  els.retrieveBtn.disabled = !(order && stage.label.startsWith('Ready'));
};

const fetchStatus = async () => {
  if (!state.trackedOrderId || !state.config) return;
  try {
    const res = await fetch(`${state.config.apiBaseUrl}/order-list`);
    if (!res.ok) {
      const message = await readErrorMessage(res);
      setBadge('Error', 'alert');
      els.statusText.textContent = message;
      els.statusSub.textContent = 'Could not read order list.';
      els.heroStatus.textContent = 'Error';
      els.heroDetail.textContent = message;
      showToast(message);
      return;
    }
    const data = await res.json();
    const found = Array.isArray(data?.data)
      ? data.data.find((entry) => entry.orderId === state.trackedOrderId)
      : null;

    if (!found) {
      setBadge('Not found', 'alert');
      els.statusText.textContent = 'Order not in queue.';
      els.statusSub.textContent = 'Ensure the ID is correct or re-submit.';
      els.heroStatus.textContent = 'Order not found';
      els.heroDetail.textContent = 'Check the ID or submit a new round.';
      els.progressFill.style.width = '6%';
      els.statusMeta.innerHTML = '';
      state.currentOrder = null;
      return;
    }

    state.currentOrder = found;
    renderOrderStatus(found);
  } catch (error) {
    setBadge('Offline', 'alert');
    els.statusText.textContent = 'Network issue';
    els.statusSub.textContent = 'Unable to reach Servitor.';
    els.heroStatus.textContent = 'Offline';
    els.heroDetail.textContent = 'Check connectivity to the Servitor.';
  }
};

const startPolling = (orderId) => {
  state.trackedOrderId = orderId;
  state.currentOrder = null;
  renderOrderStatus(state.currentOrder);
  clearInterval(state.pollTimer);
  const interval = state.config?.pollIntervalMs || 4500;
  // Polling keeps users informed without needing manual refreshes.
  state.pollTimer = setInterval(fetchStatus, interval);
  fetchStatus();
};

const retrieveOrder = async () => {
  if (!state.trackedOrderId || !state.config) return;
  try {
    const res = await fetch(`${state.config.apiBaseUrl}/retrieve-order/${encodeURIComponent(state.trackedOrderId)}`);
    if (!res.ok) {
      const message = await readErrorMessage(res);
      showToast(message);
      return;
    }
    const data = await res.json();
    state.currentOrder = data;
    renderOrderStatus(data);
    showToast('Order retrieved. Thank you!');
  } catch (error) {
    showToast('Unable to retrieve order right now.');
  }
};

const loadConfig = async () => {
  try {
    const res = await fetch('config.json');
    const data = await res.json();
    state.config = data;
    els.apiBase.textContent = data.apiBaseUrl;
    els.itemCount.textContent = `${data.items?.length || 0} menu item(s)`;
    renderMenuItems(data.items || []);
    if ((data.items || []).length) {
      addOrderLine(data.items[0].id, 1);
    }
  } catch (error) {
    els.apiBase.textContent = 'config.json missing';
    showToast('Unable to load config.json');
  }
};

const init = () => {
  els.addLine.addEventListener('click', () => {
    if (!state.config?.items?.length) {
      showToast('Load config before adding items.');
      return;
    }
    addOrderLine(state.config.items[0].id);
  });
  els.orderForm.addEventListener('submit', submitOrder);
  els.trackForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = els.trackId.value.trim();
    if (!id) return;
    startPolling(id);
  });
  els.retrieveBtn.addEventListener('click', retrieveOrder);
  loadConfig();
};

init();
