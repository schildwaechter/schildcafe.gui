// Application state
let config = null;
let availableItems = [];
let apiBaseUrl = '';
let activeOrders = new Map(); // Map of orderId -> order object
let pollingIntervals = new Map(); // Map of orderId -> interval ID

// Initialize the application
async function init() {
    try {
        // Load configuration
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error('Failed to load configuration');
        }
        config = await response.json();
        apiBaseUrl = config.apiBaseUrl;
        availableItems = config.availableItems;

        // Set up event listeners
        setupEventListeners();

        // Add initial order item
        addOrderItem();

        // Load active orders
        loadActiveOrders();
    } catch (error) {
        showToast('Failed to initialize application: ' + error.message, 'error');
        console.error('Initialization error:', error);
    }
}

// Set up all event listeners
function setupEventListeners() {
    // Add item button
    document.getElementById('add-item-btn').addEventListener('click', addOrderItem);

    // Submit order form
    document.getElementById('order-form').addEventListener('submit', handleSubmitOrder);

    // Track order button
    document.getElementById('track-order-btn').addEventListener('click', handleTrackOrder);

    // Allow Enter key in track order input
    document.getElementById('track-order-id').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleTrackOrder();
        }
    });
}

// Add a new order item row
function addOrderItem() {
    const orderItemsContainer = document.getElementById('order-items');
    const itemDiv = document.createElement('div');
    itemDiv.className = 'order-item';
    itemDiv.innerHTML = `
        <select class="product-select" required>
            <option value="">Select a product...</option>
            ${availableItems.map(item =>
                `<option value="${item.name}">${item.name} - ${item.description}</option>`
            ).join('')}
        </select>
        <input type="number" class="quantity-input" min="1" value="1" required>
        <button type="button" class="remove-item-btn">Remove</button>
    `;

    // Add remove button functionality
    itemDiv.querySelector('.remove-item-btn').addEventListener('click', () => {
        itemDiv.remove();
    });

    orderItemsContainer.appendChild(itemDiv);
}

// Handle order submission
async function handleSubmitOrder(e) {
    e.preventDefault();

    const orderItems = document.querySelectorAll('.order-item');
    const coffeeOrder = [];

    // Validate and collect order items
    for (const item of orderItems) {
        const product = item.querySelector('.product-select').value;
        const count = parseInt(item.querySelector('.quantity-input').value);

        if (!product || count < 1) {
            showToast('Please fill in all order items correctly', 'error');
            return;
        }

        coffeeOrder.push({ product, count });
    }

    if (coffeeOrder.length === 0) {
        showToast('Please add at least one item to your order', 'error');
        return;
    }

    // Disable submit button
    const submitBtn = document.getElementById('submit-order-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading"></span> Submitting...';

    try {
        const response = await fetch(`${apiBaseUrl}/submit-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ coffeeOrder }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const orderId = await response.text();
        showToast(`Order submitted successfully! Order ID: ${orderId}`, 'success');

        // Reset form
        document.getElementById('order-items').innerHTML = '';
        addOrderItem();

        // Load the new order and start tracking
        await loadOrderById(orderId);
        startOrderPolling(orderId);

    } catch (error) {
        showToast('Failed to submit order: ' + error.message, 'error');
        console.error('Order submission error:', error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Order';
    }
}

// Load order by ID
async function loadOrderById(orderId) {
    try {
        const response = await fetch(`${apiBaseUrl}/retrieve-order/${orderId}`);

        if (response.status === 404) {
            showToast('Order not found', 'error');
            return null;
        }

        if (response.status === 410) {
            // Order already delivered
            const order = await response.json();
            activeOrders.set(orderId, order);
            updateActiveOrdersDisplay();
            showToast('Order has already been retrieved', 'warning');
            return order;
        }

        if (response.status === 503) {
            // Order not ready yet - this is expected, we'll track it
            // Try to get order info from order-list instead
            await loadActiveOrders();
            return null;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const order = await response.json();
        activeOrders.set(orderId, order);
        updateActiveOrdersDisplay();
        return order;

    } catch (error) {
        showToast('Failed to load order: ' + error.message, 'error');
        console.error('Load order error:', error);
        return null;
    }
}

// Handle track order button click
async function handleTrackOrder() {
    const orderIdInput = document.getElementById('track-order-id');
    const orderId = orderIdInput.value.trim();

    if (!orderId) {
        showToast('Please enter an order ID', 'error');
        return;
    }

    const trackedOrderDiv = document.getElementById('tracked-order');
    trackedOrderDiv.innerHTML = '<p>Loading...</p>';

    const order = await loadOrderById(orderId);

    if (order) {
        displayTrackedOrder(order);
        startOrderPolling(orderId);
    } else {
        // Try to get from order-list
        await loadActiveOrders();
        const orderFromList = activeOrders.get(orderId);
        if (orderFromList) {
            displayTrackedOrder(orderFromList);
            startOrderPolling(orderId);
        } else {
            trackedOrderDiv.innerHTML = '<div class="empty-state">Order not found</div>';
        }
    }
}

// Display tracked order details
function displayTrackedOrder(order) {
    const trackedOrderDiv = document.getElementById('tracked-order');
    const status = getOrderStatus(order);
    const progress = calculateProgress(order);

    trackedOrderDiv.innerHTML = `
        <div class="order-card">
            <div class="order-card-header">
                <span class="order-id">Order: ${order.orderId}</span>
                <span class="order-status status-${status}">${status}</span>
            </div>
            <div class="order-details">
                <div class="order-detail-item">
                    <strong>Total Items:</strong>
                    ${order.orderSize}
                </div>
                <div class="order-detail-item">
                    <strong>Brewed:</strong>
                    ${order.orderBrewed || 0}
                </div>
                <div class="order-detail-item">
                    <strong>Received:</strong>
                    ${formatTimestamp(order.orderReceived)}
                </div>
                ${order.orderReady ? `
                <div class="order-detail-item">
                    <strong>Ready:</strong>
                    ${formatTimestamp(order.orderReady)}
                </div>
                ` : ''}
                ${order.orderRetrieved ? `
                <div class="order-detail-item">
                    <strong>Retrieved:</strong>
                    ${formatTimestamp(order.orderRetrieved)}
                </div>
                ` : ''}
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            ${order.orderReady && !order.orderRetrieved ? `
            <div style="margin-top: 15px;">
                <button class="btn btn-success" onclick="retrieveOrder('${order.orderId}')">
                    Retrieve Order
                </button>
            </div>
            ` : ''}
        </div>
    `;
}

// Retrieve an order (mark as delivered)
async function retrieveOrder(orderId) {
    try {
        const response = await fetch(`${apiBaseUrl}/retrieve-order/${orderId}`);

        if (response.status === 404) {
            showToast('Order not found', 'error');
            return;
        }

        if (response.status === 410) {
            showToast('Order has already been retrieved', 'warning');
            await loadOrderById(orderId);
            return;
        }

        if (response.status === 503) {
            showToast('Order is not ready yet', 'warning');
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const order = await response.json();
        activeOrders.set(orderId, order);
        updateActiveOrdersDisplay();

        // Update tracked order if it's the same one
        const trackedOrderId = document.getElementById('track-order-id').value.trim();
        if (trackedOrderId === orderId) {
            displayTrackedOrder(order);
        }

        showToast('Order retrieved successfully!', 'success');
        stopOrderPolling(orderId);

    } catch (error) {
        showToast('Failed to retrieve order: ' + error.message, 'error');
        console.error('Retrieve order error:', error);
    }
}

// Load all active orders
async function loadActiveOrders() {
    try {
        const response = await fetch(`${apiBaseUrl}/order-list`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        // Handle different response formats: { orders: [...] } or array directly
        let orders = [];
        if (Array.isArray(data)) {
            orders = data;
        } else if (data.orders && Array.isArray(data.orders)) {
            orders = data.orders;
        } else if (typeof data === 'object') {
            // Handle case where orders might be in additionalProperties
            orders = Object.values(data).find(val => Array.isArray(val)) || [];
        }

        // Update active orders map
        orders.forEach(order => {
            activeOrders.set(order.orderId, order);
            // Start polling if not already polling
            if (!pollingIntervals.has(order.orderId) && !order.orderRetrieved) {
                startOrderPolling(order.orderId);
            }
        });

        updateActiveOrdersDisplay();

    } catch (error) {
        console.error('Load active orders error:', error);
        // Don't show toast for this as it's called automatically
    }
}

// Update the active orders display
function updateActiveOrdersDisplay() {
    const activeOrdersDiv = document.getElementById('active-orders');

    if (activeOrders.size === 0) {
        activeOrdersDiv.innerHTML = '<div class="empty-state">No active orders</div>';
        return;
    }

    const ordersArray = Array.from(activeOrders.values())
        .filter(order => !order.orderRetrieved) // Only show non-retrieved orders
        .sort((a, b) => new Date(b.orderReceived) - new Date(a.orderReceived));

    if (ordersArray.length === 0) {
        activeOrdersDiv.innerHTML = '<div class="empty-state">No active orders</div>';
        return;
    }

    activeOrdersDiv.innerHTML = ordersArray.map(order => {
        const status = getOrderStatus(order);
        const progress = calculateProgress(order);

        return `
            <div class="order-card">
                <div class="order-card-header">
                    <span class="order-id">${order.orderId}</span>
                    <span class="order-status status-${status}">${status}</span>
                </div>
                <div class="order-details">
                    <div class="order-detail-item">
                        <strong>Items:</strong>
                        ${order.orderBrewed || 0} / ${order.orderSize} brewed
                    </div>
                    <div class="order-detail-item">
                        <strong>Received:</strong>
                        ${formatTimestamp(order.orderReceived)}
                    </div>
                    ${order.orderReady ? `
                    <div class="order-detail-item">
                        <strong>Ready:</strong>
                        ${formatTimestamp(order.orderReady)}
                    </div>
                    ` : ''}
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
                ${order.orderReady ? `
                <div style="margin-top: 15px;">
                    <button class="btn btn-success" onclick="retrieveOrder('${order.orderId}')">
                        Retrieve Order
                    </button>
                </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Start polling for order status updates
function startOrderPolling(orderId) {
    // Don't start polling if already polling or if order is retrieved
    if (pollingIntervals.has(orderId)) {
        return;
    }

    const order = activeOrders.get(orderId);
    if (order && order.orderRetrieved) {
        return;
    }

    // Poll every 3 seconds
    const interval = setInterval(async () => {
        const order = activeOrders.get(orderId);
        if (order && order.orderRetrieved) {
            stopOrderPolling(orderId);
            return;
        }

        // Try to get order from order-list (doesn't mark as retrieved)
        try {
            const response = await fetch(`${apiBaseUrl}/order-list`);
            if (response.ok) {
                const data = await response.json();
                // Handle different response formats
                let orders = [];
                if (Array.isArray(data)) {
                    orders = data;
                } else if (data.orders && Array.isArray(data.orders)) {
                    orders = data.orders;
                } else if (typeof data === 'object') {
                    orders = Object.values(data).find(val => Array.isArray(val)) || [];
                }
                const updatedOrder = orders.find(o => o.orderId === orderId);

                if (updatedOrder) {
                    activeOrders.set(orderId, updatedOrder);
                    updateActiveOrdersDisplay();

                    // Update tracked order if it's the same one
                    const trackedOrderId = document.getElementById('track-order-id').value.trim();
                    if (trackedOrderId === orderId) {
                        displayTrackedOrder(updatedOrder);
                    }

                    // Stop polling if order is retrieved
                    if (updatedOrder.orderRetrieved) {
                        stopOrderPolling(orderId);
                    }
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 3000);

    pollingIntervals.set(orderId, interval);
}

// Stop polling for an order
function stopOrderPolling(orderId) {
    const interval = pollingIntervals.get(orderId);
    if (interval) {
        clearInterval(interval);
        pollingIntervals.delete(orderId);
    }
}

// Get order status
function getOrderStatus(order) {
    if (order.orderRetrieved) {
        return 'retrieved';
    }
    if (order.orderReady) {
        return 'ready';
    }
    if (order.orderBrewed > 0) {
        return 'brewing';
    }
    return 'pending';
}

// Calculate progress percentage
function calculateProgress(order) {
    if (order.orderSize === 0) {
        return 0;
    }
    return Math.round((order.orderBrewed || 0) / order.orderSize * 100);
}

// Format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) {
        return 'N/A';
    }
    const date = new Date(timestamp);
    return date.toLocaleString();
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Make retrieveOrder available globally for onclick handlers
window.retrieveOrder = retrieveOrder;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
